import type {
  ReplayDataSelection,
  StrategyBar,
  StrategyReplayMarketDataPort,
} from '@app/market-data';
import { availabilityKey } from './availability';
import {
  A_SHARE_DATA_MIN_BOUNDARY,
  InvalidHistoricalDataBoundaryException,
} from '../strategy.errors';
import type { KernelSignal, PrewarmStatus } from './kernel.types';
import type { StrategyEvaluationKernel } from './strategy-evaluation-kernel';

export interface HistoricalReplayCriteria {
  readonly securityId: number;
  readonly securityCode?: string;
  readonly selection: ReplayDataSelection;
  /** 求值周期：onBar/onSignal 只对该周期的 bar 触发（执行引擎/结果落盘口径） */
  readonly evaluationPeriod: number;
  /** context 周期 → 预热根数（编译产物；不含求值周期） */
  readonly contextPeriods: Readonly<Record<number, number>>;
  /**
   * 预热段查询上界（loadReplayWindow endAt）与回放页起点（readReplayPage startAt）。
   * 分钟级周期为当日开盘，日线周期为 run.startDate——日线另有可用时刻边界（见 drive）。
   */
  readonly preWarmEndAt: Date;
  /** 公开相边界（= run.startDate）：该时刻之前的 bar 由内核静默消化。 */
  readonly publicFrom: Date;
  /** 回放终点（= run.endDate），闭区间。 */
  readonly endAt: Date;
  /** 求值周期预热根数 */
  readonly requiredBars: number;
  /** 可选显式指定回放起点，未提供时默认回落为 publicFrom */
  readonly startDate?: Date;
}

export interface HistoricalReplaySummary {
  readonly prewarmStatus: PrewarmStatus;
  readonly prewarmActual: number;
  readonly barCount: number;
  /** 公开相（timestamp >= publicFrom）实际推进的**求值周期** Bar 根数 */
  readonly publicBarCount: number;
  /** 各周期预热明细（诊断用；求值周期 + 全部 context 周期） */
  readonly perPeriodPrewarm: readonly {
    readonly period: number;
    readonly status: PrewarmStatus;
    readonly actual: number;
    readonly expected: number;
  }[];
}

interface PeriodStream {
  readonly period: number;
  buffer: StrategyBar[];
  afterTimestamp?: Date;
  exhausted: boolean;
}

/**
 * 历史 K 线 push 适配器（回测/推演 lane，多序列版）：
 *
 * 声明周期集合 = 求值周期 ∪ contextPeriods keys。每个周期独立走 canonical
 * `loadReplayWindow`（预热）+ `readReplayPage` 页序（公开区间），随后按
 * `(availabilityKey, period)` 升序 k 路归并——该序恰等于实时触发到达序，
 * 是三链路同构的排序基础。onBar/onSignal 仅对求值周期 bar 触发：
 * context bar 只进窗口，绝不驱动 broker/持仓/NAV 日结。
 * 预算：每根被推送的 bar（含 context 与预热段）经 onPushed 计数。
 */
export class HistoricalBarSource {
  constructor(
    private readonly port: StrategyReplayMarketDataPort,
    private readonly criteria: HistoricalReplayCriteria,
  ) {}

  public static validateBoundary(criteria: {
    readonly startDate?: Date;
    readonly publicFrom?: Date;
    readonly preWarmEndAt?: Date;
  }): void {
    const effectiveStart =
      criteria.startDate ?? criteria.publicFrom ?? criteria.preWarmEndAt;
    if (
      effectiveStart &&
      effectiveStart.getTime() < A_SHARE_DATA_MIN_BOUNDARY.getTime()
    ) {
      throw new InvalidHistoricalDataBoundaryException(
        `Invalid historical data boundary: ${effectiveStart.toISOString()} is prior to 1996-12-16T00:00:00.000Z. A-share data before 1996-12-16 lacks price limits and T+1 mechanisms, and is considered toxic for strategy evaluation.`,
      );
    }
  }

