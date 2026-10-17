import type {
  StrategyBar,
  StrategyRealtimeSource,
  StrategyReplayMarketDataPort,
} from '@app/market-data';
import {
  A_SHARE_DATA_MIN_BOUNDARY,
  InvalidHistoricalDataBoundaryException,
} from '../strategy.errors';
import type { KernelSignal, PrewarmStatus } from './kernel.types';
import type { StrategyEvaluationKernel } from './strategy-evaluation-kernel';

export interface HistoricalReplayCriteria {
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;
  readonly period: number;
  /**
   * 预热段查询上界（loadReplayWindow endAt）与回放页起点（readReplayPage startAt）。
   * 分钟级 plan 为当日开盘，日线 plan 为 run.startDate。
   */
  readonly preWarmEndAt: Date;
  /** 公开相边界（= run.startDate）：该时刻之前的 bar 由内核静默消化。 */
  readonly publicFrom: Date;
  /** 回放终点（= run.endDate），闭区间。 */
  readonly endAt: Date;
  readonly requiredBars: number;
  /** 可选显式指定回放起点，未提供时默认回落为 publicFrom */
  readonly startDate?: Date;
}

export interface HistoricalReplaySummary {
  readonly prewarmStatus: PrewarmStatus;
  readonly prewarmActual: number;
  readonly barCount: number;
  /** 公开相（timestamp >= publicFrom）实际推进的 Bar 根数。 */
  readonly publicBarCount: number;
}

/**
 * 历史 K 线 push 适配器（回测/推演 lane）：
 * 开批先查 `timestamp < preWarmEndAt` 的最近 `requiredBars` 根作为预热段，
 * 随后按 `readReplayPage` 页序流式推进回放区间，逐根喂给统一内核；
 * 相位由内核按 publicFrom 判定，适配器不感知发射策略。
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
  ): Promise<HistoricalReplaySummary> {
    HistoricalBarSource.validateBoundary(this.criteria);

    const { securityId, source, period, preWarmEndAt, endAt, requiredBars } =
      this.criteria;

    // ① 预热段：公开起点之前的历史窗口整段推进（kernel 按时间轴进预热相）。
    const initial = await this.port.loadReplayWindow({
      securityId,
      source,
      period,
      endAt: preWarmEndAt,
      requiredBars,
    });
    let lastPushedMs: number | null = null;
    for (const bar of initial.bars) {
      const barMs = bar.timestamp.getTime();
      if (lastPushedMs !== null && barMs <= lastPushedMs) continue;
      await kernel.push(bar);
      lastPushedMs = barMs;
      if (onBar) await onBar(bar);
    }

    // ② 回放区间：逐页流式推进，公开相信号经 onSignal 交给调用方落盘。
    let afterTimestamp: Date | undefined;
    let barCount = 0;
    while (true) {
      const page = await this.port.readReplayPage({
        securityId,
        source,
        period,
        startAt: preWarmEndAt,
        endAt,
        ...(afterTimestamp ? { afterTimestamp } : {}),
      });
      if (page.bars.length === 0) break;
      for (const bar of page.bars) {
        const barMs = bar.timestamp.getTime();
        if (lastPushedMs !== null && barMs <= lastPushedMs) {
          continue;
        }
        const signals = await kernel.push(bar);
        lastPushedMs = barMs;
        barCount += 1;
        if (onBar) await onBar(bar);
        if (onSignal) {
          for (const signal of signals) {
            await onSignal(signal, bar);
          }
        }
      }
      if (!page.nextAfterTimestamp) break;
      afterTimestamp = page.nextAfterTimestamp;
    }

    const diagnostics = kernel.diagnostics();
    return {
      prewarmStatus: diagnostics.prewarmStatus,
      prewarmActual: diagnostics.prewarmActual,
      barCount,
      publicBarCount: diagnostics.publicBarCount,
    };
  }
}
