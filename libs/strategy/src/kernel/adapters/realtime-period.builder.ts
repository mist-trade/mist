import { Decimal8 } from '@app/decimal';
import type { StrategyBar, StrategyTrigger } from '@app/market-data';

import {
  AFTERNOON_END_MIN,
  AFTERNOON_START_MIN,
  MORNING_END_MIN,
  MORNING_START_MIN,
  getShanghaiHourAndMinute,
} from '@app/timezone';

export const REALTIME_STRATEGY_PERIODS = [1, 5, 15, 30, 60, 1440] as const;
export type RealtimeStrategyPeriod = (typeof REALTIME_STRATEGY_PERIODS)[number];

const LUNCH_TERMINAL_MINUTE = 11 * 60 + 30; // 11:30 终端桶
const CLOSE_TERMINAL_MINUTE = 15 * 60; // 15:00 终端桶（含收盘集合竞价）
const SESSION_LENGTH_MINUTES = 120; // 上/下午各 120 分钟
const DAILY_EXPECTED_BUCKETS = 242; // [09:30,11:31) ∪ [13:00,15:01)

interface PendingPeriodSlot {
  readonly expectedCount: number;
  readonly bars: Map<number, StrategyBar>;
}

interface PendingDailySlot {
  readonly tradingDayMs: number;
  readonly buckets: Map<number, StrategyBar>;
}

export class RealtimePeriodBuilder {
  private readonly pending = new Map<string, PendingPeriodSlot>();
  private readonly dailyPending = new Map<string, PendingDailySlot>();

  /**
   * 接受一根已封存（或 discarded）的 1m 终端事实，返回该触发当期派生的
   * 全部 bar（含 1m 封存 bar 与右标派生 bar，emit 序 = 同刻周期升序：
   * 1m → 5m → 15m → 30m → 60m → 1440，恰与回测 orderKey 归并序逐根一致）。
   *
   * 标签规则（2026-10-25 定案）：
   * - 1m 封存 bar 保持左标（bucketStartMs，与 1m 历史同构）；
   * - 5/15/30/60m 派生右标 = slotStart + period；
   * - session 最后一窗吸收终端桶（11:30/15:00，可选成分）并于终端桶触发闭合，
   *   完整性只按常规成分根数判；
   * - 1440 日线由当日桶聚合，标签 00:00(D)，仅在 15:00 终端触发闭合，
   *   complete 当且仅当 242 桶齐。
   */
  accept(
    trigger: StrategyTrigger,
    sealedBar: StrategyBar | null,
    periods: ReadonlySet<number> = new Set(REALTIME_STRATEGY_PERIODS),
  ): readonly StrategyBar[] {
    assertFinalization(trigger, sealedBar);
    const emitted: StrategyBar[] = [];
    if (sealedBar && periods.has(1)) emitted.push(sealedBar);

    const position = sessionPosition(trigger.timestamp);
    const { wallMinute } = getShanghaiHourAndMinute(trigger.timestamp);
    const isTerminal =
      wallMinute === LUNCH_TERMINAL_MINUTE ||
      wallMinute === CLOSE_TERMINAL_MINUTE;
    const isAfternoonTerminal = wallMinute === CLOSE_TERMINAL_MINUTE;

    for (const period of REALTIME_STRATEGY_PERIODS.slice(1).filter(
      (value) => periods.has(value) && value !== 1440,
    )) {
      let slotOffset: number;
      let closesNow: boolean;
      if (isTerminal) {
        // 终端桶并入 session 最后一窗并闭合
        slotOffset = SESSION_LENGTH_MINUTES - period;
        closesNow = true;
      } else {
        slotOffset = Math.floor(position.minuteOffset / period) * period;
        const isLastRegularSlot = slotOffset + period >= SESSION_LENGTH_MINUTES;
        closesNow =
          position.minuteOffset - slotOffset === period - 1 &&
          !isLastRegularSlot;
      }
      const slotStartMs = position.sessionStartMs + slotOffset * 60_000;
      const key = slotKey(
        trigger.securityId,
        trigger.source,
        period,
        slotStartMs,
      );
      const slot = this.pending.get(key) ?? {
        expectedCount: period,
        bars: new Map<number, StrategyBar>(),
      };
      if (sealedBar) slot.bars.set(trigger.timestamp.getTime(), sealedBar);

      if (closesNow) {
        this.pending.delete(key);
        const derived = reduceSlot(
          trigger.securityId,
          trigger.source,
          period,
          slotStartMs,
          slot.bars,
        );
        if (derived) emitted.push(derived);
      } else {
        this.pending.set(key, slot);
      }
    }

    if (periods.has(1440)) {
      const dayKey = `${trigger.securityId}\u0000${trigger.source}\u00001440\u0000day`;
      const tradingDayMs = shanghaiMidnightOf(trigger.timestamp).getTime();
      const daySlot = this.dailyPending.get(dayKey) ?? {
        tradingDayMs,
        buckets: new Map<number, StrategyBar>(),
      };
      if (sealedBar) {
        daySlot.buckets.set(trigger.timestamp.getTime(), sealedBar);
      }
      if (isAfternoonTerminal) {
        this.dailyPending.delete(dayKey);
        const derived = reduceDaily(
          trigger.securityId,
          trigger.source,
          daySlot,
        );
        if (derived) emitted.push(derived);
      } else {
        this.dailyPending.set(dayKey, daySlot);
      }
    }

    return Object.freeze(emitted);
  }