  public async drive(
    kernel: StrategyEvaluationKernel,
    onSignal?: (signal: KernelSignal, bar: StrategyBar) => void | Promise<void>,
    onBar?: (bar: StrategyBar) => void | Promise<void>,
    onPushed?: (bar: StrategyBar) => void | Promise<void>,
  ): Promise<HistoricalReplaySummary> {
    HistoricalBarSource.validateBoundary(this.criteria);

    const {
      securityId,
      securityCode,
      selection,
      evaluationPeriod,
      contextPeriods,
      preWarmEndAt,
      requiredBars,
    } = this.criteria;

    const periodDemands = new Map<number, number>([
      [evaluationPeriod, requiredBars],
      ...Object.entries(contextPeriods).map(
        ([rawPeriod, bars]) => [Number(rawPeriod), bars] as const,
      ),
    ]);

    // ① 预热段：每周期独立取整段（canonical），日线的可用时刻边界见 periodBoundary
    const prewarmStreams = new Map<number, StrategyBar[]>();
    for (const [period, demand] of periodDemands) {
      const response = await this.port.loadReplayWindow({
        securityId,
        ...(securityCode ? { securityCode } : {}),
        selection,
        period,
        endAt: this.preWarmBoundary(period, preWarmEndAt),
        requiredBars: demand,
      });
      prewarmStreams.set(period, [...response.bars]);
    }
    for (const bar of HistoricalBarSource.mergeByAvailability(prewarmStreams)) {
      await kernel.push(bar);
      await onPushed?.(bar);
      if (bar.period === evaluationPeriod) {
        await onBar?.(bar);
      }
    }

    // ② 公开区间：逐周期分页 + k 路归并推进，公开相信号经 onSignal 落盘
    const streams = new Map<number, PeriodStream>();
    for (const period of periodDemands.keys()) {
      streams.set(period, {
        period,
        buffer: [],
        afterTimestamp: undefined,
        exhausted: false,
      });
    }
    let barCount = 0;
    let publicBarCount = 0;
    for (;;) {
      const next = await this.pickNext(streams);
      if (!next) break;
      const signals = await kernel.push(next);
      await onPushed?.(next);
      if (next.period === evaluationPeriod) {
        barCount += 1;
        publicBarCount += 1;
        await onBar?.(next);
        for (const signal of signals) {
          await onSignal?.(signal, next);
        }
      }
    }

    const diagnostics = kernel.diagnostics();
    const evalPeriodDiagnostics = diagnostics.perPeriod.find(
      (item) => item.period === evaluationPeriod,
    );
    return {
      prewarmStatus: evalPeriodDiagnostics?.prewarmStatus ?? 'empty',
      prewarmActual: evalPeriodDiagnostics?.prewarmActual ?? 0,
      barCount,
      publicBarCount,
      perPeriodPrewarm: diagnostics.perPeriod.map((item) => ({
        period: item.period,
        status: item.prewarmStatus,
        actual: item.prewarmActual,
        expected: item.prewarmExpected,
      })),
    };
  }

  /**
   * 预热/回放页的时间边界：常规周期用 preWarmEndAt（标签边界）；
   * 日线（00:00(D) 日期身份）的可用时刻是 D 日 15:01，按标签筛选会把
   * "startDate 当日的日线"漏进预热段造成未来函数——边界截到 startDate 的
   * 上海零点，使日线下界对齐"可用时刻 <= publicFrom"。
   */
  private preWarmBoundary(period: number, preWarmEndAt: Date): Date {
    if (period !== 1440) return preWarmEndAt;
    return shanghaiMidnight(preWarmEndAt);
  }

  /**
   * k 路归并选择器：各周期页缓冲里选 (availabilityKey, period) 最小者。
   * 缓冲耗尽时异步翻页，页耗尽标记 exhausted。
   */
  private async pickNext(
    streams: Map<number, PeriodStream>,
  ): Promise<StrategyBar | null> {
    let best: { stream: PeriodStream; key: number } | null = null;
    for (const stream of streams.values()) {
      if (stream.buffer.length === 0 && !stream.exhausted) {
        await this.refill(stream);
      }
      if (stream.buffer.length === 0) continue;
      const head = stream.buffer[0];
      const key = availabilityKey(head).getTime();
      if (
        best === null ||
        key < best.key ||
        (key === best.key && stream.period < best.stream.period)
      ) {
        best = { stream, key };
      }
    }
    if (!best) return null;
    return best.stream.buffer.shift()!;
  }

  private async refill(stream: PeriodStream): Promise<void> {
    const { securityId, securityCode, selection, preWarmEndAt, endAt } =
      this.criteria;
    const page = await this.port.readReplayPage({
      securityId,
      ...(securityCode ? { securityCode } : {}),
      selection,
      period: stream.period,
      startAt: this.preWarmBoundary(stream.period, preWarmEndAt),
      endAt,
      ...(stream.afterTimestamp
        ? { afterTimestamp: stream.afterTimestamp }
        : {}),
    });
    if (page.bars.length === 0) {
      stream.exhausted = true;
      return;
    }
    stream.buffer.push(...page.bars);
    if (!page.nextAfterTimestamp) {
      stream.exhausted = true;
      return;
    }
    stream.afterTimestamp = page.nextAfterTimestamp;
  }

  /** 预热段多周期归并（纯函数）：供 drive 内部与单测使用。 */
  public static mergeByAvailability(
    streams: ReadonlyMap<number, readonly StrategyBar[]>,
  ): readonly StrategyBar[] {
    const queues = new Map<number, StrategyBar[]>();
    for (const [period, bars] of streams) {
      queues.set(period, [...bars]);
    }
    const merged: StrategyBar[] = [];
    for (;;) {
      let best: { period: number; index: number; key: number } | null = null;
      for (const [period, bars] of queues) {
        const head = bars[0];
        if (!head) continue;
        const key = availabilityKey(head).getTime();
        if (
          best === null ||
          key < best.key ||
          (key === best.key && period < best.period)
        ) {
          best = { period, index: 0, key };
        }
      }
      if (!best) break;
      const bars = queues.get(best.period)!;
      merged.push(bars.shift()!);
    }
    return merged;
  }
}

/** 给定时刻所在上海日期的零点（上海无夏令时：UTC+8 固定偏移）。 */
export function shanghaiMidnight(timestamp: Date): Date {
  const shifted = new Date(timestamp.getTime() + 8 * 60 * 60 * 1000);
  const utcMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(utcMidnight - 8 * 60 * 60 * 1000);
}
