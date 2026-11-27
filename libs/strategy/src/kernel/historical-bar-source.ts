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
import type {
  ExternalContextRequirement,
  KernelSignal,
  PrewarmStatus,
} from './kernel.types';
import type { StrategyEvaluationKernel } from './strategy-evaluation-kernel';

const DAILY_PERIOD = 1440;
const SURVEILLANCE_PREWARM_BARS = 48;
const STREAM_RANK_EXTERNAL = 0;
const STREAM_RANK_MAIN = 1;

export interface HistoricalReplayCriteria {
  readonly securityId: number;
  readonly securityCode?: string;
  readonly selection: ReplayDataSelection;
  /** 求值周期：onBar/onSignal 只对该周期的 bar 触发（执行引擎/结果落盘口径） */
  readonly evaluationPeriod: number;
  /** context 周期 → 预热根数（编译产物；不含求值周期） */
  readonly contextPeriods: Readonly<Record<number, number>>;
  /** 轻量监控周期集合（如 [5]）：预热按需补齐，公开区间随主/context 周期按可用时刻归并推流 */
  readonly surveillancePeriods?: readonly number[];
  /** 跨标的上下文依赖（需已绑定 numeric securityId；优先同可用时刻先于主标的推入内核） */
  readonly externalContextRequirements?: readonly ExternalContextRequirement[];
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
  readonly securityId: number;
  readonly securityCode?: string;
  readonly period: number;
  readonly isExternal: 0 | 1;
  buffer: StrategyBar[];
  afterTimestamp?: Date;
  exhausted: boolean;
}

