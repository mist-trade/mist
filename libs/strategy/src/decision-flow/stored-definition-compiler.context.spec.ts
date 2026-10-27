import type { DecisionFlowNode } from './decision-flow.types';
import {
  compileStoredDefinitionVersion,
  deriveContextRequirements,
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
      confidence: 0,
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
