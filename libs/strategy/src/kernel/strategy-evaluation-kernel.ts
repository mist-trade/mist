import type { ProjectedStrategyBar, StrategyBar } from '@app/market-data';
import { StrategySeriesImputer } from '@app/market-data';
import type {
  ConfidenceLevel,
  DecisionResult,
  DecisionExecutionTraceItem,
} from '../decision-flow/decision-flow.types';
import { DecisionFlowEvaluator } from '../decision-flow/decision-flow-evaluator';
import {
  extractPivotEvidence,
  extractPivotEvidenceFromReason,
} from '../decision-flow/decision-pivot-evidence';
import type { FactorContext } from '../factor/factor.types';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import { contextSeriesKey, isMissingContextSeriesError } from './availability';
import type {
  KernelConfig,
  KernelDiagnostics,
  KernelPeriodDiagnostics,
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
 * 多周期：内核周期集合 = ∪ plans 的求值周期 ∪ contextRequirements keys，
 * 每周期一个独立滑窗（StrategySeriesImputer）与单调游标；bar 按 `bar.period`
 * 落窗，只有 `bar.period === plan.period` 时才评估该 plan。求值前把全部声明
 * 周期的窗口只读快照写入黑板 `attributes['series.<period>']`（快照 = 窗口已
 * push 内容，push 序即因果序，严禁再做裸时间戳过滤）。声明的 context 窗口
 * 不足或插件读未声明周期 → 该 plan 本次不判定（fail-closed，记有界诊断），
 * 严禁降级为 NEUTRAL。orderKey 只影响供给方（归并/到达序），内核与信号
 * 发射侧不感知、不受影响。
 */
export class StrategyEvaluationKernel {
  public readonly securityId: number;
  public readonly securityCode: string;
  public readonly publicFrom: Date;
  /** 内核维护的全部声明周期（求值周期 ∪ context 周期），升序 */
  public readonly periods: readonly number[];

  private readonly plans: readonly KernelPlan[];
  private readonly evaluator: DecisionFlowEvaluator;
  private readonly windows = new Map<number, StrategySeriesImputer>();
  private readonly budgets = new Map<number, number>();
  private readonly cursors = new Map<number, number>();
  private readonly preWarmActual = new Map<number, number>();
  private readonly preWarmEvaluated = new Set<number>();
  private readonly preWarmStatus = new Map<number, PrewarmStatus>();

  private publicBarCount = 0;
  private emittedSignalCount = 0;
  private planSkips = 0;

  constructor(config: KernelConfig) {
    if (config.plans.length === 0) {
      throw new TypeError(
        'StrategyEvaluationKernel requires at least one plan',
      );
    }
    this.securityId = config.securityId;
    this.securityCode = config.securityCode;
    this.publicFrom = config.publicFrom;
    this.plans = config.plans;

    const periodSet = new Set<number>();
    for (const plan of config.plans) {
      assertPositiveInteger(plan.period, 'plan.period');
      assertPositiveInteger(plan.requiredBarCount, 'plan.requiredBarCount');
      periodSet.add(plan.period);
      for (const [rawPeriod, rawBars] of Object.entries(
        plan.contextRequirements ?? {},
      )) {
        const period = Number(rawPeriod);
        assertPositiveInteger(period, `contextRequirements[${rawPeriod}]`);
        assertPositiveInteger(rawBars, `contextRequirements[${rawPeriod}]`);
        periodSet.add(period);
      }
    }
    this.periods = [...periodSet].sort((left, right) => left - right);

    for (const period of this.periods) {
      let budget = 0;
      for (const plan of config.plans) {
        if (plan.period === period) {
          budget = Math.max(budget, plan.requiredBarCount);
        }
        const contextDemand = plan.contextRequirements?.[period];
        if (typeof contextDemand === 'number') {
          budget = Math.max(budget, contextDemand);
        }
      }
      this.budgets.set(period, budget);
      this.windows.set(period, new StrategySeriesImputer());
    }
    const registry = config.registry ?? new InMemoryFactorPluginRegistry();
    this.evaluator = new DecisionFlowEvaluator({ registry });
  }

  /**
   * 推进一根 Bar，返回该根当期增量信号。
   * 重复/乱序 Bar（同周期内 timestamp <= 游标）静默忽略并返回空数组。
   */
  public async push(bar: StrategyBar): Promise<readonly KernelSignal[]> {
    const window = this.windowOf(bar.period);
    const cursor = this.cursors.get(bar.period);
    if (cursor !== undefined && bar.timestamp.getTime() <= cursor) {
      return [];
    }

    const isPreWarm = bar.timestamp.getTime() < this.publicFrom.getTime();

    if (isPreWarm) {
      window.append(bar);
      this.trimWindow(bar.period);
      this.preWarmActual.set(
        bar.period,
        (this.preWarmActual.get(bar.period) ?? 0) + 1,
      );
      this.cursors.set(bar.period, bar.timestamp.getTime());
      return [];
    }

    // 该周期首个公开 Bar：预热相结束，若预热窗口已满额则先做一次静默预热求值，
    // 把插件单调游标推进至预热结束时刻（杜绝历史形态点在公开相首根被倾泻发射）。
    if (!this.preWarmEvaluated.has(bar.period)) {
      this.preWarmEvaluated.add(bar.period);
      const actual = this.preWarmActual.get(bar.period) ?? 0;
      const budget = this.budgets.get(bar.period)!;
      this.preWarmStatus.set(
        bar.period,
        actual === 0 ? 'empty' : actual >= budget ? 'full' : 'partial',
      );
      if (
        actual > 0 &&
        window.read().length >= budget &&
        this.cursors.get(bar.period) !== undefined
      ) {
        await this.evaluateSilent(
          bar.period,
          new Date(this.cursors.get(bar.period)!),
        );
      }
    }

    window.append(bar);
    this.trimWindow(bar.period);
    this.cursors.set(bar.period, bar.timestamp.getTime());
    this.publicBarCount += 1;

    if (window.read().length < this.budgets.get(bar.period)!) {
      return [];
    }

    const signals = await this.evaluatePublic(bar);
    this.emittedSignalCount += signals.length;
    return signals;
  }

  /** 读取指定周期的滑窗矫正视图（会话层 Frame 与诊断用）。 */
  public readWindow(period: number): readonly ProjectedStrategyBar[] {
    return this.windowOf(period).read();
  }

  public diagnostics(): KernelDiagnostics {
    const perPeriod: KernelPeriodDiagnostics[] = this.periods.map((period) => {
      const preWarmEvaluated = this.preWarmEvaluated.has(period);
      const actual = this.preWarmActual.get(period) ?? 0;
      const budget = this.budgets.get(period)!;
      const status: PrewarmStatus = preWarmEvaluated
        ? (this.preWarmStatus.get(period) ?? 'empty')
        : actual === 0
          ? 'empty'
          : 'partial';
      return {
        period,
        windowSize: this.windows.get(period)!.read().length,
        budget,
        prewarmStatus: status,
        prewarmActual: actual,
        prewarmExpected: budget,
      };
    });
    let worstStatus: PrewarmStatus = 'full';
    let worstActual = Number.POSITIVE_INFINITY;
    let worstExpected = 0;
    for (const item of perPeriod) {
      if (item.prewarmStatus === 'empty') worstStatus = 'empty';
      else if (item.prewarmStatus === 'partial' && worstStatus !== 'empty') {
        worstStatus = 'partial';
      }
      if (item.prewarmActual < worstActual) {
        worstActual = item.prewarmActual;
        worstExpected = item.prewarmExpected;
      }
    }
    let lastPushed: number | null = null;
    for (const ms of this.cursors.values()) {
      if (lastPushed === null || ms > lastPushed) lastPushed = ms;
    }
    return {
      lastPushedTimestamp:
        lastPushed === null ? null : new Date(lastPushed).toISOString(),
      prewarmStatus: worstStatus,
      prewarmActual: worstActual === Number.POSITIVE_INFINITY ? 0 : worstActual,
      prewarmExpected: worstExpected,
      publicBarCount: this.publicBarCount,
      emittedSignalCount: this.emittedSignalCount,
      planSkips: this.planSkips,
      perPeriod,
    };
  }

  private windowOf(period: number): StrategySeriesImputer {
    const window = this.windows.get(period);
    if (!window) {
      throw new TypeError(
        `bar period ${period} is not a declared kernel period (${this.periods.join(',')})`,
      );
    }
    return window;
  }

  private trimWindow(period: number): void {
    const window = this.windowOf(period);
    const budget = this.budgets.get(period)!;
    while (window.read().length > budget) {
      window.trim();
    }
  }

  private buildContext(timestamp: Date, evalPeriod: number): FactorContext {
    const bars = this.windows.get(evalPeriod)!.read();
    const attributes = new Map<string, unknown>();

    // 多周期注入：全部声明周期的只读快照（push 序即因果序，无未来数据）。
    for (const period of this.periods) {
      attributes.set(
        contextSeriesKey(period),
        Object.freeze(this.windows.get(period)!.read()),
      );
    }

    return {
      securityId: this.securityId,
      securityCode: this.securityCode,
      timestamp,
      period: evalPeriod,
      bars,
      attributes,
    };
  }

  /** 声明 context 窗口是否全部达到该 plan 的最少根数。 */
  private contextReady(plan: KernelPlan): boolean {
    for (const [rawPeriod, required] of Object.entries(
      plan.contextRequirements ?? {},
    )) {
      const window = this.windows.get(Number(rawPeriod));
      if (!window || window.read().length < required) {
        return false;
      }
    }
    return true;
  }

  /** 预热相静默求值：仅推进该周期 plan 的插件游标，信号全部丢弃。 */
  private async evaluateSilent(period: number, timestamp: Date): Promise<void> {
    const context = this.buildContext(timestamp, period);
    for (const plan of this.plans) {
      if (plan.period !== period) continue;
      if (!this.contextReady(plan)) continue;
      await this.evaluator.evaluate(plan.flow, context);
    }
  }

  private async evaluatePublic(
    bar: StrategyBar,
  ): Promise<readonly KernelSignal[]> {
    const context = this.buildContext(bar.timestamp, bar.period);
    const signals: KernelSignal[] = [];
    for (const plan of this.plans) {
      if (plan.period !== bar.period) continue;
      if (!this.contextReady(plan)) {
        this.planSkips += 1;
        continue;
      }
      let decision: DecisionResult;
      try {
        decision = await this.evaluator.evaluate(plan.flow, context);
      } catch (error) {
        if (isMissingContextSeriesError(error)) {
          // 插件读了未声明的 context 周期：显式跳过该 plan（fail-closed），
          // 严禁降级为 NEUTRAL 或让整组崩溃。
          this.planSkips += 1;
          continue;
        }
        throw error;
      }
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
    const projected = this.windows.get(bar.period)!.read();
    const lastProjected: ProjectedStrategyBar | undefined =
      projected[projected.length - 1];
    const triggerPrice = lastProjected?.ohlc.effective?.close ?? bar.close;
    const pivot =
      extractPivotEvidence(decision) ??
      extractPivotEvidenceFromReason(decision);
    const badgeText =
      decision.badgeText ?? this.findBadgeTextFromTrace(decision.trace);
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
      badgeText,
      displayTag: decision.displayTag,
      styleMeta: decision.styleMeta,
      decisionTrace: {
        status: decision.status,
        action: decision.action,
        confidence: decision.confidence,
        confidenceLevel: decision.confidenceLevel,
        signalTag: decision.signalTag,
        badgeText,
        reason: decision.reason,
        trace: decision.trace,
      },
      contextSnapshot: {
        action: decision.action,
        confidence: decision.confidence,
        confidenceLevel: decision.confidenceLevel,
        signalTag: decision.signalTag,
        badgeText,
        reason: decision.reason,
      },
      ruleSnapshot: plan.ruleSnapshot,
    };
  }

  private findBadgeTextFromTrace(
    trace?: readonly DecisionExecutionTraceItem[],
  ): string | undefined {
    if (!Array.isArray(trace)) return undefined;
    for (let i = trace.length - 1; i >= 0; i--) {
      const item = trace[i];
      if (item?.badgeText && typeof item.badgeText === 'string') {
        return item.badgeText;
      }
      const ev = item?.evidence as Record<string, unknown> | undefined;
      if (ev?.badgeText && typeof ev.badgeText === 'string') {
        return ev.badgeText;
      }
    }
    return undefined;
  }
}

function assertPositiveInteger(value: unknown, label: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}
