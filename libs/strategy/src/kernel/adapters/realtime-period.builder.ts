import type { StrategyBar, StrategyTrigger } from '@app/market-data';
import { getShanghaiHourAndMinute } from '@app/timezone';
import {
  reduceSlot,
  reduceDaily,
  resolveSessionPosition,
  shanghaiMidnightOf,
} from './period-aggregation.helper';

export const REALTIME_STRATEGY_PERIODS = [1, 5, 15, 30, 60, 1440] as const;
export type RealtimeStrategyPeriod = (typeof REALTIME_STRATEGY_PERIODS)[number];

const LUNCH_TERMINAL_MINUTE = 11 * 60 + 30; // 11:30 终端桶
const CLOSE_TERMINAL_MINUTE = 15 * 60; // 15:00 终端桶（含收盘集合竞价）
const SESSION_LENGTH_MINUTES = 120; // 上/下午各 120 分钟

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

    const position = resolveSessionPosition(
      trigger.timestamp,
      'finalized strategy trigger',
    );
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
          daySlot.tradingDayMs,
          daySlot.buckets,
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
