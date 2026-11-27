import {
  DataSource,
  Period,
  Security,
  StrategyDefinition,
  StrategyKind,
  StrategyRuleSchemaVersion,
  StrategySignalKind,
  StrategyStatus,
  StrategyVersion,
} from '@app/shared-data';
import type { Repository } from 'typeorm';
import { StoredDefinitionCompileError } from '@app/strategy';
import { HealthStateService } from './health/health-state.service';
import { SignalRegistryService } from './signal-registry.service';
import { SignalRuntimeMutex } from './signal-runtime-mutex.service';

describe('SignalRegistryService', () => {
  const originalMode = process.env.REALTIME_STRATEGY_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.REALTIME_STRATEGY_MODE;
    } else {
      process.env.REALTIME_STRATEGY_MODE = originalMode;
    }
  });

  it('publishes generation one from one full enabled-definition query', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const repository = {
      find: jest.fn().mockResolvedValue([definition(1, 11)]),
      findOne: jest.fn(),
    } as unknown as Repository<StrategyDefinition>;
    const health = new HealthStateService();
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      health,
      new SignalRuntimeMutex(),
    );

    await registry.onApplicationBootstrap();

    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(registry.capture().generation).toBe(1);
    expect([...registry.capture().definitions.keys()]).toEqual([1]);
    expect(registry.executionPlansFor(9, 'tdx')).toHaveLength(1);
    expect(registry.executionPlansFor(10, 'tdx')).toEqual([]);
    expect(registry.executionPlansFor(9, 'qmt')).toEqual([]);
    expect(health.snapshot().registry).toMatchObject({
      ready: true,
      generation: 1,
      definitionCount: 1,
      executionPlanCount: 1,
    });
  });

  it('copy-on-write refreshes one definition and preserves captured snapshots', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const repository = {
      find: jest.fn().mockResolvedValue([definition(1, 11)]),
      findOne: jest.fn().mockResolvedValue(definition(2, 22)),
    } as unknown as Repository<StrategyDefinition>;
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      new HealthStateService(),
      new SignalRuntimeMutex(),
    );
    await registry.onApplicationBootstrap();
    const captured = registry.capture();

    await expect(registry.refreshDefinition(2)).resolves.toEqual({
      strategyDefinitionId: 2,
      registryGeneration: 2,
      action: 'upserted',
    });

    expect([...captured.definitions.keys()]).toEqual([1]);
    expect([...registry.capture().definitions.keys()]).toEqual([1, 2]);
    expect(repository.findOne).toHaveBeenCalledTimes(1);
  });

  it('transparently compiles a legacy chan_bsp definition into a decision flow plan', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const repository = {
      find: jest.fn().mockResolvedValue([chanBspDefinition(1, 11)]),
      findOne: jest.fn(),
    } as unknown as Repository<StrategyDefinition>;
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      new HealthStateService(),
      new SignalRuntimeMutex(),
    );

    await registry.onApplicationBootstrap();

    const plans = registry.executionPlansFor(9, 'tdx');
    expect(plans).toHaveLength(1);
    const flow = plans[0].flow as unknown as Record<string, unknown>;
    expect(plans[0]).toMatchObject({
      kind: 'decision_flow',
      definitionId: 1,
      period: 30,
      source: 'tdx',
      sourceKind: 'chan_bsp',
    });
    // 编译产物为 plugin.chan.bsp 门禁树，存量 chan_bsp 参数原样保留
    expect(flow.pluginId).toBe('plugin.chan.bsp');
    expect(flow.params).toMatchObject({
      units: 'duan',
      points: { first: true, second: true, third: false },
      direction: 'buy',
    });
  });

  it('rejects a chan_bsp definition with an invalid configuration', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const invalid = chanBspDefinition(2, 22);
    invalid.currentVersion!.rule = { units: 'wave' };
    const repository = {
      find: jest.fn().mockResolvedValue([invalid]),
      findOne: jest.fn(),
    } as unknown as Repository<StrategyDefinition>;
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      new HealthStateService(),
      new SignalRuntimeMutex(),
    );

    await expect(registry.onApplicationBootstrap()).rejects.toThrow(
      StoredDefinitionCompileError,
    );
    expect(registry.capture().generation).toBe(0);
  });

  it('retains the prior pointer and generation when refresh compilation fails', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const invalid = definition(2, 22);
    invalid.currentVersion!.rule = {};
    const repository = {
      find: jest.fn().mockResolvedValue([definition(1, 11)]),
      findOne: jest.fn().mockResolvedValue(invalid),
    } as unknown as Repository<StrategyDefinition>;
    const health = new HealthStateService();
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      health,
      new SignalRuntimeMutex(),
    );
    await registry.onApplicationBootstrap();
    const captured = registry.capture();

    await expect(registry.refreshDefinition(2)).rejects.toThrow();

    expect(registry.capture()).toBe(captured);
    expect(health.snapshot().registry).toMatchObject({
      ready: true,
      generation: 1,
      lastRefreshOutcome: 'failed',
      lastFailureCode: 'REGISTRY_REFRESH_FAILED',
    });
  });

  it('normalizes market-suffixed target universe to plain security codes', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const repository = {
      find: jest.fn().mockResolvedValue([definition(1, 11)]),
      findOne: jest.fn(),
    } as unknown as Repository<StrategyDefinition>;
    const health = new HealthStateService();
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      health,
      new SignalRuntimeMutex(),
    );

    await registry.onApplicationBootstrap();

    // definition(1) targets ['000001.SZ']; Security.code is '000001' (plain).
    // Resolution must succeed and map to security id 9.
    expect(registry.capture().definitions.get(1)).toBeDefined();
    expect(registry.executionPlansFor(9, 'tdx')).toHaveLength(1);
  });

  it('filters surveillancePeriods strictly below evaluationPeriod across multi-period plans', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const strategyMod = await import('@app/strategy');
    const base = definition(1, 11);
    const leaf = strategyMod.LegacyStrategyCompiler.compileRuleToDecisionFlow(
      { field: 'k.close', operator: 'gt', value: 1 },
      'entry',
    );
    const multiPeriodDef: StrategyDefinition = {
      ...base,
      kind: StrategyKind.DECISION_FLOW,
      periods: [Period.FIVE_MIN, Period.THIRTY_MIN, Period.DAY],
      currentVersion: {
        ...base.currentVersion!,
        rule: {
          rootNode: leaf,
          requiredBarCount: 1,
          surveillancePeriods: [5, 30, 1440],
        },
      },
    };
    const repository = {
      find: jest.fn().mockResolvedValue([multiPeriodDef]),
      findOne: jest.fn(),
    } as unknown as Repository<StrategyDefinition>;
    const registry = new SignalRegistryService(
      repository,
      securityRepository(),
      new HealthStateService(),
      new SignalRuntimeMutex(),
    );

    await registry.onApplicationBootstrap();

    const plans = registry.executionPlansFor(9, 'tdx');
    expect(plans).toHaveLength(3);
    expect(plans.find((p) => p.period === 5)?.surveillancePeriods).toEqual([]);
    expect(plans.find((p) => p.period === 30)?.surveillancePeriods).toEqual([
      5,
    ]);
    expect(plans.find((p) => p.period === 1440)?.surveillancePeriods).toEqual([
      5, 30,
    ]);
  });

  it('resolves externalContextRequirements securityIds best-effort from security repository', async () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const strategyMod = await import('@app/strategy');
    strategyMod.ensureStandardPluginsRegistered();
    strategyMod.factorPluginRegistry.register({
      id: 'plugin.test.external_ctx_registry',
      name: 'External Ctx Test Plugin',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'Test plugin for external context resolution',
      resolveExternalContextRequirements: () => [
        { securityCode: '880003', period: 1440, minBars: 5 },
        { securityCode: '000300.SH', period: 1440, minBars: 3 },
      ],
      resolveSurveillancePeriods: (_params, options) =>
        options?.evaluationPeriod === undefined || options.evaluationPeriod > 5
          ? [5]
          : [],
      evaluate: async () => ({ action: 'NEUTRAL', reason: 'noop' }),
    });

    try {
      const base = definition(1, 11);
      const leaf = strategyMod.LegacyStrategyCompiler.compileRuleToDecisionFlow(
        { field: 'k.close', operator: 'gt', value: 1 },
        'entry',
      );
      const defWithExt: StrategyDefinition = {
        ...base,
        kind: StrategyKind.DECISION_FLOW,
        periods: [Period.DAY],
        currentVersion: {
          ...base.currentVersion!,
          rule: {
            rootNode: {
              id: 'guard-ext',
              type: 'GUARD',
              name: 'ext-guard',
              pluginId: 'plugin.test.external_ctx_registry',
              requiredAction: 'NEUTRAL',
              onPass: leaf,
            },
            requiredBarCount: 1,
          },
        },
      };
      const repository = {
        find: jest.fn().mockResolvedValue([defWithExt]),
        findOne: jest.fn(),
      } as unknown as Repository<StrategyDefinition>;
      const securities = {
        find: jest
          .fn()
          .mockResolvedValue([
            { id: 9, code: '000001' } as Security,
            { id: 77, code: '880003' } as Security,
            { id: 88, code: '000300' } as Security,
          ]),
      } as unknown as Repository<Security>;
      const registry = new SignalRegistryService(
        repository,
        securities,
        new HealthStateService(),
        new SignalRuntimeMutex(),
      );

      await registry.onApplicationBootstrap();

      const plans = registry.executionPlansFor(9, 'tdx');
      expect(plans).toHaveLength(1);
      expect(plans[0].surveillancePeriods).toEqual([5]);
      expect(plans[0].externalContextRequirements).toEqual([
        expect.objectContaining({
          securityCode: '000300.SH',
          securityId: 88,
          period: 1440,
          minBars: 3,
        }),
        expect.objectContaining({
          securityCode: '880003',
          securityId: 77,
          period: 1440,
          minBars: 5,
        }),
      ]);
    } finally {
      strategyMod.factorPluginRegistry.clear();
      strategyMod.ensureStandardPluginsRegistered();
    }
  });
});

