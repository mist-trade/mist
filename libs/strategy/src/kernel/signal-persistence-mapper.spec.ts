import {
  mapKernelSignalToPersistencePayload,
  type PersistableKernelSignal,
} from './signal-persistence-mapper';

function createSignal(
  overrides: Partial<PersistableKernelSignal> = {},
): PersistableKernelSignal {
  return {
    definitionId: 23,
    versionId: 4,
    signalKind: 'entry',
    signalTime: new Date('2026-10-28T09:30:00.000Z'),
    triggerPrice: 3900.25,
    signalType: 'third_sell',
    confidence: 90,
    confidenceLevel: 'HIGH',
    contextSnapshot: { origin: 'unit-test' },
    ruleSnapshot: {},
    ...overrides,
  };
}

const CONTEXT = {
  securityId: 1,
  securityCode: '000001.SH',
  source: 'qmt',
  period: 30,
};

describe('mapKernelSignalToPersistencePayload（通道观测字段）', () => {
  it('把 channel / intent / originPluginId 透传进 payload 与 contextSnapshot', () => {
    const payload = mapKernelSignalToPersistencePayload(
      createSignal({
        channel: { definitionId: 23, versionId: 4, period: 30 },
        intent: 'EXIT',
        originPluginId: 'plugin.chan.bsp',
      }),
      CONTEXT,
    );

    expect(payload.channel).toEqual({
      definitionId: 23,
      versionId: 4,
      period: 30,
    });
    expect(payload.intent).toBe('EXIT');
    expect(payload.originPluginId).toBe('plugin.chan.bsp');
    expect(payload.contextSnapshot).toMatchObject({
      origin: 'unit-test',
      channel: { definitionId: 23, versionId: 4, period: 30 },
      intent: 'EXIT',
      originPluginId: 'plugin.chan.bsp',
      triggerPrice: 3900.25,
    });
  });

  it('字段缺失时不污染 contextSnapshot', () => {
    const payload = mapKernelSignalToPersistencePayload(
      createSignal(),
      CONTEXT,
    );

    expect(payload.channel).toBeUndefined();
    expect(payload.intent).toBeUndefined();
    expect(payload.contextSnapshot).not.toHaveProperty('channel');
    expect(payload.contextSnapshot).not.toHaveProperty('intent');
    expect(payload.contextSnapshot).not.toHaveProperty('originPluginId');
  });
});
