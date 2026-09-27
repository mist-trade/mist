import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '@app/strategy';
import {
  RealtimeStrategyEvaluationService,
  type RealtimeKernelPoolLike,
  type RealtimeStrategyExecutionPlan,
  type RealtimeWindowGroupIdentity,
} from './realtime-strategy-evaluation.service';

function bar(timestamp: string, close = 10.5): StrategyBar {
  return {
    securityId: 9,
    source: 'tdx',
    period: 5,
    timestamp: new Date(timestamp),
    open: close - 0.2,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: '1000',
    amount: '10000',
    type: 'complete',
  };
}

function plan(overrides?: Partial<RealtimeStrategyExecutionPlan>) {
  return {
    definitionId: 3,
    versionId: 7,
    source: 'tdx' as const,
    period: 5,
    ruleSnapshot: Object.freeze({}),
    kind: 'decision_flow' as const,
    flow: { id: 'term', type: 'TERMINAL' } as never,
    signalKind: 'entry' as const,
    requiredBarCount: 50,
    ...overrides,
  };
}

function kernelSignal(overrides?: Partial<KernelSignal>): KernelSignal {
  return {
    definitionId: 3,
    versionId: 7,
    signalKind: 'entry',
    signalTime: new Date('2026-08-04T06:44:00.000Z'),
    triggerTime: '2026-08-04T06:44:00.000Z',
    triggerPrice: 10.5,
    pivotTime: '2026-08-04T06:40:00.000Z',
    pivotPrice: 10.1,
    signalType: 'LEGACY_DSL',
    confidence: 85,
    confidenceLevel: 'HIGH',
    decisionTrace: { status: 'SIGNAL_EMITTED' },
    contextSnapshot: { action: 'BUY' },
    ruleSnapshot: Object.freeze({}),
    ...overrides,
  };
}

function fakePool(signals: readonly KernelSignal[] = []) {
  const pool: RealtimeKernelPoolLike = {
    push: jest.fn().mockResolvedValue(signals),
    retainGroups: jest.fn(),
    reset: jest.fn(),
    diagnostics: jest.fn().mockReturnValue({
      groupCount: 1,
      rawBarCount: 10,
      derivedBarCount: 0,
      lastOutcome:
        signals.length > 0 ? 'evaluated_matched' : 'evaluated_not_matched',
    }),
  };
  return pool;
}

describe('RealtimeStrategyEvaluationService（统一内核单通路）', () => {
  it('eligible 过滤与排序后委托内核池，映射候选', async () => {
    const signals = [
      kernelSignal(),
      kernelSignal({
        definitionId: 1,
        versionId: 2,
        signalKind: 'exit',
        signalType: 'CHAN_BSP',
      }),
    ];
    const pool = fakePool(signals);
    const service = new RealtimeStrategyEvaluationService(pool);

    const candidates = await service.evaluate(bar('2026-08-04T06:44:00.000Z'), [
      plan(),
      plan({ definitionId: 1, versionId: 2, signalKind: 'exit' }),
      // 非 eligible：source/period 不匹配，必须被过滤
      plan({ definitionId: 5, source: 'qmt' }),
      plan({ definitionId: 6, period: 15 }),
    ]);

    const poolMock = pool.push as jest.Mock;
    expect(poolMock).toHaveBeenCalledTimes(1);
    const pushedPlans = poolMock.mock
      .calls[0][1] as RealtimeStrategyExecutionPlan[];
    expect(pushedPlans.map((p) => p.definitionId)).toEqual([1, 3]);

    expect(candidates).toHaveLength(2);
    // 双时间戳契约：signalTime = 确认 Bar timestamp，pivot 透传
    expect(candidates[0]).toMatchObject({
      definitionId: 3,
      versionId: 7,
      securityId: 9,
      source: 'tdx',
      period: 5,
      signalKind: 'entry',
      signalTime: new Date('2026-08-04T06:44:00.000Z'),
      triggerTime: '2026-08-04T06:44:00.000Z',
      triggerPrice: 10.5,
      pivotTime: '2026-08-04T06:40:00.000Z',
      pivotPrice: 10.1,
      barType: 'complete',
    });
    expect(candidates[1].signalKind).toBe('exit');
  });

  it('空计划时短路返回，不触碰内核池', async () => {
    const pool = fakePool();
    const service = new RealtimeStrategyEvaluationService(pool);

    const candidates = await service.evaluate(
      bar('2026-08-04T06:44:00.000Z'),
      [],
    );

    expect(candidates).toEqual([]);
    expect(pool.push).not.toHaveBeenCalled();
  });

  it('retainRegistryScopes/reset/diagnostics 透传到内核池', () => {
    const pool = fakePool();
    const service = new RealtimeStrategyEvaluationService(pool);

    const groups: RealtimeWindowGroupIdentity[] = [
      { securityId: 9, source: 'tdx', period: 5 },
    ];
    service.retainRegistryScopes(groups);
    expect(pool.retainGroups).toHaveBeenCalledWith(groups);

    service.reset();
    expect(pool.reset).toHaveBeenCalled();

    const diagnostics = service.diagnostics();
    expect(diagnostics.groupCount).toBe(1);
    expect(diagnostics.lastOutcome).toBe('evaluated_not_matched');
  });
});
