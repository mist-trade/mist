import type {
  StrategyBar,
  StrategyRealtimeMarketDataPort,
  StrategyRealtimeSource,
} from '@app/market-data';
import { availabilityKey } from '../availability';
import { formatShanghaiDateString } from '@app/timezone';
import type { FactorPluginRegistry } from '../../factor/factor-plugin-registry';
import type { DecisionFlowNode } from '../../decision-flow/decision-flow.types';
import type { KernelSignal } from '../kernel.types';
import { StrategyEvaluationKernel } from '../strategy-evaluation-kernel';
import { HistoricalBarSource } from '../historical-bar-source';
import { validateBarSeriesWithPolars } from '@app/indicators';

export type RealtimeLastOutcome =
  | 'evaluated_matched'
  | 'evaluated_not_matched'
  | 'unavailable'
  | null;

export type RealtimeStrategyExecutionPlan = {
  readonly definitionId: number;
  readonly versionId: number;
  readonly source: StrategyRealtimeSource;
  /** 求值周期：该 plan 只在此周期的 bar 收盘时求值 */
  readonly period: number;
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
  /** 统一求值计划：编译边界已把全部来源 kind 透明编译为决策流树 */
  readonly kind: 'decision_flow';
  readonly flow: DecisionFlowNode;
  readonly signalKind?: 'entry' | 'exit';
  readonly requiredBarCount: number;
  /** context 周期 → 最少保留根数（编译产物） */
  readonly contextRequirements: Readonly<Record<number, number>>;
};

export type RealtimeWindowGroupIdentity = {
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;
};

export type PreMarketWarmupFailureReason =
  | 'insufficient_bars'
  | 'timestamp_reversed'
  | 'invalid_price'
  | 'price_boundary_violation'
  | 'contains_null_or_nan'
  | 'query_failed';

export interface PreMarketWarmupTarget {
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;
  readonly plans: readonly RealtimeStrategyExecutionPlan[];
}

export interface PreMarketWarmupReport {
  readonly total: number;
  readonly succeeded: number;
  readonly skipped: number;
  readonly failed: number;
  readonly failedTargets: readonly {
    readonly securityId: number;
    readonly source: StrategyRealtimeSource;
    readonly reason: PreMarketWarmupFailureReason;
    readonly message: string;
  }[];
}

interface KernelGroup {
  readonly kernel: StrategyEvaluationKernel;
  readonly planSignature: string;
}

/**
 * 实时链路的组级内核实例池：每 `(securityId, source)` 组一个统一内核，
 * 组内全部声明周期（求值周期 ∪ context 周期，含 1440 日线）各持一个滑窗。
 *
 * R2 数据接缝：hydration 的历史段（触发日之前）走 canonical 拼接源
 * （与回测同源），当日段只来自触发源（Redis 封存 1m + 派生），一天内不换源。
 * 组首根 Bar 触发懒加载 hydration；`warmup` 支持盘前主动预构建（09:20 屏障），
 * 预构建组在首根封存 Bar 到达时零历史 I/O。
 */
export class RealtimeKernelPool {
  private readonly groups = new Map<string, KernelGroup>();
  private readonly warmedTradingDays = new Map<string, string>();
  private lastOutcome: RealtimeLastOutcome = null;

  constructor(
    private readonly marketData: StrategyRealtimeMarketDataPort,
    private readonly registry?: FactorPluginRegistry,
  ) {}

  async push(
    bar: StrategyBar,
    plans: readonly RealtimeStrategyExecutionPlan[],
  ): Promise<readonly KernelSignal[]> {
    const key = groupKey(bar.securityId, bar.source);
    const planSignature = planSignatureOf(plans);
    let group = this.groups.get(key);
    if (!group || planSignature !== group.planSignature) {
      group = await this.buildGroup(bar, plans, planSignature);
      this.groups.set(key, group);
    }

    const signals = await group.kernel.push(bar);
    this.lastOutcome =
      signals.length > 0 ? 'evaluated_matched' : 'evaluated_not_matched';
    return signals;
  }

  retainGroups(groups: readonly RealtimeWindowGroupIdentity[]): void {
    const retained = new Set(
      groups.map((group) => groupKey(group.securityId, group.source)),
    );
    for (const key of [...this.groups.keys()]) {
      if (!retained.has(key)) {
        this.groups.delete(key);
        this.warmedTradingDays.delete(key);
      }
    }
  }

  reset(): void {
    this.groups.clear();
    this.warmedTradingDays.clear();
    this.lastOutcome = null;
  }

