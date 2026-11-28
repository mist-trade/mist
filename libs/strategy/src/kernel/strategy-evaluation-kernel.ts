import type { ProjectedStrategyBar, StrategyBar } from '@app/market-data';
import { StrategySeriesImputer } from '@app/market-data';
import { DECISION_ACTIONS } from '../strategy.constants';
import type { DecisionResult } from '../decision-flow/decision-flow.types';
import { DecisionFlowEvaluator } from '../decision-flow/decision-flow-evaluator';
import {
  extractPivotEvidence,
  findBadgeTextFromTrace,
  selectPassingGuardTraceItems,
} from '../decision-flow/decision-pivot-evidence';
import type { FactorContext } from '../factor/factor.types';
import type { FactorPluginRegistry } from '../factor/factor-plugin-registry';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import { collectVirtualExitBindings } from '../virtual-exit/collect-bindings';
import type {
  VirtualExitChannelSpec,
  VirtualExitPolicyPort,
  VirtualExitProposal,
} from '../virtual-exit/virtual-exit.port';
import { contextSeriesKey, isMissingContextSeriesError } from './availability';
import {
  collectContextPrefetchSpecs,
  type ContextPrefetchSpec,
} from './context-prefetch';
import type {
  KernelConfig,
  KernelDiagnostics,
  KernelPeriodDiagnostics,
  KernelPlan,
  KernelSignal,
  PrewarmStatus,
  SignalChannelRef,
  SignalIntent,
} from './kernel.types';

