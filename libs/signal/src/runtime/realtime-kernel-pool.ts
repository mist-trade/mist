import type {
  StrategyBar,
  StrategyRealtimeMarketDataPort,
  StrategyRealtimeSource,
} from '@app/market-data';
import type { KernelSignal } from '@app/strategy';
import { StrategyEvaluationKernel } from '@app/strategy';
import type { RealtimeStrategyExecutionPlan } from './realtime-strategy-evaluation.service';
import type { RealtimeWindowGroupIdentity } from './realtime-strategy-evaluation.service';

export type RealtimeLastOutcome =
  | 'evaluated_matched'
  | 'evaluated_not_matched'
  | 'unavailable'
  | null;

interface KernelGroup {
  readonly kernel: StrategyEvaluationKernel;
  readonly planSignature: string;
  readonly capacity: number;
  lastPushedMs: number | null;
}

/**
 * 实时链路的组级内核实例池：每 `(securityId, source, period)` 组一个统一内核，
 * 组内全部策略计划共享同一滑窗（吸收 SharedStrategyWindowStore 分组语义）。
 *
 * 组首根 Bar 触发 hydration：`loadRealtimeWindow` 拉取的历史段作为预热段
 * push 进内核（publicFrom = 触发 hydration 的当前封存 Bar 时间戳），随后
 * 当前 Bar 进入公开相。plans 变化（定义/版本集合或窗口预算增长）时重建组内核。
 */
export class RealtimeKernelPool {
  private readonly groups = new Map<string, KernelGroup>();
  private lastOutcome: RealtimeLastOutcome = null;

  constructor(private readonly marketData: StrategyRealtimeMarketDataPort) {}

  async push(
    bar: StrategyBar,
    plans: readonly RealtimeStrategyExecutionPlan[],
  ): Promise<readonly KernelSignal[]> {
    const key = groupKey(bar.securityId, bar.source, bar.period);
    const requiredBars = Math.max(
      ...plans.map((plan) => plan.requiredBarCount),
    );
    const planSignature = planSignatureOf(plans);
    let group = this.groups.get(key);
    if (!group || planSignature !== group.planSignature) {
      group = await this.buildGroup(bar, plans, requiredBars, planSignature);
      this.groups.set(key, group);
    }

    if (
      group.lastPushedMs !== null &&
      bar.timestamp.getTime() <= group.lastPushedMs
    ) {
      this.lastOutcome = 'evaluated_not_matched';
      return Object.freeze([]);
    }

    const signals = await group.kernel.push(bar);
    group.lastPushedMs = bar.timestamp.getTime();
    this.lastOutcome =
      signals.length > 0 ? 'evaluated_matched' : 'evaluated_not_matched';
    return signals;
  }

  retainGroups(groups: readonly RealtimeWindowGroupIdentity[]): void {
    const retained = new Set(
      groups.map((group) =>
        groupKey(group.securityId, group.source, group.period),
      ),
    );
    for (const key of this.groups.keys()) {
      if (!retained.has(key)) this.groups.delete(key);
    }
  }

  reset(): void {
    this.groups.clear();
    this.lastOutcome = null;
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
      for (const bar of group.kernel.readWindow()) {
        if (bar.rawBar.period === 1) rawBarCount += 1;
        else derivedBarCount += 1;
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
    requiredBars: number,
    planSignature: string,
  ): Promise<KernelGroup> {
    assertCapacity(requiredBars);
    // 组首根（或重建）：hydration 拉取的历史段全部早于当前 Bar 时间戳，
    // 内核以当前 Bar 时间戳为 publicFrom，把历史段作为预热相静默消化。
    const hydrated = await this.marketData.loadRealtimeWindow({
      securityId: bar.securityId,
      source: requireRealtimeSource(bar.source),
      period: bar.period,
      anchorAt: bar.timestamp,
      requiredBars,
    });
    const kernel = new StrategyEvaluationKernel({
      securityId: bar.securityId,
      securityCode: String(bar.securityId),
      period: bar.period,
      publicFrom: bar.timestamp,
      plans: plans.map((plan) => ({
        definitionId: plan.definitionId,
        versionId: plan.versionId,
        flow: plan.flow,
        signalKind: plan.signalKind,
        ruleSnapshot: plan.ruleSnapshot,
        requiredBarCount: plan.requiredBarCount,
      })),
    });
    const group: KernelGroup = {
      kernel,
      planSignature,
      capacity: requiredBars,
      lastPushedMs: null,
    };
    const ordered = dedupeHydration(hydrated.bars, bar);
    for (const hydratedBar of ordered) {
      await kernel.push(hydratedBar);
    }
    return group;
  }
}

function dedupeHydration(
  bars: readonly StrategyBar[],
  anchor: StrategyBar,
): readonly StrategyBar[] {
  const ordered = [...bars]
    .filter(
      (bar) =>
        bar.timestamp.getTime() < anchor.timestamp.getTime() &&
        bar.period === anchor.period,
    )
    .sort(
      (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
    );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.timestamp.getTime() === current.timestamp.getTime()) {
      if (sameBar(previous, current)) {
        ordered.splice(index, 1);
        index -= 1;
        continue;
      }
      throw new Error('hydration contains conflicting StrategyBar identities');
    }
  }
  return ordered;
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

function groupKey(
  securityId: number,
  source: StrategyBar['source'],
  period: number,
): string {
  return `${securityId}\u0000${source}\u0000${period}`;
}

function planSignatureOf(
  plans: readonly RealtimeStrategyExecutionPlan[],
): string {
  return plans
    .map((plan) => `${plan.definitionId}:${plan.versionId}`)
    .sort()
    .join(',');
}
