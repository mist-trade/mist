import type { DecisionFlowNode } from './decision-flow.types';
import {
  compileStoredDefinitionVersion,
  deriveContextRequirements,
  StoredDefinitionCompileError,
} from './stored-definition-compiler';
import {
  factorPluginRegistry,
  InMemoryFactorPluginRegistry,
} from '../factor/factor-plugin-registry';
import type { FactorPlugin } from '../factor/factor.types';

function guardNode(
  pluginId: string,
  params?: Record<string, unknown>,
): DecisionFlowNode {
  return {
    id: 'guard',
    type: 'GUARD',
    name: 'gate',
    pluginId,
    ...(params ? { params } : {}),
    requiredAction: 'BUY',
    onPass: {
      id: 'term',
      type: 'TERMINAL',
      action: 'BUY',
      signalTag: 'TEST',
      reason: 'pass',
    },
  };
}

function pluginWith(
  id: string,
  requirements?: Readonly<Record<number, number>>,
): FactorPlugin {
  return {
    id,
    name: id,
    category: 'TECHNICAL',
    version: '1.0.0',
    description: 'test plugin',
    ...(requirements ? { resolveContextRequirements: () => requirements } : {}),
    evaluate: async () => ({
      action: 'NEUTRAL',
      reason: 'noop',
    }),
  };
}

describe('stored definition compiler — context requirements derivation', () => {
  afterEach(() => {
    factorPluginRegistry.clear();
  });

  it('derives the max context demand across plugin nodes', () => {
    factorPluginRegistry.register(pluginWith('plugin.a', { 5: 120, 1440: 10 }));
    factorPluginRegistry.register(pluginWith('plugin.b', { 5: 60, 30: 8 }));

    const compiled = compileStoredDefinitionVersion({
      kind: 'decision_flow',
      rule: {
        id: 'guard-a',
        type: 'GUARD',
        name: 'a',
        pluginId: 'plugin.a',
        requiredAction: 'BUY',
        onPass: {
          id: 'guard-b',
          type: 'GUARD',
          name: 'b',
          pluginId: 'plugin.b',
          requiredAction: 'BUY',
          onPass: { id: 't', type: 'TERMINAL', action: 'BUY', reason: 'x' },
        },
      } as unknown as Record<string, unknown>,
    });

    expect(compiled.contextRequirements).toEqual({ 5: 120, 30: 8, 1440: 10 });
  });

  it('unwraps the { rootNode, requiredBarCount } storage envelope', () => {
    factorPluginRegistry.register(pluginWith('plugin.a'));
    const compiled = compileStoredDefinitionVersion({
      kind: 'decision_flow',
      rule: {
        requiredBarCount: 200,
        rootNode: guardNode('plugin.a') as unknown as Record<string, unknown>,
      } as unknown as Record<string, unknown>,
    });
    expect(compiled.flow.id).toBe('guard');
    expect(compiled.flow.type).toBe('GUARD');
    expect(compiled.requiredBarCount).toBe(200);
  });

  it('still compiles a bare-tree rule (rule payload is the node)', () => {
    factorPluginRegistry.register(pluginWith('plugin.a'));
    const compiled = compileStoredDefinitionVersion({
      kind: 'decision_flow',
      rule: guardNode('plugin.a') as unknown as Record<string, unknown>,
    });
    expect(compiled.flow.id).toBe('guard');
    expect(compiled.requiredBarCount).toBe(50);
  });

  it('fails compilation when a flow references an unknown plugin', () => {
    expect(() =>
      compileStoredDefinitionVersion({
        kind: 'decision_flow',
        rule: guardNode('plugin.missing') as unknown as Record<string, unknown>,
      }),
    ).toThrow(/unknown factor plugin: plugin\.missing/);
  });

  it('rejects invalid context declarations', () => {
    factorPluginRegistry.register(pluginWith('plugin.bad', { 0: 10 }));
    expect(() =>
      compileStoredDefinitionVersion({
        kind: 'decision_flow',
        rule: guardNode('plugin.bad') as unknown as Record<string, unknown>,
      }),
    ).toThrow(/invalid context requirement/);
  });

  it('yields empty context requirements for legacy kinds without declarations', () => {
    const dsl = compileStoredDefinitionVersion({
      kind: 'rule_dsl',
      rule: {
        all: [{ field: 'k.close', operator: 'gt', value: 10.5 }],
      },
      signalKind: 'entry',
    });
    expect(dsl.contextRequirements).toEqual({});

    const chan = compileStoredDefinitionVersion({
      kind: 'chan_bsp',
      rule: {
        units: 'duan',
        direction: 'both',
        points: { first: true },
      },
    });
    expect(chan.contextRequirements).toEqual({});
  });
});

