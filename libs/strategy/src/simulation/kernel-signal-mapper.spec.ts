import type { KernelSignal } from '../kernel/kernel.types';
import { mapKernelSignalToSimulationSignal } from './kernel-signal-mapper';

function makeKernelSignal(overrides: Partial<KernelSignal> = {}): KernelSignal {
  return {
    definitionId: 1,
    versionId: 1,
    signalKind: 'entry',
    signalTime: new Date('2026-08-26T10:00:00.000Z'),
    triggerPrice: 12.5,
    pivotTime: null,
    pivotPrice: null,
    signalType: 'CUSTOM_SIGNAL',
    decisionTrace: { trace: [] },
    contextSnapshot: {},
    ruleSnapshot: {},
    ...overrides,
  };
}

describe('mapKernelSignalToSimulationSignal', () => {
  it('uses resolveIntent so EXIT and RISK_CUT resolve as isBuy=false even if signalKind=entry', () => {
    const riskCut = mapKernelSignalToSimulationSignal(
      makeKernelSignal({
        signalKind: 'entry',
        intent: 'RISK_CUT',
        signalType: 'RISK_EXIT',
      }),
      { securityCode: '000001', period: 30 },
    );
    expect(riskCut.isBuy).toBe(false);
    expect(riskCut.badgeText).toBe('卖点');

    const explicitExit = mapKernelSignalToSimulationSignal(
      makeKernelSignal({
        signalKind: 'entry',
        intent: 'EXIT',
      }),
      { securityCode: '000001', period: 30 },
    );
    expect(explicitExit.isBuy).toBe(false);

    const explicitEntry = mapKernelSignalToSimulationSignal(
      makeKernelSignal({
        signalKind: 'exit',
        intent: 'ENTRY',
      }),
      { securityCode: '000001', period: 30 },
    );
    expect(explicitEntry.isBuy).toBe(true);
  });

  it('preserves pivotTime and pivotPrice as null when absent instead of fabricating fallbacks', () => {
    const mapped = mapKernelSignalToSimulationSignal(
      makeKernelSignal({
        pivotTime: null,
        pivotPrice: null,
      }),
      { securityCode: '000001', period: 30 },
    );

    expect(mapped.pivotTime).toBeNull();
    expect(mapped.pivotPrice).toBeNull();
  });

  it('filters out failed (passed === false) and EXTRACTOR trace nodes before extracting signalType', () => {
    const mapped = mapKernelSignalToSimulationSignal(
      makeKernelSignal({
        signalType: 'FALLBACK_TAG',
        decisionTrace: {
          trace: [
            {
              nodeId: 'ext_1',
              type: 'EXTRACTOR',
              role: 'EXTRACTOR',
              evidence: { eventType: 'SHOULD_IGNORE_EXTRACTOR' },
            },
            {
              nodeId: 'guard_fail',
              type: 'GUARD',
              passed: false,
              evidence: { eventType: 'SHOULD_IGNORE_FAILED' },
            },
            {
              nodeId: 'guard_pass',
              type: 'GUARD',
              passed: true,
              evidence: { eventType: 'second_buy' },
            },
          ],
        },
      }),
      { securityCode: '000001', period: 30 },
    );

    expect(mapped.signalType).toBe('second_buy');
  });

  it('falls back to signal.signalType when only EXTRACTOR or failed trace nodes have evidence', () => {
    const mapped = mapKernelSignalToSimulationSignal(
      makeKernelSignal({
        signalType: 'CLEAN_SIGNAL',
        decisionTrace: {
          trace: [
            {
              nodeId: 'ext_only',
              type: 'EXTRACTOR',
              evidence: { type: 'EXTRACTOR_TYPE' },
            },
            {
              nodeId: 'guard_failed',
              type: 'GUARD',
              passed: false,
              evidence: { eventType: 'FAILED_TYPE' },
            },
          ],
        },
      }),
      { securityCode: '000001', period: 30 },
    );

    expect(mapped.signalType).toBe('CLEAN_SIGNAL');
  });
});
