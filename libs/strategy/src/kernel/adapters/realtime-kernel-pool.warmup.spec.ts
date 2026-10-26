import type { StrategyBar } from '@app/market-data';
import {
  RealtimeKernelPool,
  type PreMarketWarmupTarget,
  type RealtimeStrategyExecutionPlan,
} from './realtime-kernel-pool';
import { InMemoryFactorPluginRegistry } from '../../factor/factor-plugin-registry';
import type { FactorPlugin } from '../../factor/factor.types';

class AlwaysBuyPlugin implements FactorPlugin {
  public readonly id = 'plugin.test.warmup-buy';
  public readonly name = '恒真插件';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '1.0.0';
  public readonly description = 'test';
  public readonly paramSchema = {};

  public async evaluate(): Promise<FactorOpinion> {
    return { action: 'BUY', confidence: 0.9, reason: 'always buy' };
  }
}

import type { FactorOpinion } from '../../factor/factor.types';

function makeRegistry() {
  const registry = new InMemoryFactorPluginRegistry();
  registry.register(new AlwaysBuyPlugin());
  return registry;
}

function plan(
  overrides?: Partial<RealtimeStrategyExecutionPlan>,
): RealtimeStrategyExecutionPlan {
  return {
    definitionId: 1,
    versionId: 1,
    source: 'qmt',
    period: 30,
    ruleSnapshot: Object.freeze({}),
    kind: 'decision_flow',
    flow: {
      id: 'guard',
      type: 'GUARD',
      name: 'gate',
      pluginId: 'plugin.test.warmup-buy',
      requiredAction: 'BUY',
      minConfidence: 0.5,
      onPass: {
        id: 'term',
        type: 'TERMINAL',
        action: 'BUY',
        signalTag: 'WARM',
        reason: 'pass',
      },
    },
    requiredBarCount: 5,
    contextRequirements: {},
    ...overrides,
  };
}

function historicalBars(count: number, period: number): StrategyBar[] {
  const start = Date.UTC(2026, 7, 3, 1, 30);
  return Array.from({ length: count }, (_, i) => ({
    securityId: 7,
    source: 'qmt' as const,
    period,
    timestamp: new Date(start + i * period * 60_000),
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume: '1',
    amount: '1',
    type: 'complete' as const,
  }));
}

function fakePort(historical: readonly StrategyBar[]) {
  const loadRealtimeWindow = jest
    .fn()
    .mockImplementation((criteria: { period: number }) =>
      Promise.resolve({
        bars: historical.filter((bar) => bar.period === criteria.period),
      }),
    );
  return { loadRealtimeWindow, resolveRealtimeObservation: jest.fn() };
}

const ANCHOR = new Date('2026-08-04T01:20:00.000Z'); // 09:20 上海

describe('RealtimeKernelPool.warmup（盘前多周期预热）', () => {
  it('pre-builds group kernels so the first trigger evaluates with zero historical I/O', async () => {
    const port = fakePort(historicalBars(10, 30));
    const pool = new RealtimeKernelPool(port as never, makeRegistry());
    const targets: PreMarketWarmupTarget[] = [
      { securityId: 7, source: 'qmt', plans: [plan()] },
    ];

    const report = await pool.warmup(targets, ANCHOR);
    expect(report).toMatchObject({
      total: 1,
      succeeded: 1,
      skipped: 0,
      failed: 0,
    });
    expect(port.loadRealtimeWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        securityId: 7,
        source: 'qmt',
        period: 30,
        anchorAt: ANCHOR,
      }),
    );

    // 首根公开 bar：零 hydration（组已预构建），直接发射
    const triggerBar = historicalBars(1, 30)[0];
    const publicBar = {
      ...triggerBar,
      timestamp: new Date(Date.UTC(2026, 7, 4, 1, 35)),
    };
    const loadCountBefore = port.loadRealtimeWindow.mock.calls.length;
    const signals = await pool.push(publicBar, [plan()]);
    expect(port.loadRealtimeWindow.mock.calls.length).toBe(loadCountBefore);
    expect(signals.length).toBe(1);
  });

  it('is idempotent: matching plan signature is skipped', async () => {
    const port = fakePort(historicalBars(10, 30));
    const pool = new RealtimeKernelPool(port as never, makeRegistry());
    const targets: PreMarketWarmupTarget[] = [
      { securityId: 7, source: 'qmt', plans: [plan()] },
    ];

    await pool.warmup(targets, ANCHOR);
    const second = await pool.warmup(targets, ANCHOR);
    expect(second).toMatchObject({
      total: 1,
      succeeded: 0,
      skipped: 1,
      failed: 0,
    });
  });

  it('isolates per-target hydration failures without blocking others', async () => {
    const port = fakePort(historicalBars(10, 30));
    port.loadRealtimeWindow.mockImplementation((criteria) => {
      if (criteria.securityId === 13) {
        return Promise.reject(new Error('db failed'));
      }
      return Promise.resolve({ bars: historicalBars(10, 30) });
    });
    const pool = new RealtimeKernelPool(port as never, makeRegistry());
    const targets: PreMarketWarmupTarget[] = [
      { securityId: 7, source: 'qmt', plans: [plan()] },
      { securityId: 13, source: 'qmt', plans: [plan()] },
    ];

    const report = await pool.warmup(targets, ANCHOR);
    expect(report).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(report.failedTargets[0]).toMatchObject({
      securityId: 13,
      reason: 'query_failed',
    });
    // 失败标的不拖垮已预热标的
    const signals = await pool.push(
      {
        ...historicalBars(1, 30)[0],
        timestamp: new Date(Date.UTC(2026, 7, 4, 1, 35)),
      },
      [plan()],
    );
    expect(signals.length).toBe(1);
  });

  it('prewarms every declared context period alongside the evaluation period', async () => {
    const port = fakePort([
      ...historicalBars(12, 30),
      ...historicalBars(120, 5),
    ]);
    const pool = new RealtimeKernelPool(port as never, makeRegistry());
    const targets: PreMarketWarmupTarget[] = [
      {
        securityId: 7,
        source: 'qmt',
        plans: [plan({ contextRequirements: { 5: 100 } })],
      },
    ];

    await pool.warmup(targets, ANCHOR);
    const hydratedPeriods = port.loadRealtimeWindow.mock.calls.map(
      (call) => call[0].period,
    );
    expect(hydratedPeriods).toEqual(expect.arrayContaining([30, 5]));
  });
});