  /**
   * 盘前主动预热：为每个目标预构建组内核（全部声明周期）。
   * - 幂等：planSignature 一致且已预热的组直接跳过（skipped）；
   * - publicFrom = anchorAt（历史段全部落预热相，首根真实公开 Bar 触发公开相）；
   * - 单目标失败隔离，绝不抛出。
   */
  async warmup(
    targets: readonly PreMarketWarmupTarget[],
    anchorAt: Date,
  ): Promise<Readonly<PreMarketWarmupReport>> {
    const failedTargets: {
      securityId: number;
      source: StrategyRealtimeSource;
      reason: PreMarketWarmupFailureReason;
      message: string;
    }[] = [];
    let succeeded = 0;
    let skipped = 0;

    for (const target of targets) {
      const key = groupKey(target.securityId, target.source);
      const planSignature = planSignatureOf(target.plans);
      const existing = this.groups.get(key);
      if (existing && existing.planSignature === planSignature) {
        skipped += 1;
        continue;
      }
      try {
        const group = await this.buildGroup(
          syntheticAnchorBar(target, anchorAt),
          target.plans,
          planSignature,
          { validateIntegrity: true },
        );
        this.groups.set(key, group);
        this.warmedTradingDays.set(key, tradingDayOf(anchorAt));
        succeeded += 1;
      } catch (error) {
        const reason = classifyWarmupFailure(error);
        failedTargets.push({
          securityId: target.securityId,
          source: target.source,
          reason,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return Object.freeze({
      total: targets.length,
      succeeded,
      skipped,
      failed: failedTargets.length,
      failedTargets: Object.freeze(failedTargets),
    });
  }

  /** 交易日翻转守卫查询：是否存在为该交易日预热的组（有则不得清空评估态）。 */
  hasGroupsWarmedFor(tradingDay: string): boolean {
    for (const warmedDay of this.warmedTradingDays.values()) {
      if (warmedDay === tradingDay) return true;
    }
    return false;
  }

  diagnostics(): Readonly<{
    groupCount: number;
    rawBarCount: number;
    derivedBarCount: number;
    lastOutcome: RealtimeLastOutcome;
  }> {
    let rawBarCount = 0;
    let derivedBarCount = 0;
    for (const group of this.groups.values()) {
      for (const period of group.kernel.periods) {
        for (const bar of group.kernel.readWindow(period)) {
          if (bar.rawBar.period === 1) rawBarCount += 1;
          else derivedBarCount += 1;
        }
      }
    }
    return Object.freeze({
      groupCount: this.groups.size,
      rawBarCount,
      derivedBarCount,
      lastOutcome: this.lastOutcome,
    });
  }

  private async buildGroup(
    bar: StrategyBar,
    plans: readonly RealtimeStrategyExecutionPlan[],
    planSignature: string,
    options?: { readonly validateIntegrity?: boolean },
  ): Promise<KernelGroup> {
    if (plans.length === 0) {
      throw new TypeError('kernel group requires at least one plan');
    }
    // 声明周期集合 = ∪ plans 的求值周期 ∪ contextRequirements keys
    const periods = new Set<number>();
    for (const plan of plans) {
      assertCapacity(plan.requiredBarCount);
      periods.add(plan.period);
      for (const [rawPeriod, rawBars] of Object.entries(
        plan.contextRequirements ?? {},
      )) {
        const period = Number(rawPeriod);
        assertCapacity(period);
        assertCapacity(rawBars);
        periods.add(period);
      }
    }

    // 逐周期 hydration：历史（触发日之前）canonical + 当日触发源
    const hydratedByPeriod = new Map<number, StrategyBar[]>();
    let securityCode = bar.securityCode;
    for (const period of [...periods].sort((left, right) => left - right)) {
      let budget = 0;
      for (const plan of plans) {
        if (plan.period === period) {
          budget = Math.max(budget, plan.requiredBarCount);
        }
        const contextDemand = plan.contextRequirements?.[period];
        if (typeof contextDemand === 'number') {
          budget = Math.max(budget, contextDemand);
        }
      }
      const hydrated = await this.marketData.loadRealtimeWindow({
        securityId: bar.securityId,
        source: requireRealtimeSource(bar.source),
        securityCode: bar.securityCode,
        period,
        anchorAt: bar.timestamp,
        anchorAvailabilityMs: availabilityKey(bar).getTime(),
        requiredBars: Math.max(1, budget),
      });
      // 防御：响应必须只含请求周期的 bar（混周期响应会污染窗口/触发未声明周期异常）
      const ordered = dedupeHydration(
        hydrated.bars.filter((candidate) => candidate.period === period),
        bar,
      );
      if (options?.validateIntegrity) {
        const validation = validateBarSeriesWithPolars(
          ordered,
          Math.max(1, budget),
        );
        if (!validation.ok) {
          throw new WarmupDataIntegrityError(validation.reason);
        }
      }
      hydratedByPeriod.set(period, [...ordered]);
      if (!securityCode) {
        securityCode = hydrated.bars.find((b) => b.securityCode)?.securityCode;
      }
    }

    const kernel = new StrategyEvaluationKernel({
      securityId: bar.securityId,
      securityCode: securityCode ?? String(bar.securityId),
      publicFrom: bar.timestamp,
      registry: this.registry,
      plans: plans.map((plan) => ({
        definitionId: plan.definitionId,
        versionId: plan.versionId,
        flow: plan.flow,
        signalKind: plan.signalKind,
        ruleSnapshot: plan.ruleSnapshot,
        period: plan.period,
        requiredBarCount: plan.requiredBarCount,
        contextRequirements: plan.contextRequirements ?? {},
      })),
    });
    const group: KernelGroup = { kernel, planSignature };
    // 预热段跨周期按可用时刻归并推进（预热相不评估，周期间顺序不影响内容）
    for (const bar of HistoricalBarSource.mergeByAvailability(
      hydratedByPeriod,
    )) {
      await kernel.push(bar);
    }
    return group;
  }
}

/** 盘前预热的合成锚 Bar：仅作为 publicFrom 与 hydration anchor，永不进入窗口。 */
function syntheticAnchorBar(
  target: PreMarketWarmupTarget,
  anchorAt: Date,
): StrategyBar {
  return Object.freeze({
    securityId: target.securityId,
    source: target.source,
    period: 1,
    timestamp: anchorAt,
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: null,
    amount: null,
    type: 'complete' as const,
  });
}

function tradingDayOf(timestamp: Date): string {
  return formatShanghaiDateString(timestamp);
}

function classifyWarmupFailure(error: unknown): PreMarketWarmupFailureReason {
  if (error instanceof WarmupDataIntegrityError) return error.reason;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('insufficient')) return 'insufficient_bars';
  if (message.includes('timestamp')) return 'timestamp_reversed';
  if (message.includes('price boundary')) return 'price_boundary_violation';
  if (message.includes('null') || message.includes('NaN')) {
    return 'contains_null_or_nan';
  }
  if (message.includes('invalid price')) return 'invalid_price';
  return 'query_failed';
}

function dedupeHydration(
  bars: readonly StrategyBar[],
  anchor: StrategyBar,
): readonly StrategyBar[] {
  const anchorAvailability = availabilityKey(anchor).getTime();
  const byPeriod = new Map<number, StrategyBar[]>();
  for (const bar of bars) {
    if (availabilityKey(bar).getTime() >= anchorAvailability) continue;
    const list = byPeriod.get(bar.period);
    if (list) list.push(bar);
    else byPeriod.set(bar.period, [bar]);
  }
  const result: StrategyBar[] = [];
  for (const [, list] of byPeriod) {
    list.sort(
      (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
    );
    for (let index = 1; index < list.length; index += 1) {
      const previous = list[index - 1];
      const current = list[index];
      if (previous.timestamp.getTime() === current.timestamp.getTime()) {
        if (sameBar(previous, current)) {
          list.splice(index, 1);
          index -= 1;
          continue;
        }
        throw new Error(
          'hydration contains conflicting StrategyBar identities',
        );
      }
    }
    result.push(...list);
  }
  return result;
}

export class WarmupDataIntegrityError extends Error {
  constructor(readonly reason: PreMarketWarmupFailureReason) {
    super(`pre-market warmup data integrity failure: ${reason}`);
    this.name = 'WarmupDataIntegrityError';
  }
}

function sameBar(left: StrategyBar, right: StrategyBar): boolean {
  return (
    left.securityId === right.securityId &&
    left.source === right.source &&
    left.period === right.period &&
    left.timestamp.getTime() === right.timestamp.getTime() &&
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    left.volume === right.volume &&
    left.amount === right.amount &&
    left.type === right.type
  );
}

function requireRealtimeSource(
  source: StrategyBar['source'],
): StrategyRealtimeSource {
  if (source !== 'tdx' && source !== 'qmt') {
    throw new TypeError('realtime window source must be tdx or qmt');
  }
  return source;
}

function assertCapacity(capacity: number): void {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new TypeError(
      'strategy window capacity must be a positive safe integer',
    );
  }
}

function groupKey(securityId: number, source: string): string {
  return `${securityId}\u0000${source}`;
}

function planSignatureOf(
  plans: readonly RealtimeStrategyExecutionPlan[],
): string {
  return plans
    .map((plan) => `${plan.definitionId}:${plan.versionId}`)
    .sort()
    .join(',');
}
