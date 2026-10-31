import { Decimal8 } from '@app/decimal';
import type { StrategyBar } from '@app/market-data';
import {
  AFTERNOON_END_MIN,
  AFTERNOON_START_MIN,
  MORNING_END_MIN,
  MORNING_START_MIN,
  getShanghaiHourAndMinute,
} from '@app/timezone';

export const DAILY_EXPECTED_BUCKETS = 242; // [09:30,11:31) ∪ [13:00,15:01)

export function sumBarQuantity(
  bars: readonly StrategyBar[],
  field: 'volume' | 'amount',
): string | null {
  let total = Decimal8.ZERO;
  for (const bar of bars) {
    const value = bar[field];
    if (value === null) return null;
    total = total.add(Decimal8.parseCanonical(value));
  }
  return total.formatCanonical();
}

export function resolveSessionPosition(
  timestamp: Date,
  subject = 'observation or trigger',
): {
  sessionStartMs: number;
  minuteOffset: number;
} {
  const timestampMs = timestamp.getTime();
  if (!Number.isFinite(timestampMs) || timestampMs % 60_000 !== 0) {
    throw new TypeError(`${subject} must be minute-aligned`);
  }
  const { wallMinute } = getShanghaiHourAndMinute(timestamp);
  const sessionStartWall =
    wallMinute >= MORNING_START_MIN && wallMinute < MORNING_END_MIN
      ? MORNING_START_MIN
      : wallMinute >= AFTERNOON_START_MIN && wallMinute < AFTERNOON_END_MIN
        ? AFTERNOON_START_MIN
        : null;
  if (sessionStartWall === null) {
    throw new RangeError(`${subject} is outside A-share sessions`);
  }
  const minuteOffset = wallMinute - sessionStartWall;
  return {
    sessionStartMs: timestampMs - minuteOffset * 60_000,
    minuteOffset,
  };
}

/** 给定时刻所在上海日期的零点（UTC+8 固定偏移）。 */
export function shanghaiMidnightOf(timestamp: Date): Date {
  const shifted = new Date(timestamp.getTime() + 8 * 60 * 60 * 1000);
  const utcMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(utcMidnight - 8 * 60 * 60 * 1000);
}

export function reduceSlot(
  securityId: number,
  source: StrategyBar['source'],
  period: number,
  slotStartMs: number,
  buckets: Map<number, StrategyBar>,
  securityCode?: string,
): StrategyBar | null {
  if (buckets.size === 0) return null;
  const slotEndMs = slotStartMs + period * 60_000;
  const ordered = [...buckets.values()].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  const first = ordered[0];
  const last = ordered.at(-1)!;
  // 完整性只按常规成分判：终端桶（左标恰等于槽末）缺席不影响 complete
  const regularPresent = [...buckets.keys()].filter(
    (ts) => ts < slotEndMs,
  ).length;
  return Object.freeze({
    securityId,
    securityCode: securityCode ?? first.securityCode,
    source,
    period,
    timestamp: new Date(slotEndMs),
    open: first.open,
    high: Math.max(...ordered.map((bar) => bar.high)),
    low: Math.min(...ordered.map((bar) => bar.low)),
    close: last.close,
    volume: sumBarQuantity(ordered, 'volume'),
    amount: sumBarQuantity(ordered, 'amount'),
    type: regularPresent === period ? 'complete' : 'incomplete',
  });
}

export function reduceDaily(
  securityId: number,
  source: StrategyBar['source'],
  tradingDayMs: number,
  buckets: Map<number, StrategyBar>,
  securityCode?: string,
): StrategyBar | null {
  if (buckets.size === 0) return null;
  const ordered = [...buckets.values()].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  const first = ordered[0];
  const last = ordered.at(-1)!;
  return Object.freeze({
    securityId,
    securityCode: securityCode ?? first.securityCode,
    source,
    period: 1440,
    timestamp: new Date(tradingDayMs),
    open: first.open,
    high: Math.max(...ordered.map((bar) => bar.high)),
    low: Math.min(...ordered.map((bar) => bar.low)),
    close: last.close,
    volume: sumBarQuantity(ordered, 'volume'),
    amount: sumBarQuantity(ordered, 'amount'),
    type: buckets.size === DAILY_EXPECTED_BUCKETS ? 'complete' : 'incomplete',
  });
}