  reset(): void {
    this.pending.clear();
    this.dailyPending.clear();
  }

  retainGroups(
    groups: readonly {
      securityId: number;
      source: StrategyTrigger['source'];
      period: number;
    }[],
  ): void {
    const retained = new Set(
      groups.map((group) => groupKey(group.securityId, group.source)),
    );
    for (const key of [...this.pending.keys(), ...this.dailyPending.keys()]) {
      const identity = key.split('\u0000').slice(0, 3).join('\u0000');
      if (!retained.has(identity)) {
        this.pending.delete(key);
        this.dailyPending.delete(key);
      }
    }
  }
}

function reduceSlot(
  securityId: number,
  source: StrategyTrigger['source'],
  period: number,
  slotStartMs: number,
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
    securityId,
    source,
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

function reduceDaily(
  securityId: number,
  source: StrategyTrigger['source'],
  slot: PendingDailySlot,
): StrategyBar | null {
  if (slot.buckets.size === 0) return null;
  const ordered = [...slot.buckets.values()].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  const first = ordered[0];
  const last = ordered.at(-1)!;
  return Object.freeze({
    securityId,
    source,
    period: 1440,
    timestamp: new Date(slot.tradingDayMs),
    open: first.open,
    high: Math.max(...ordered.map((bar) => bar.high)),
    low: Math.min(...ordered.map((bar) => bar.low)),
    close: last.close,
    volume: sumQuantity(ordered, 'volume'),
    amount: sumQuantity(ordered, 'amount'),
    type:
      slot.buckets.size === DAILY_EXPECTED_BUCKETS ? 'complete' : 'incomplete',
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

function sessionPosition(timestamp: Date): {
  sessionStartMs: number;
  minuteOffset: number;
} {
  const timestampMs = timestamp.getTime();
  if (!Number.isFinite(timestampMs) || timestampMs % 60_000 !== 0) {
    throw new TypeError('finalized strategy trigger must be minute-aligned');
  }
  const { wallMinute } = getShanghaiHourAndMinute(timestamp);
  // 半开 session 扩 1 分钟收盘（242 桶宇宙）：11:30/15:00 是含收盘集合竞价的合法终端桶
  const sessionStartWall =
    wallMinute >= MORNING_START_MIN && wallMinute < MORNING_END_MIN
      ? MORNING_START_MIN
      : wallMinute >= AFTERNOON_START_MIN && wallMinute < AFTERNOON_END_MIN
        ? AFTERNOON_START_MIN
        : null;
  if (sessionStartWall === null) {
    throw new RangeError(
      'finalized strategy trigger is outside A-share sessions',
    );
  }
  const minuteOffset = wallMinute - sessionStartWall;
  return {
    sessionStartMs: timestampMs - minuteOffset * 60_000,
    minuteOffset,
  };
}

/** 给定时刻所在上海日期的零点（UTC+8 固定偏移）。 */
function shanghaiMidnightOf(timestamp: Date): Date {
  const shifted = new Date(timestamp.getTime() + 8 * 60 * 60 * 1000);
  const utcMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(utcMidnight - 8 * 60 * 60 * 1000);
}

function assertFinalization(
  trigger: StrategyTrigger,
  sealedBar: StrategyBar | null,
): void {
  if (trigger.period !== 1) {
    throw new TypeError('period builder accepts only finalized 1m triggers');
  }
  if (trigger.outcome === 'discarded') {
    if (sealedBar !== null) {
      throw new TypeError('discarded trigger must not carry a StrategyBar');
    }
    return;
  }
  if (!sealedBar) throw new TypeError('sealed trigger requires a StrategyBar');
  if (
    sealedBar.securityId !== trigger.securityId ||
    sealedBar.source !== trigger.source ||
    sealedBar.period !== 1 ||
    sealedBar.timestamp.getTime() !== trigger.timestamp.getTime() ||
    sealedBar.type !== 'complete'
  ) {
    throw new TypeError('sealed observation does not match its trigger');
  }
}

function slotKey(
  securityId: number,
  source: StrategyTrigger['source'],
  period: number,
  slotStartMs: number,
): string {
  return `${securityId}\u0000${source}\u0000${period}\u0000${slotStartMs}`;
}

function groupKey(
  securityId: number,
  source: StrategyTrigger['source'],
): string {
  return `${securityId}\u0000${source}`;
}