interface TaggedPrewarmStream {
  readonly period: number;
  readonly isExternal: 0 | 1;
  readonly bars: readonly StrategyBar[];
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
      surveillancePeriods,
      externalContextRequirements,
      preWarmEndAt,
      requiredBars,
    } = this.criteria;

    const periodDemands = new Map<number, number>([
      [evaluationPeriod, requiredBars],
      ...Object.entries(contextPeriods).map(
        ([rawPeriod, bars]) => [Number(rawPeriod), bars] as const,
      ),
    ]);
    const surveillanceSet = new Set<number>();
    for (const rawPeriod of surveillancePeriods ?? []) {
      const period = Number(rawPeriod);
      if (
        Number.isSafeInteger(period) &&
        period > 0 &&
        !periodDemands.has(period)
      ) {
        surveillanceSet.add(period);
      }
    }
    const externalDemand = new Map<string, ExternalContextRequirement>();
    for (const req of externalContextRequirements ?? []) {
      if (typeof req.securityId !== 'number') continue;
      const key = `${req.securityId}|${req.period}`;
      const existing = externalDemand.get(key);
      if (!existing || req.minBars > existing.minBars) {
        externalDemand.set(key, req);
      }
    }

    // ① 预热段：主/context + surveillance + 外部标的分别取历史窗，按 (availabilityKey, isExternal, period) 归并推入
    const prewarmTaggedStreams: TaggedPrewarmStream[] = [];
    for (const [period, demand] of periodDemands) {
      const response = await this.port.loadReplayWindow({
        securityId,
        ...(securityCode ? { securityCode } : {}),
        selection,
        period,
        endAt: this.preWarmBoundary(period, preWarmEndAt),
        requiredBars: demand,
      });
      prewarmTaggedStreams.push({
        period,
        isExternal: STREAM_RANK_MAIN,
        bars: [...response.bars],
      });
    }
    for (const survPeriod of [...surveillanceSet].sort((a, b) => a - b)) {
      const response = await this.port.loadReplayWindow({
        securityId,
        ...(securityCode ? { securityCode } : {}),
        selection,
        period: survPeriod,
        endAt: this.preWarmBoundary(survPeriod, preWarmEndAt),
        requiredBars: SURVEILLANCE_PREWARM_BARS,
      });
      if (response?.bars?.length) {
        prewarmTaggedStreams.push({
          period: survPeriod,
          isExternal: STREAM_RANK_MAIN,
          bars: [...response.bars],
        });
      }
    }
    for (const req of externalDemand.values()) {
      const response = await this.port.loadReplayWindow({
        securityId: req.securityId!,
        ...(req.securityCode ? { securityCode: req.securityCode } : {}),
        selection,
        period: req.period,
        endAt: this.preWarmBoundary(req.period, preWarmEndAt),
        requiredBars: req.minBars,
      });
      if (response?.bars?.length) {
        prewarmTaggedStreams.push({
          period: req.period,
          isExternal: STREAM_RANK_EXTERNAL,
          bars: [...response.bars],
        });
      }
    }
    for (const bar of HistoricalBarSource.mergeTaggedByAvailability(
      prewarmTaggedStreams,
    )) {
      await kernel.push(bar);
      await onPushed?.(bar);
      if (bar.securityId === securityId && bar.period === evaluationPeriod) {
        await onBar?.(bar);
      }
    }

    // ② 公开区间：逐周期分页 + k 路归并推进，公开相信号经 onSignal 落盘
    const streams = new Map<string, PeriodStream>();
    for (const period of periodDemands.keys()) {
      streams.set(`main:${period}`, {
        securityId,
        ...(securityCode ? { securityCode } : {}),
        period,
        isExternal: STREAM_RANK_MAIN,
        buffer: [],
        afterTimestamp: undefined,
        exhausted: false,
      });
    }
    for (const survPeriod of surveillanceSet) {
      streams.set(`surv:${survPeriod}`, {
        securityId,
        ...(securityCode ? { securityCode } : {}),
        period: survPeriod,
        isExternal: STREAM_RANK_MAIN,
        buffer: [],
        afterTimestamp: undefined,
        exhausted: false,
      });
    }
    for (const [extKey, req] of externalDemand) {
      streams.set(`ext:${extKey}`, {
        securityId: req.securityId!,
        ...(req.securityCode ? { securityCode: req.securityCode } : {}),
        period: req.period,
        isExternal: STREAM_RANK_EXTERNAL,
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
      if (next.securityId === securityId && next.period === evaluationPeriod) {
        barCount += 1;
        publicBarCount += 1;
        await onBar?.(next);
      }
      if (signals.length > 0) {
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
    if (period !== DAILY_PERIOD) return preWarmEndAt;
    return shanghaiMidnight(preWarmEndAt);
  }

  /**
   * k 路归并选择器：各流页缓冲里选 (availabilityKey, isExternal, period) 最小者。
   * 缓冲耗尽时异步翻页，页耗尽标记 exhausted。
   */
  private async pickNext(
    streams: Map<string, PeriodStream>,
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
        (key === best.key && stream.isExternal < best.stream.isExternal) ||
        (key === best.key &&
          stream.isExternal === best.stream.isExternal &&
          stream.period < best.stream.period)
      ) {
        best = { stream, key };
      }
    }
    if (!best) return null;
    return best.stream.buffer.shift()!;
  }

  private async refill(stream: PeriodStream): Promise<void> {
    const { selection, preWarmEndAt, endAt } = this.criteria;
    const page = await this.port.readReplayPage({
      securityId: stream.securityId,
      ...(stream.securityCode ? { securityCode: stream.securityCode } : {}),
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

  /** 预热段多流（含外部标的前置与主标的监控）归并 */
  public static mergeTaggedByAvailability(
    streams: readonly TaggedPrewarmStream[],
  ): readonly StrategyBar[] {
    const queues = streams.map((stream) => ({
      period: stream.period,
      isExternal: stream.isExternal,
      bars: [...stream.bars],
    }));
    const merged: StrategyBar[] = [];
    for (;;) {
      let bestIdx = -1;
      let bestKey = 0;
      for (let idx = 0; idx < queues.length; idx += 1) {
        const q = queues[idx]!;
        const head = q.bars[0];
        if (!head) continue;
        const key = availabilityKey(head).getTime();
        const best = bestIdx >= 0 ? queues[bestIdx]! : null;
        if (
          best === null ||
          key < bestKey ||
          (key === bestKey && q.isExternal < best.isExternal) ||
          (key === bestKey &&
            q.isExternal === best.isExternal &&
            q.period < best.period)
        ) {
          bestIdx = idx;
          bestKey = key;
        }
      }
      if (bestIdx < 0) break;
      merged.push(queues[bestIdx]!.bars.shift()!);
    }
    return merged;
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