describe('deriveContextRequirements — explicit registry (dev-server lane)', () => {
  it('derives from the provided registry without touching the module singleton', () => {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(pluginWith('plugin.local.a', { 30: 100, 1440: 10 }));
    registry.register(pluginWith('plugin.local.b', { 30: 200, 5: 40 }));

    const flow = {
      id: 'guard-a',
      type: 'GUARD',
      name: 'a',
      pluginId: 'plugin.local.a',
      requiredAction: 'BUY',
      onPass: {
        id: 'guard-b',
        type: 'GUARD',
        name: 'b',
        pluginId: 'plugin.local.b',
        requiredAction: 'BUY',
        onPass: { id: 't', type: 'TERMINAL', action: 'BUY', reason: 'x' },
      },
    } as unknown as DecisionFlowNode;

    expect(deriveContextRequirements(flow, registry)).toEqual({
      5: 40,
      30: 200,
      1440: 10,
    });
  });

  it('fails closed on unknown plugin in the provided registry', () => {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(pluginWith('plugin.local.a'));

    const flow = guardNode('plugin.local.missing');
    expect(() => deriveContextRequirements(flow, registry)).toThrow(
      /unknown factor plugin: plugin\.local\.missing/,
    );
  });

  it('fails closed on invalid declaration in the provided registry', () => {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(pluginWith('plugin.local.bad', { 30: 0 }));

    const flow = guardNode('plugin.local.bad');
    expect(() => deriveContextRequirements(flow, registry)).toThrow(
      /invalid context requirement/,
    );
  });

  it('yields an empty map for flows without plugin references', () => {
    const registry = new InMemoryFactorPluginRegistry();
    const flow = {
      id: 't',
      type: 'TERMINAL',
      action: 'BUY',
      reason: 'leaf',
    } as unknown as DecisionFlowNode;
    expect(deriveContextRequirements(flow, registry)).toEqual({});
  });
});

describe('stored definition compiler — external context requirements derivation', () => {
  afterEach(() => {
    factorPluginRegistry.clear();
  });

  function extPluginWith(
    id: string,
    ext: readonly Record<string, unknown>[],
  ): FactorPlugin {
    return {
      id,
      name: id,
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'test plugin',
      resolveExternalContextRequirements: (() =>
        ext) as FactorPlugin['resolveExternalContextRequirements'],
      evaluate: async () => ({
        action: 'NEUTRAL',
        reason: 'noop',
      }),
    };
  }

  function nestedFlow(a: string, b: string): Record<string, unknown> {
    return {
      id: 'guard-a',
      type: 'GUARD',
      name: 'a',
      pluginId: a,
      requiredAction: 'BUY',
      onPass: {
        id: 'guard-b',
        type: 'GUARD',
        name: 'b',
        pluginId: b,
        requiredAction: 'BUY',
        onPass: { id: 't', type: 'TERMINAL', action: 'BUY', reason: 'x' },
      },
    } as unknown as Record<string, unknown>;
  }

  it('derives external requirements and merges duplicates with max minBars', () => {
    factorPluginRegistry.register(
      extPluginWith('plugin.e1', [
        { securityCode: '880003', securityId: 12, period: 1440, minBars: 500 },
      ]),
    );
    factorPluginRegistry.register(
      extPluginWith('plugin.e2', [
        { securityCode: '880003', securityId: 12, period: 1440, minBars: 875 },
        { securityCode: '000300', period: 1440, minBars: 100 },
      ]),
    );

    const compiled = compileStoredDefinitionVersion({
      kind: 'decision_flow',
      rule: nestedFlow('plugin.e1', 'plugin.e2'),
    });

    expect(compiled.externalContextRequirements).toEqual([
      { securityCode: '000300', period: 1440, minBars: 100 },
      { securityCode: '880003', securityId: 12, period: 1440, minBars: 875 },
    ]);
  });

  it('rejects external declarations without securityCode (fail-closed)', () => {
    factorPluginRegistry.register(
      extPluginWith('plugin.bad', [{ period: 1440, minBars: 100 }]),
    );
    expect(() =>
      compileStoredDefinitionVersion({
        kind: 'decision_flow',
        rule: nestedFlow('plugin.bad', 'plugin.bad'),
      }),
    ).toThrowError(/securityCode/);
  });

  it('forwards evaluationPeriod into plugin.resolveContextRequirements options', () => {
    factorPluginRegistry.register({
      id: 'plugin.period-aware',
      name: 'period-aware',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'period-aware test plugin',
      resolveContextRequirements: (_params, options) => ({
        [options?.evaluationPeriod ?? 1440]: 120,
      }),
      evaluate: async () => ({
        action: 'NEUTRAL',
        reason: 'noop',
      }),
    });

    const compiledDefault = compileStoredDefinitionVersion({
      kind: 'decision_flow',
      rule: guardNode('plugin.period-aware') as unknown as Record<
        string,
        unknown
      >,
    });
    expect(compiledDefault.contextRequirements).toEqual({ 1440: 120 });

    const compiled30m = compileStoredDefinitionVersion({
      kind: 'decision_flow',
      rule: guardNode('plugin.period-aware') as unknown as Record<
        string,
        unknown
      >,
      evaluationPeriod: 30,
    });
    expect(compiled30m.contextRequirements).toEqual({ 30: 120 });
  });
});

