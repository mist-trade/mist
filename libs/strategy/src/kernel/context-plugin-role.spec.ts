import { StrategyEvaluationKernel } from './strategy-evaluation-kernel';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import type { FactorOpinion, FactorPlugin } from '../factor/factor.types';
import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';
import type { StrategyBar } from '@app/market-data';
import { normalizeExternalDecimalText } from '../../../decimal/src/decimal8';

function makeBar(time: Date, close = 10, period = 30): StrategyBar {
  return Object.freeze({
    securityId: 1,
    source: 'tdx' as const,
    period,
    timestamp: time,
    open: close - 0.5,
    high: close + 1.0,
    low: close - 1.0,
    close,
    volume: normalizeExternalDecimalText('1000'),
    amount: normalizeExternalDecimalText('10000'),
    type: 'complete' as const,
  });
}

function makePlugin(
  id: string,
  role?: 'context',
): FactorPlugin & { evaluate: jest.Mock } {
  return {
    id,
    name: id,
    category: 'REGIME' as const,
    version: '1.0.0',
    description: 'context-role test plugin',
    ...(role ? { role } : {}),
    evaluate: jest.fn(
      async (): Promise<FactorOpinion> => ({
        action: 'BUY',
        reason: 'context ok',
      }),
    ),
  } as unknown as FactorPlugin & { evaluate: jest.Mock };
}

function guard(
  id: string,
  pluginId: string,
  next: DecisionFlowNode,
): DecisionFlowNode {
  return {
    id,
    type: 'GUARD',
    name: id,
    pluginId,
    requiredAction: 'BOTH',
    onPass: next,
    onFail: {
      id: `${id}-fail`,
      type: 'TERMINAL',
      action: 'ABORT',
      reason: 'guard failed',
    },
  } as DecisionFlowNode;
}

const terminal: DecisionFlowNode = {
  id: 'term',
  type: 'TERMINAL',
  action: 'INHERIT',
  signalTag: 'CONTEXT_ROLE_TEST',
  reason: 'both guards passed',
} as DecisionFlowNode;

function makeKernel(
  plugin: FactorPlugin,
  bars: StrategyBar[],
): StrategyEvaluationKernel {
  const registry = new InMemoryFactorPluginRegistry();
  registry.register(plugin);
  const flow = guard('g1', plugin.id, guard('g2', plugin.id, terminal));
  return new StrategyEvaluationKernel({
    securityId: 1,
    securityCode: '000001',
    publicFrom: bars[0].timestamp,
    registry,
    plans: [
      {
        definitionId: 1,
        versionId: 1,
        flow,
        ruleSnapshot: Object.freeze({}),
        period: 30,
        requiredBarCount: 1,
        contextRequirements: {},
      },
    ],
  });
}

describe('kernel role:context plugin support (2026-11-24, 决策文档 7.1.1)', () => {
  const startTime = new Date('2025-10-01T09:30:00.000Z');
  const bars = Array.from({ length: 8 }, (_, i) =>
    makeBar(new Date(startTime.getTime() + i * 30 * 60000)),
  );

  it('prefetches a role:context plugin ONCE per bar and every referencing guard reads the cache', async () => {
    const plugin = makePlugin('plugin.test.context', 'context');
    const kernel = makeKernel(plugin, bars);

    const signals = [];
    for (const bar of bars) {
      signals.push(...(await kernel.push(bar)));
    }

    // 8 bars x 2 guards -> 2 evaluations per bar WITHOUT the cache; the cache
    // collapses to exactly one evaluation per bar (the kernel prefetch).
    expect(plugin.evaluate).toHaveBeenCalledTimes(bars.length);
    // the flow still emits: guards pass off the cached opinion
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signalType).toBe('CONTEXT_ROLE_TEST');
  });

  it('default role (undefined) keeps direct per-guard evaluation semantics', async () => {
    const plugin = makePlugin('plugin.test.signal');
    const kernel = makeKernel(plugin, bars);

    for (const bar of bars) {
      await kernel.push(bar);
    }

    // no cache: each of the 2 guards evaluates the plugin on every bar
    expect(plugin.evaluate).toHaveBeenCalledTimes(bars.length * 2);
  });
});
