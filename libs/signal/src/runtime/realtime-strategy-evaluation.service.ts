import type { StrategyBar, StrategyRealtimeSource } from '@app/market-data';
import type { KernelSignal } from '@app/strategy';
import {
  RealtimeKernelPool,
  type RealtimeLastOutcome,
  type RealtimeStrategyExecutionPlan,
  type RealtimeWindowGroupIdentity,
} from '@app/strategy';

export type {
  RealtimeStrategyExecutionPlan,
  RealtimeWindowGroupIdentity,
  RealtimeLastOutcome,
};

export interface ShadowStrategyCandidate {
  readonly definitionId: number;
  readonly versionId: number;
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;
  readonly period: number;
  readonly signalKind: 'entry' | 'exit';
  /** 决策触发时刻 = 当前确认 Bar timestamp（撮合/游标唯一认可时刻） */
  readonly signalTime: Date;
  /** 与 signalTime 严格等价（ISO） */
  readonly triggerTime: string;
  readonly triggerPrice: number;
  /** 形态几何极值时刻（图表 Marker 定位），无 pivot 语义为 null */
  readonly pivotTime: string | null;
  /** 形态几何极值点价格（止损参考），无 pivot 语义为 null */
  readonly pivotPrice: number | null;
  /** 信号类型标签（决策流 signalTag ?? action） */
  readonly signalType: string;
  readonly barType: StrategyBar['type'];
  readonly confidence: number;
  readonly confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  readonly decisionTrace: Record<string, unknown> | null;
  readonly contextSnapshot: Readonly<Record<string, unknown>>;
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
}

export interface RealtimeKernelPoolLike {
  push(
    bar: StrategyBar,
    plans: readonly RealtimeStrategyExecutionPlan[],
  ): Promise<readonly KernelSignal[]>;
  retainGroups(groups: readonly RealtimeWindowGroupIdentity[]): void;
  reset(): void;
  warmup?(
    targets: readonly import('@app/strategy').PreMarketWarmupTarget[],
    anchorAt: Date,
  ): Promise<Readonly<import('@app/strategy').PreMarketWarmupReport>>;
  hasGroupsWarmedFor?(tradingDay: string): boolean;
  diagnostics(): Readonly<{
    groupCount: number;
    rawBarCount: number;
    derivedBarCount: number;
    lastOutcome: RealtimeLastOutcome;
  }>;
}

/**
 * 实时链路求值服务（统一内核单通路）：
 * 滑窗与组内计划共享由 RealtimeKernelPool 承担（每 `(securityId, source)` 组一个
 * 内核实例、组内每声明周期一个窗口），求值只做「bar 输入 → 策略树 → 当期增量信号」，
 * 输出层不做投递级去重（RealtimeEpisodeStore 已随独立分支一并退役）。
 */
export class RealtimeStrategyEvaluationService {
  constructor(private readonly kernelPool: RealtimeKernelPoolLike) {}

  /**
   * 统一内核单通路：全部 bar（1m 封存 + 各周期派生）必须进池——context bar
   * 只更新自己的窗口，由内核按 plan 求值周期分派。此处不得按 bar.period
   * 预过滤（那会让 context bar 永远到不了内核窗口）。
   */
  async evaluate(
    bar: StrategyBar,
    plans: readonly RealtimeStrategyExecutionPlan[],
  ): Promise<readonly ShadowStrategyCandidate[]> {
    const eligible = [...plans].sort(
      (left, right) =>
        left.definitionId - right.definitionId ||
        left.versionId - right.versionId,
    );
    if (eligible.length === 0) return Object.freeze([]);

    const signals = await this.kernelPool.push(bar, eligible);
    return Object.freeze(
      signals.map((signal) => toCandidate(signal, bar, eligible)),
    );
  }

  retainRegistryScopes(groups: readonly RealtimeWindowGroupIdentity[]): void {
    this.kernelPool.retainGroups(groups);
  }

  /** 盘前预热入口（09:20 屏障与启动补热共用）；池不支持时静默跳过。 */
  async warmup(
    targets: readonly import('@app/strategy').PreMarketWarmupTarget[],
    anchorAt: Date,
  ): Promise<Readonly<import('@app/strategy').PreMarketWarmupReport> | null> {
    if (!this.kernelPool.warmup) return null;
    return this.kernelPool.warmup(targets, anchorAt);
  }

  hasGroupsWarmedFor(tradingDay: string): boolean {
    return this.kernelPool.hasGroupsWarmedFor?.(tradingDay) ?? false;
  }

  reset(): void {
    this.kernelPool.reset();
  }

  diagnostics() {
    return this.kernelPool.diagnostics();
  }
}

export { RealtimeKernelPool };

function toCandidate(
  signal: KernelSignal,
  bar: StrategyBar,
  plans: readonly RealtimeStrategyExecutionPlan[],
): ShadowStrategyCandidate {
  const plan =
    plans.find(
      (candidate) =>
        candidate.definitionId === signal.definitionId &&
        candidate.versionId === signal.versionId,
    ) ?? plans[0];
  const signalKind: 'entry' | 'exit' =
    plan.signalKind ?? (signal.signalKind === 'exit' ? 'exit' : 'entry');
  return Object.freeze({
    definitionId: signal.definitionId,
    versionId: signal.versionId,
    securityId: bar.securityId,
    source: bar.source as StrategyRealtimeSource,
    period: bar.period,
    signalKind,
    signalTime: bar.timestamp,
    triggerTime: bar.timestamp.toISOString(),
    triggerPrice: signal.triggerPrice,
    pivotTime: signal.pivotTime,
    pivotPrice: signal.pivotPrice,
    signalType: signal.signalType,
    barType: bar.type,
    confidence: signal.confidence,
    confidenceLevel: signal.confidenceLevel,
    decisionTrace: signal.decisionTrace,
    contextSnapshot: signal.contextSnapshot,
    ruleSnapshot: signal.ruleSnapshot,
  });
}