describe('stored definition compiler — fail-closed retired fields & node types', () => {
  afterEach(() => {
    factorPluginRegistry.clear();
  });

  function registerStub(id: string): void {
    factorPluginRegistry.register(pluginWith(id));
  }

  function captureCompileError(
    fn: () => unknown,
  ): StoredDefinitionCompileError {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(StoredDefinitionCompileError);
      return error as StoredDefinitionCompileError;
    }
    throw new Error('expected StoredDefinitionCompileError to be thrown');
  }

  it('fails closed when a root or nested GUARD node carries retired minConfidence', () => {
    registerStub('plugin.a');

    const withRootMinConfidence = {
      id: 'guard_root',
      type: 'GUARD',
      name: 'root',
      pluginId: 'plugin.a',
      requiredAction: 'BUY',
      minConfidence: 0.5,
      onPass: { id: 'term', type: 'TERMINAL', action: 'BUY', reason: 'ok' },
    };

    const rootErr = captureCompileError(() =>
      compileStoredDefinitionVersion({
        kind: 'decision_flow',
        rule: withRootMinConfidence as unknown as Record<string, unknown>,
      }),
    );
    expect(rootErr.code).toBe('DECISION_FLOW_RULE_INVALID');
    expect(rootErr.message).toContain('minConfidence');

    const withNestedMinConfidence = {
      id: 'branch_root',
      type: 'BRANCH',
      name: 'branch',
      condition: { attributeKey: 'x', operator: 'eq', value: 1 },
      branches: {
        true: { id: 't1', type: 'TERMINAL', action: 'ABORT', reason: 'no' },
        false: {
          id: 'guard_nested',
          type: 'GUARD',
          name: 'nested',
          pluginId: 'plugin.a',
          requiredAction: 'BUY',
          minConfidence: 0.6,
          onPass: {
            id: 't2',
            type: 'TERMINAL',
            action: 'BUY',
            reason: 'ok',
          },
        },
      },
    };

    const nestedErr = captureCompileError(() =>
      compileStoredDefinitionVersion({
        kind: 'decision_flow',
        rule: withNestedMinConfidence as unknown as Record<string, unknown>,
      }),
    );
    expect(nestedErr.code).toBe('DECISION_FLOW_RULE_INVALID');
    expect(nestedErr.message).toContain('minConfidence');
  });

  it('fails closed when a flow contains a retired CONSENSUS node', () => {
    registerStub('plugin.a');

    const withConsensus = {
      id: 'guard_root',
      type: 'GUARD',
      name: 'root',
      pluginId: 'plugin.a',
      requiredAction: 'BUY',
      onPass: {
        id: 'consensus_retired',
        type: 'CONSENSUS',
        name: 'legacy consensus',
        threshold: 70,
        plugins: [{ pluginId: 'plugin.a', weight: 100 }],
        onSuccess: {
          id: 'term_ok',
          type: 'TERMINAL',
          action: 'BUY',
          reason: 'ok',
        },
      },
    };

    const err = captureCompileError(() =>
      compileStoredDefinitionVersion({
        kind: 'decision_flow',
        rule: withConsensus as unknown as Record<string, unknown>,
      }),
    );
    expect(err.code).toBe('DECISION_FLOW_RULE_INVALID');
  });

  it('fails closed when a flow contains an unrecognized node type', () => {
    const unknownNode = {
      id: 'weird_node',
      type: 'UNKNOWN_NODE_TYPE',
      name: 'weird',
    };

    const err = captureCompileError(() =>
      compileStoredDefinitionVersion({
        kind: 'decision_flow',
        rule: unknownNode as unknown as Record<string, unknown>,
      }),
    );
    expect(err.code).toBe('DECISION_FLOW_RULE_INVALID');
  });

  it('fails closed on duplicate distinct node ids and invalid node fields, while deriving BRANCH.condition.pluginId', () => {
    factorPluginRegistry.register(pluginWith('plugin.branch', { 5: 30 }));
    factorPluginRegistry.register(pluginWith('plugin.leaf', { 30: 15 }));

    const duplicateIds = {
      id: 'dup_id',
      type: 'GUARD',
      name: 'root',
      pluginId: 'plugin.leaf',
      requiredAction: 'BUY',
      onPass: {
        id: 'dup_id',
        type: 'TERMINAL',
        action: 'BUY',
        reason: 'ok',
      },
    };
    const dupErr = captureCompileError(() =>
      compileStoredDefinitionVersion({
        kind: 'decision_flow',
        rule: duplicateIds as unknown as Record<string, unknown>,
      }),
    );
    expect(dupErr.code).toBe('DECISION_FLOW_RULE_INVALID');

    const badBranch = {
      id: 'branch_bad',
      type: 'BRANCH',
      name: 'branch',
      condition: { operator: 'bad_op', attributeKey: 'x', value: 1 },
      branches: {
        true: { id: 't1', type: 'TERMINAL', action: 'BUY', reason: 'ok' },
        false: { id: 't2', type: 'TERMINAL', action: 'ABORT', reason: 'no' },
      },
    };
    expect(
      captureCompileError(() =>
        compileStoredDefinitionVersion({
          kind: 'decision_flow',
          rule: badBranch as unknown as Record<string, unknown>,
        }),
      ).code,
    ).toBe('DECISION_FLOW_RULE_INVALID');

    const branchWithPlugin = {
      id: 'branch_plugin',
      type: 'BRANCH',
      name: 'branch_plugin',
      condition: { pluginId: 'plugin.branch', operator: 'eq', value: 'BUY' },
      branches: {
        true: {
          id: 'guard_leaf',
          type: 'GUARD',
          name: 'leaf',
          pluginId: 'plugin.leaf',
          requiredAction: 'BUY',
          onPass: {
            id: 't_buy',
            type: 'TERMINAL',
            action: 'BUY',
            reason: 'ok',
          },
        },
        false: {
          id: 't_abort',
          type: 'TERMINAL',
          action: 'ABORT',
          reason: 'no',
        },
      },
    };
    const compiled = compileStoredDefinitionVersion({
      kind: 'decision_flow',
      rule: branchWithPlugin as unknown as Record<string, unknown>,
    });
    expect(compiled.contextRequirements).toEqual({ 5: 30, 30: 15 });
  });

  it('derives and validates surveillancePeriods from plugins and rule envelopes', () => {
    const survPlugin: FactorPlugin = {
      id: 'plugin.test.surv',
      name: 'surv plugin',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'declares 5m surveillance for daily plans',
      resolveSurveillancePeriods: (_params, opts) =>
        opts?.evaluationPeriod === undefined || opts.evaluationPeriod > 5
          ? [5]
          : [],
      evaluate: async () => ({ action: 'NEUTRAL', reason: 'noop' }),
    };
    factorPluginRegistry.register(survPlugin);

    const compiledDaily = compileStoredDefinitionVersion({
      kind: 'decision_flow',
      evaluationPeriod: 1440,
      rule: {
        surveillancePeriods: [15],
        rootNode: guardNode('plugin.test.surv'),
        requiredBarCount: 10,
      } as unknown as Record<string, unknown>,
    });
    expect(compiledDaily.surveillancePeriods).toEqual([5, 15]);

    const compiled5m = compileStoredDefinitionVersion({
      kind: 'decision_flow',
      evaluationPeriod: 5,
      rule: {
        surveillancePeriods: [5, 15],
        rootNode: guardNode('plugin.test.surv'),
        requiredBarCount: 10,
      } as unknown as Record<string, unknown>,
    });
    expect(compiled5m.surveillancePeriods).toEqual([]);

    const badErr = captureCompileError(() =>
      compileStoredDefinitionVersion({
        kind: 'decision_flow',
        rule: {
          surveillancePeriods: [0],
          rootNode: guardNode('plugin.test.surv'),
        } as unknown as Record<string, unknown>,
      }),
    );
    expect(badErr.code).toBe('DECISION_FLOW_RULE_INVALID');
  });
});
