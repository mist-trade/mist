import type { ProjectedStrategyBar, StrategyBar } from '@app/market-data';
import { StrategySeriesImputer } from '@app/market-data';
import type {
  ConfidenceLevel,
  DecisionResult,
} from '../decision-flow/decision-flow.types';
import { DecisionFlowEvaluator } from '../decision-flow/decision-flow-evaluator';
import {
  extractPivotEvidence,
  extractPivotEvidenceFromReason,
} from '../decision-flow/decision-pivot-evidence';
import type { FactorContext } from '../factor/factor.types';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import type {
  KernelConfig,
  KernelDiagnostics,
  KernelPlan,
  KernelSignal,
  PrewarmStatus,
} from './kernel.types';

/**
 * 统一策略求值内核（三链路唯一通路：实时 / 单步推演 / 批量回测）。
 *
 * 纯 push 核心：`push(bar) → 当期增量信号`。相位由时间轴判定——
 * `timestamp < publicFrom` 为预热相（静默求值、插件游标推进、不发射），
 * `>= publicFrom` 为公开相（发射）。内核不做任何投递级去重/抑制：
 * chan bsp 信号去重由 ChanBspFactorPlugin 单调游标在插件内承担，DSL 连续
 * matched 逐 Bar 原始发射，三链路行为一致。
 *
 * 窗口不足 `windowBudget` 期间不判定不发射（insufficient_history 语义，
 * 预热不足时随公开 Bar 逐根增长，窗口补满自动开始判定）。
 */
export class StrategyEvaluationKernel {
  public readonly securityId: number;
  public readonly securityCode: string;
  public readonly period: number;
  public readonly publicFrom: Date;
  public readonly windowBudget: number;

  private readonly plans: readonly KernelPlan[];
  private readonly evaluator: DecisionFlowEvaluator;
  private readonly imputer = new StrategySeriesImputer();

  private lastPushedTimestamp: Date | null = null;
  private preWarmEvaluated = false;
  private preWarmActual = 0;
  private preWarmStatus: PrewarmStatus = 'empty';
  private publicBarCount = 0;
  private emittedSignalCount = 0;

  constructor(config: KernelConfig) {
    if (config.plans.length === 0) {
      throw new TypeError(
        'StrategyEvaluationKernel requires at least one plan',
      );
    }
    this.securityId = config.securityId;
    this.securityCode = config.securityCode;
    this.period = config.period;
    this.publicFrom = config.publicFrom;
    this.plans = config.plans;
    this.windowBudget = Math.max(
      ...config.plans.map((plan) => plan.requiredBarCount),
    );
    const registry = config.registry ?? new InMemoryFactorPluginRegistry();
    this.evaluator = new DecisionFlowEvaluator({ registry });
  }

  /**
   * 推进一根 Bar，返回该根当期增量信号。
   * 重复/乱序 Bar（timestamp <= lastPushed）静默忽略并返回空数组。
   */
  public async push(bar: StrategyBar): Promise<readonly KernelSignal[]> {
    if (
      this.lastPushedTimestamp !== null &&
      bar.timestamp.getTime() <= this.lastPushedTimestamp.getTime()
    ) {
      return [];
    }

    const isPreWarm = bar.timestamp.getTime() < this.publicFrom.getTime();

    if (isPreWarm) {
      this.imputer.append(bar);
      this.trimWindow();
      this.preWarmActual += 1;
      this.lastPushedTimestamp = bar.timestamp;
      return [];
    }

    // 首个公开 Bar：预热相结束，若预热窗口已满额则先做一次静默预热求值，
    // 把插件单调游标推进至预热结束时刻（杜绝历史形态点在公开相首根被倾泻发射）。
    if (!this.preWarmEvaluated) {
      this.preWarmEvaluated = true;
      this.preWarmStatus =
        this.preWarmActual === 0
          ? 'empty'
          : this.preWarmActual >= this.windowBudget
            ? 'full'
            : 'partial';
      if (
        this.preWarmActual > 0 &&
        this.imputer.read().length >= this.windowBudget &&
        this.lastPushedTimestamp !== null
      ) {
        await this.evaluateSilent(this.lastPushedTimestamp);
      }
    }

    this.imputer.append(bar);
    this.trimWindow();
    this.lastPushedTimestamp = bar.timestamp;
    this.publicBarCount += 1;

    if (this.imputer.read().length < this.windowBudget) {
      return [];
    }

    const signals = await this.evaluatePublic(bar);
    this.emittedSignalCount += signals.length;
    return signals;
  }