function securityRepository(): Repository<Security> {
  return {
    find: jest
      .fn()
      .mockResolvedValue([
        Object.assign(new Security(), { id: 9, code: '000001' }),
      ]),
  } as unknown as Repository<Security>;
}

function definition(id: number, versionId: number): StrategyDefinition {
  const version = Object.assign(new StrategyVersion(), {
    id: versionId,
    strategyDefinitionId: id,
    ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
    rule: { field: 'k.close', operator: 'gt', value: 10 },
    signalKind: StrategySignalKind.ENTRY,
  });
  return Object.assign(new StrategyDefinition(), {
    id,
    status: StrategyStatus.ENABLED,
    targetUniverse: ['000001.SZ'],
    periods: [Period.ONE_MIN],
    sources: [DataSource.TDX],
    currentVersionId: versionId,
    currentVersion: version,
  });
}

function chanBspDefinition(id: number, versionId: number): StrategyDefinition {
  const version = Object.assign(new StrategyVersion(), {
    id: versionId,
    strategyDefinitionId: id,
    ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
    rule: {
      units: 'duan',
      points: { first: true, second: true, third: false },
      direction: 'buy',
    },
    signalKind: StrategySignalKind.ENTRY,
  });
  return Object.assign(new StrategyDefinition(), {
    id,
    status: StrategyStatus.ENABLED,
    targetUniverse: ['000001.SZ'],
    periods: [Period.THIRTY_MIN],
    sources: [DataSource.TDX],
    currentVersionId: versionId,
    currentVersion: version,
    kind: StrategyKind.CHAN_BSP,
  });
}
