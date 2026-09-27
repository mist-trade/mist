import type {
  StrategyBar,
  StrategyRealtimeSource,
  StrategyReplayMarketDataPort,
} from '@app/market-data';
import type {
  KernelSignal,
  PrewarmStatus,
} from './kernel.types';
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

  public async drive(
    kernel: StrategyEvaluationKernel,
    onSignal?: (signal: KernelSignal, bar: StrategyBar) => void | Promise<void>,
    onBar?: (bar: StrategyBar) => void | Promise<void>,
  ): Promise<HistoricalReplaySummary> {
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
    for (const bar of initial.bars) {
      await kernel.push(bar);
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
        const signals = await kernel.push(bar);
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