  public get windowSize(): number {
    return this.imputer.read().length;
  }

  /** 当前滑窗矫正视图（会话层组装 Frame 的 windowBars 用）。 */
  public readWindow(): readonly ProjectedStrategyBar[] {
    return this.imputer.read();
  }

  public diagnostics(): KernelDiagnostics {
    return {
      windowSize: this.imputer.read().length,
      windowBudget: this.windowBudget,
      lastPushedTimestamp: this.lastPushedTimestamp?.toISOString() ?? null,
      prewarmStatus: this.preWarmEvaluated
        ? this.preWarmStatus
        : this.preWarmActual === 0
          ? 'empty'
          : 'partial',
      prewarmActual: this.preWarmActual,
      prewarmExpected: this.windowBudget,
      publicBarCount: this.publicBarCount,
      emittedSignalCount: this.emittedSignalCount,
    };
  }

  private trimWindow(): void {
    while (this.imputer.read().length > this.windowBudget) {
      this.imputer.trim();
    }
  }

  private buildContext(timestamp: Date): FactorContext {
    return {
      securityId: this.securityId,
      securityCode: this.securityCode,
      timestamp,
      period: this.period,
      bars: this.imputer.read(),
      attributes: new Map(),
    };
  }

  /** 预热相静默求值：仅推进插件游标，信号全部丢弃。 */
  private async evaluateSilent(timestamp: Date): Promise<void> {
    const context = this.buildContext(timestamp);
    for (const plan of this.plans) {
      await this.evaluator.evaluate(plan.flow, context);
    }
  }

  private async evaluatePublic(
    bar: StrategyBar,
  ): Promise<readonly KernelSignal[]> {
    const context = this.buildContext(bar.timestamp);
    const signals: KernelSignal[] = [];
    for (const plan of this.plans) {
      const decision = await this.evaluator.evaluate(plan.flow, context);
      if (decision.status !== 'SIGNAL_EMITTED') continue;
      if (decision.action !== 'BUY' && decision.action !== 'SELL') continue;
      signals.push(this.buildSignal(plan, bar, decision));
    }
    return signals;
  }

  private buildSignal(
    plan: KernelPlan,
    bar: StrategyBar,
    decision: DecisionResult,
  ): KernelSignal {
    const isBuy = decision.action === 'BUY';
    const projected = this.imputer.read();
    const lastProjected: ProjectedStrategyBar | undefined =
      projected[projected.length - 1];
    const triggerPrice = lastProjected?.ohlc.effective?.close ?? bar.close;
    const pivot =
      extractPivotEvidence(decision) ??
      extractPivotEvidenceFromReason(decision);
    return {
      definitionId: plan.definitionId,
      versionId: plan.versionId,
      signalKind: plan.signalKind ?? (isBuy ? 'entry' : 'exit'),
      signalTime: bar.timestamp,
      triggerTime: bar.timestamp.toISOString(),
      triggerPrice,
      pivotTime: pivot?.pivotTime ?? null,
      pivotPrice: pivot?.pivotPrice ?? null,
      signalType: decision.signalTag ?? decision.action ?? 'decision_flow',
      confidence: decision.confidence,
      confidenceLevel: decision.confidenceLevel as ConfidenceLevel,
      decisionTrace: {
        status: decision.status,
        action: decision.action,
        confidence: decision.confidence,
        confidenceLevel: decision.confidenceLevel,
        signalTag: decision.signalTag,
        reason: decision.reason,
        trace: decision.trace,
      },
      contextSnapshot: {
        action: decision.action,
        confidence: decision.confidence,
        confidenceLevel: decision.confidenceLevel,
        signalTag: decision.signalTag,
        reason: decision.reason,
      },
      ruleSnapshot: plan.ruleSnapshot,
    };
  }
}
