import type { StrategyBar } from '@app/market-data';
import { Decimal8 } from '@app/decimal';
import { availabilityKey } from '../availability';
import {
  AFTERNOON_END_MIN,
  AFTERNOON_START_MIN,
  MORNING_END_MIN,
  MORNING_START_MIN,
  getShanghaiHourAndMinute,
} from '@app/timezone';

/**
 * 从左标 1m 桶批量派生右标周期 bar（hydration/重启补齐用）。
 *
 * 语义必须与增量 `RealtimePeriodBuilder` 逐 trigger 闭合的结果逐根一致：
 * - 归属：事件时间 [S, S+period) 内的桶（左标 ∈ [S, S+period)）属于槽 S；
 * - 标签：右标 = S + period；session 末根吸收终端桶（11:30/15:00，左标恰等于槽末）
 *   作为可选成分，闭合于终端桶；
 * - 完整性：只按常规成分根数判（终端桶缺席不标 incomplete）；
 * - 日线（1440）：当日全部桶聚合，标签 00:00(D)，complete 当且仅当 242 桶齐；
 * - 因果过滤：availabilityKey(bar) < anchorAvailabilityMs 时才输出（进行中 slot
 *   与将在当前触发闭合的 bar 不得注入——它们由增量 builder 现场闭合）。
 */
export function deriveRightLabeledPeriodBars(
  oneMinuteBars: readonly StrategyBar[],
  period: 5 | 15 | 30 | 60 | 1440,
  options?: { readonly anchorAvailabilityMs?: number },
): StrategyBar[] {
  const anchorAvailabilityMs =
    options?.anchorAvailabilityMs ?? Number.POSITIVE_INFINITY;
  if (period === 1440) {
    return [deriveDaily(oneMinuteBars)].filter(
      (bar): bar is StrategyBar =>
        bar !== null && availabilityKey(bar).getTime() < anchorAvailabilityMs,
    );
  }

  const slots = new Map<number, Map<number, StrategyBar>>();
  for (const bar of oneMinuteBars) {
    let position;
    try {
      position = sessionPositionOf(bar.timestamp);
    } catch {
      // 15:01/15:02 死桶等 session 外 bar 跳过（volume 恒 0，无行情损失）
      continue;
    }
    const slotOffset = Math.floor(position.minuteOffset / period) * period;
    const slotStartMs = position.sessionStartMs + slotOffset * 60_000;
    const bucket = slots.get(slotStartMs) ?? new Map<number, StrategyBar>();
    bucket.set(bar.timestamp.getTime(), bar);
    slots.set(slotStartMs, bucket);
  }

  const derived: StrategyBar[] = [];
  for (const [slotStartMs, buckets] of slots) {
    const bar = reduceSlot(slotStartMs, period, buckets);
    if (!bar) continue;
    if (availabilityKey(bar).getTime() < anchorAvailabilityMs) {
      derived.push(bar);
    }
  }
  return derived.sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
}

/** 日线聚合：无 15:00 终端桶（当日未闭合/全 discarded）时不产出。 */
function deriveDaily(
  oneMinuteBars: readonly StrategyBar[],
): StrategyBar | null {
  if (oneMinuteBars.length === 0) return null;
  const buckets = new Map<number, StrategyBar>();
  for (const bar of oneMinuteBars) buckets.set(bar.timestamp.getTime(), bar);
  const ordered = [...buckets.values()].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  const first = ordered[0];
  const last = ordered.at(-1)!;
  const tradingDayMs = shanghaiMidnight(last.timestamp).getTime();
  return Object.freeze({
    securityId: first.securityId,
    securityCode: first.securityCode,
    source: first.source,
    period: 1440,
    timestamp: new Date(tradingDayMs),
    open: first.open,
    high: Math.max(...ordered.map((bar) => bar.high)),
    low: Math.min(...ordered.map((bar) => bar.low)),
    close: last.close,
    volume: sumQuantity(ordered, 'volume'),
    amount: sumQuantity(ordered, 'amount'),
    type: buckets.size === 242 ? 'complete' : 'incomplete',
  });
}

function reduceSlot(
  slotStartMs: number,
  period: number,
  buckets: Map<number, StrategyBar>,
): StrategyBar | null {
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
    securityId: first.securityId,
    securityCode: first.securityCode,
    source: first.source,
    period,
    timestamp: new Date(slotEndMs),
    open: first.open,
    high: Math.max(...ordered.map((bar) => bar.high)),
    low: Math.min(...ordered.map((bar) => bar.low)),
    close: last.close,
    volume: sumQuantity(ordered, 'volume'),
    amount: sumQuantity(ordered, 'amount'),
    type: regularPresent === period ? 'complete' : 'incomplete',
  });
}

function sumQuantity(
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

function sessionPositionOf(timestamp: Date): {
  sessionStartMs: number;
  minuteOffset: number;
} {
  if (timestamp.getTime() % 60_000 !== 0) {
    throw new TypeError('sealed bar must be minute-aligned');
  }
  const { wallMinute } = getShanghaiHourAndMinute(timestamp);
  const sessionStartWall =
    wallMinute >= MORNING_START_MIN && wallMinute < MORNING_END_MIN
      ? MORNING_START_MIN
      : wallMinute >= AFTERNOON_START_MIN && wallMinute < AFTERNOON_END_MIN
        ? AFTERNOON_START_MIN
        : null;
  if (sessionStartWall === null) {
    throw new RangeError('sealed bar is outside A-share sessions');
  }
  const minuteOffset = wallMinute - sessionStartWall;
  return {
    sessionStartMs: timestamp.getTime() - minuteOffset * 60_000,
    minuteOffset,
  };
}

/** 给定时刻所在上海日期的零点（UTC+8 固定偏移）。 */
function shanghaiMidnight(timestamp: Date): Date {
  const shifted = new Date(timestamp.getTime() + 8 * 60 * 60 * 1000);
  const utcMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(utcMidnight - 8 * 60 * 60 * 1000);
}
