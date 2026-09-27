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
  /** 公开相起点（= run.startDate）：该时刻之前的 bar 作为预热段推进。 */
  readonly publicFrom: Date;
  /** 回放终点（= run.endDate），闭区间。 */
  readonly endAt: Date;
  readonly requiredBars: number;
}

export interface HistoricalReplaySummary {
  readonly prewarmStatus: PrewarmStatus;
  readonly prewarmActual: number;
  readonly barCount: number;
}

/**
 * 历史 K 线 push 适配器（回测/推演 lane）：
 * 开批先查 `timestamp < publicFrom` 的最近 `requiredBars` 根作为预热段，
 * 随后按 `readReplayPage` 页序流式推进回放区间，逐根喂给统一内核。
 */
export class HistoricalBarSource {
  constructor(
    private readonly port: StrategyReplayMarketDataPort,
    private readonly criteria: HistoricalReplayCriteria,
  ) {}

  public async drive(
    kernel: StrategyEvaluationKernel,
    onSignal?: (signal: KernelSignal, bar: StrategyBar) => void | Promise<void>,
  ): Promise<HistoricalReplaySummary> {
    const { securityId, source, period, publicFrom, endAt, requiredBars } =
      this.criteria;

    // ① 预热段：公开起点之前的历史窗口整段推进（kernel 按时间轴进预热相）。
    const initial = await this.port.loadReplayWindow({
      securityId,
      source,
      period,
      endAt: publicFrom,
      requiredBars,
    });
    for (const bar of initial.bars) {
      await kernel.push(bar);
    }

    // ② 回放区间：逐页流式推进，公开相信号经 onSignal 交给调用方落盘。
    let afterTimestamp: Date | undefined;
    let barCount = 0;
    while (true) {
      const page = await this.port.readReplayPage({
        securityId,
        source,
        period,
        startAt: publicFrom,
        endAt,
        ...(afterTimestamp ? { afterTimestamp } : {}),
      });
      if (page.bars.length === 0) break;
      for (const bar of page.bars) {
        const signals = await kernel.push(bar);
        barCount += 1;
        if (onSignal) {
          for (const signal of signals) {
            await onSignal(signal, bar);
          }
        }
      }
      if (page.nextAfterTimestamp === null) break;
      afterTimestamp = page.nextAfterTimestamp;
    }

    const diagnostics = kernel.diagnostics();
    return {
      prewarmStatus: diagnostics.prewarmStatus,
      prewarmActual: diagnostics.prewarmActual,
      barCount,
    };
  }
}