const VIRTUAL_EXIT_TRACE_NODE_TYPE = 'VIRTUAL_EXIT';

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
  private readonly registry: FactorPluginRegistry;
  private readonly contextPrefetchSpecs: readonly ContextPrefetchSpec[];
  private readonly prefetchPeriodsByCacheKey = new Map<string, Set<number>>();
  private readonly windows = new Map<number, StrategySeriesImputer>();

  private readonly externalWindows = new Map<string, ExternalWindowState>();
  private readonly externalBySecurityId = new Map<
    number,
    ExternalWindowState[]
  >();
  private readonly externalBySecurityCode = new Map<
    string,
    ExternalWindowState[]
  >();
  private readonly budgets = new Map<number, number>();
  private readonly cursors = new Map<number, number>();
  private readonly preWarmActual = new Map<number, number>();
  private readonly preWarmEvaluated = new Set<number>();
  private readonly preWarmStatus = new Map<number, PrewarmStatus>();
  private readonly surveillancePeriods: ReadonlySet<number>;
  private readonly surveillanceCursors = new Map<number, number>();

  private publicBarCount = 0;
  private emittedSignalCount = 0;
  private planSkips = 0;
  private readonly virtualExitPolicy?: VirtualExitPolicyPort;

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
    const surveillanceSet = new Set<number>();
    for (const rawPeriod of config.surveillancePeriods ?? []) {
      assertPositiveInteger(rawPeriod, 'surveillancePeriods');
      surveillanceSet.add(rawPeriod);
    }
    for (const plan of config.plans) {
      for (const rawPeriod of plan.surveillancePeriods ?? []) {
        assertPositiveInteger(rawPeriod, 'plan.surveillancePeriods');
        surveillanceSet.add(rawPeriod);
      }
    }
    this.surveillancePeriods = surveillanceSet;
    // 跨标的上下文窗口：按声明创建独立滑窗（与自身窗口同机制，仅落窗不求值）
    for (const plan of config.plans) {
      for (const req of plan.externalContextRequirements ?? []) {
        assertPositiveInteger(req.period, 'externalContextRequirements.period');
        assertPositiveInteger(
          req.minBars,
          'externalContextRequirements.minBars',
        );
        if (
          typeof req.securityCode !== 'string' ||
          req.securityCode.length === 0
        ) {
          throw new TypeError(
            'externalContextRequirements.securityCode is required',
          );
        }
        const key = externalWindowKey(req.securityCode, req.period);
        if (this.externalWindows.has(key)) continue;
        const state: ExternalWindowState = {
          securityCode: req.securityCode,
          period: req.period,
          imputer: new StrategySeriesImputer(),
          budget: req.minBars,
          preWarmActual: 0,
        };
        this.externalWindows.set(key, state);
        const byId = req.securityId ?? -1;
        const listId = this.externalBySecurityId.get(byId) ?? [];
        listId.push(state);
        this.externalBySecurityId.set(byId, listId);
        const listCode =
          this.externalBySecurityCode.get(req.securityCode) ?? [];
        listCode.push(state);
        this.externalBySecurityCode.set(req.securityCode, listCode);
      }
    }

    const registry = config.registry ?? new InMemoryFactorPluginRegistry();
    this.registry = registry;
    this.evaluator = new DecisionFlowEvaluator({ registry });
    const dedupedPrefetch = new Map<string, ContextPrefetchSpec>();
    for (const plan of this.plans) {
      for (const spec of collectContextPrefetchSpecs(plan.flow, registry)) {
        if (!dedupedPrefetch.has(spec.cacheKey)) {
          dedupedPrefetch.set(spec.cacheKey, spec);
        }
        let periods = this.prefetchPeriodsByCacheKey.get(spec.cacheKey);
        if (!periods) {
          periods = new Set<number>();
          this.prefetchPeriodsByCacheKey.set(spec.cacheKey, periods);
        }
        periods.add(plan.period);
      }
    }
    this.contextPrefetchSpecs = [...dedupedPrefetch.values()];

    // 通道级虚拟出场：收集各插件声明的规则，一次性交给外部策略实现。
    this.virtualExitPolicy = config.virtualExitPolicy;
    if (this.virtualExitPolicy) {
      const specs: VirtualExitChannelSpec[] = [];
      for (const plan of this.plans) {
        const bindings = collectVirtualExitBindings(plan.flow, registry);
        if (bindings.length === 0) continue;
        specs.push({
          channel: {
            definitionId: plan.definitionId,
            versionId: plan.versionId,
            period: plan.period,
          },
          bindings,
        });
      }
      this.virtualExitPolicy.configure(specs);
    }
  }

  /**
   * 推进一根 Bar，返回该根当期增量信号。
   * 重复/乱序 Bar（同周期内 timestamp <= 游标）静默忽略并返回空数组。
   */
  public async push(bar: StrategyBar): Promise<readonly KernelSignal[]> {
    // 跨标的路由：外部标的的 bar 只落窗不求值；未声明的外部 bar 静默忽略。
    if (bar.securityId !== this.securityId) {
      this.pushExternal(bar);
      return [];
    }

    // 轻量监控周期快路径（如日线计划挂载 5m 穿透）：跳过主策略树与滑窗，公开相直通 virtualExitPolicy.onBar
    if (
      !this.windows.has(bar.period) &&
      this.surveillancePeriods.has(bar.period)
    ) {
      return this.pushSurveillanceBar(bar);
    }

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
      this.virtualExitPolicy?.onPrewarmBar?.(bar, bar.period);
      return [];
    }

    // 该周期首个公开 Bar：预热相结束，只要预热相收到过 Bar（actual > 0），
    // 即先做一次静默预热求值，把自身门限已满足的子插件单调游标推进至预热结束时刻
    // （即使整体处于 partial 预热状态，也能杜绝历史形态点在公开相首根被倾泻发射）。
    if (!this.preWarmEvaluated.has(bar.period)) {
      this.preWarmEvaluated.add(bar.period);
      const actual = this.preWarmActual.get(bar.period) ?? 0;
      const budget = this.budgets.get(bar.period)!;
      this.preWarmStatus.set(
        bar.period,
        actual === 0 ? 'empty' : actual >= budget ? 'full' : 'partial',
      );
      if (actual > 0 && this.cursors.get(bar.period) !== undefined) {
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

    // 同 Bar 先出后进（Exit-Before-Entry）：先对前序已持仓执行虚拟出场巡检，
    // 再求值当期决策流并注册本根新信号，杜绝新建仓在同一根 Bar 内立即误触发出场。
    const virtualExits = this.evaluateVirtualExitsOnBar(bar);
    const signals = await this.evaluatePublic(bar);
    this.notifyVirtualExitSignals(signals);
    const emitted =
      virtualExits.length === 0
        ? signals
        : signals.length === 0
          ? virtualExits
          : [...virtualExits, ...signals];
    this.emittedSignalCount += emitted.length;
    return emitted;
  }

  private pushSurveillanceBar(bar: StrategyBar): readonly KernelSignal[] {
    const ts = bar.timestamp.getTime();
    const cursor = this.surveillanceCursors.get(bar.period);
    if (cursor !== undefined && ts <= cursor) {
      return [];
    }
    this.surveillanceCursors.set(bar.period, ts);
    if (ts < this.publicFrom.getTime()) {
      this.virtualExitPolicy?.onPrewarmBar?.(bar, bar.period);
      return [];
    }
    this.publicBarCount += 1;
    const virtualExits = this.evaluateVirtualExitsOnBar(bar);
    this.emittedSignalCount += virtualExits.length;
    return virtualExits;
  }

  private evaluateVirtualExitsOnBar(bar: StrategyBar): readonly KernelSignal[] {
    const policy = this.virtualExitPolicy;
    if (!policy) return [];
    const proposals = policy.onBar(bar, bar.period);
    if (proposals.length === 0) return [];
    return proposals.map((proposal) =>
      this.buildVirtualExitSignal(proposal, bar),
    );
  }

  private notifyVirtualExitSignals(signals: readonly KernelSignal[]): void {
    const policy = this.virtualExitPolicy;
    if (!policy || signals.length === 0) return;
    for (const signal of signals) {
      policy.onSignal(signal);
    }
  }

  private buildVirtualExitSignal(
    proposal: VirtualExitProposal,
    bar: StrategyBar,
  ): KernelSignal {
    const { channel } = proposal;
    return {
      definitionId: channel.definitionId,
      versionId: channel.versionId,
      signalKind: 'exit',
      channel,
      triggerPeriod: bar.period,
      intent: 'EXIT',
      originPluginId: proposal.ownerPluginId,
      signalTime: bar.timestamp,
      triggerPrice: bar.close,
      pivotTime: null,
      pivotPrice: null,
      signalType: 'VIRTUAL_EXIT',
      badgeText: proposal.badgeText,
      displayTag: `VIRTUAL_EXIT_${proposal.exitKind}`,
      decisionTrace: {
        status: 'SIGNAL_EMITTED',
        action: 'SELL',
        ruleId: proposal.ruleId,
        exitKind: proposal.exitKind,
        reason: proposal.reason,
        badgeText: proposal.badgeText,
        trace: [
          {
            nodeId: proposal.ruleId,
            type: VIRTUAL_EXIT_TRACE_NODE_TYPE,
            pluginId: proposal.ownerPluginId,
            name: proposal.badgeText || proposal.exitKind,
            action: DECISION_ACTIONS.SELL,
            reason: proposal.reason,
          },
        ],
      },
      contextSnapshot: {
        exitKind: proposal.exitKind,
        ruleId: proposal.ruleId,
        ...(proposal.evidence ?? {}),
      },
      ruleSnapshot: {},
    };
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
    const externalWindows = [...this.externalWindows.values()].map((w) => ({
      securityCode: w.securityCode,
      period: w.period,
      windowSize: w.imputer.read().length,
      budget: w.budget,
    }));
    return {
      externalWindows,
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

  private pushExternal(bar: StrategyBar): void {
    const states =
      this.externalBySecurityId.get(bar.securityId) ??
      (bar.securityCode
        ? this.externalBySecurityCode.get(bar.securityCode)
        : undefined);
    if (!states) return;
    const state = states.find((w) => w.period === bar.period);
    if (!state) return;
    const ts = bar.timestamp.getTime();
    if (state.cursor !== undefined && ts <= state.cursor) return;
    state.imputer.append(bar);
    while (state.imputer.read().length > state.budget) state.imputer.trim();
    if (ts < this.publicFrom.getTime()) state.preWarmActual += 1;
    state.cursor = ts;
  }

  private externalWindowOf(
    securityCode: string,
    period: number,
  ): ExternalWindowState | undefined {
    return this.externalWindows.get(externalWindowKey(securityCode, period));
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
    const attributes = new Map<string, unknown>();

    // 窗口注入（统一键）：series.<securityCode>.<period>，本标的与外部标的同规则。
    // 全部是窗口已 push 内容（push 序即因果序，无未来数据）。
    for (const period of this.periods) {
      attributes.set(
        contextSeriesKey(this.securityCode, period),
        Object.freeze(this.windows.get(period)!.read()),
      );
    }
    for (const state of this.externalWindows.values()) {
      attributes.set(
        contextSeriesKey(state.securityCode, state.period),
        Object.freeze(state.imputer.read()),
      );
    }

    return {
      securityId: this.securityId,
      securityCode: this.securityCode,
      timestamp,
      period: evalPeriod,
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
    for (const req of plan.externalContextRequirements ?? []) {
      const state = this.externalWindowOf(req.securityCode, req.period);
      if (!state || state.imputer.read().length < req.minBars) {
        return false;
      }
    }
    return true;
  }

  /** context 角色（2026-11-24 定稿，决策文档 7.1.1）：对决策流中引用到的每个
   *  role:'context' 插件 (pluginId, params) 组合每 Bar 预求值一次，opinion 写入
   *  黑板；GUARD/EXTRACTOR 节点按相同键读缓存，不再逐 flow 重复求值。
   *  context 插件严禁作为终端信号发射源（状态可见性走 decisionTrace.trace）。 */
  private async prefetchContextOpinions(
    baseContext: FactorContext,
    missingContextErrors: Map<string, Error>,
  ): Promise<void> {
    for (const spec of this.contextPrefetchSpecs) {
      if (
        !this.prefetchPeriodsByCacheKey
          .get(spec.cacheKey)
          ?.has(baseContext.period)
      ) {
        continue;
      }
      const plugin = this.registry.get(spec.pluginId);
      if (!plugin) continue;
      const callContext: FactorContext = {
        ...baseContext,
        attributes: new Map(baseContext.attributes),
      };
      try {
        const opinion = await plugin.evaluate(callContext, spec.params);
        baseContext.attributes.set(spec.cacheKey, opinion);
      } catch (error) {
        if (isMissingContextSeriesError(error)) {
          missingContextErrors.set(spec.cacheKey, error);
          continue;
        }
        throw error;
      }
    }
  }

  /** 预热相静默求值：仅推进该周期 plan 的插件游标，信号全部丢弃。 */
  private async evaluateSilent(period: number, timestamp: Date): Promise<void> {
    const baseContext = this.buildContext(timestamp, period);
    const missingContextErrors = new Map<string, Error>();
    await this.prefetchContextOpinions(baseContext, missingContextErrors);
    for (const plan of this.plans) {
      if (plan.period !== period) continue;
      if (!this.contextReady(plan)) continue;
      const planContext: FactorContext = {
        ...baseContext,
        attributes: new Map(baseContext.attributes),
      };
      try {
        await this.evaluator.evaluate(plan.flow, planContext, {
          planScope: planScopeOf(plan),
          missingContextErrors,
        });
      } catch (error) {
        if (isMissingContextSeriesError(error)) {
          continue;
        }
        throw error;
      }
    }
  }

  private async evaluatePublic(
    bar: StrategyBar,
  ): Promise<readonly KernelSignal[]> {
    const baseContext = this.buildContext(bar.timestamp, bar.period);
    const missingContextErrors = new Map<string, Error>();
    await this.prefetchContextOpinions(baseContext, missingContextErrors);
    const signals: KernelSignal[] = [];
    for (const plan of this.plans) {
      if (plan.period !== bar.period) continue;
      if (!this.contextReady(plan)) {
        this.planSkips += 1;
        continue;
      }
      const planContext: FactorContext = {
        ...baseContext,
        attributes: new Map(baseContext.attributes),
      };
      let decision: DecisionResult;
      try {
        decision = await this.evaluator.evaluate(plan.flow, planContext, {
          planScope: planScopeOf(plan),
          missingContextErrors,
        });
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
    const pivot = extractPivotEvidence(decision);
    const badgeText =
      decision.badgeText ?? findBadgeTextFromTrace(decision.trace);
    const channel: SignalChannelRef = {
      definitionId: plan.definitionId,
      versionId: plan.versionId,
      period: plan.period,
    };
    const intent: SignalIntent = isBuy ? 'ENTRY' : 'EXIT';
    const originPluginId = this.findOriginPluginId(decision);
    return {
      definitionId: plan.definitionId,
      versionId: plan.versionId,
      signalKind: plan.signalKind ?? (isBuy ? 'entry' : 'exit'),
      channel,
      triggerPeriod: bar.period,
      intent,
      ...(originPluginId ? { originPluginId } : {}),
      signalTime: bar.timestamp,
      triggerPrice,
      pivotTime: pivot?.pivotTime ?? null,
      pivotPrice: pivot?.pivotPrice ?? null,
      signalType: decision.signalTag ?? decision.action ?? 'decision_flow',
      badgeText,
      displayTag: decision.displayTag,
      styleMeta: decision.styleMeta,
      decisionTrace: {
        status: decision.status,
        action: decision.action,
        signalTag: decision.signalTag,
        badgeText,
        reason: decision.reason,
        trace: decision.trace,
        ...(decision.evidence ? { evidence: decision.evidence } : {}),
      },
      contextSnapshot: {
        action: decision.action,
        signalTag: decision.signalTag,
        badgeText,
        reason: decision.reason,
      },
      ruleSnapshot: plan.ruleSnapshot,
    };
  }

  /**
   * 归属插件：跳过失败节点、EXTRACTOR 与非必要 context 节点，
   * 取轨迹中最后一个已通过且与最终 action 一致的插件节点（仅当零非 context 节点时兜底 context）。
   * 仅用于归因观测；通道归属始终按 (definitionId, period)，与插件无关。
   */
  private findOriginPluginId(decision: DecisionResult): string | undefined {
    const items = selectPassingGuardTraceItems(decision.trace);
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item.pluginId) continue;
      if (item.action === undefined || item.action === decision.action) {
        return item.pluginId;
      }
    }
    return undefined;
  }
}

interface ExternalWindowState {
  readonly securityCode: string;
  readonly period: number;
  readonly imputer: StrategySeriesImputer;
  readonly budget: number;
  cursor?: number;
  preWarmActual: number;
}

function externalWindowKey(securityCode: string, period: number): string {
  return `${securityCode}\u0000${period}`;
}

function planScopeOf(plan: KernelPlan): string {
  return `${plan.definitionId}:${plan.versionId}:${plan.period}`;
}

function assertPositiveInteger(value: unknown, label: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}
