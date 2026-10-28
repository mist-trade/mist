import type { KernelSignal } from '../kernel/kernel.types';
import { EdgeDetector } from './edge-detector';

describe('EdgeDetector', () => {
  function createSignal(params: {
    signalType: string;
    action?: 'BUY' | 'SELL' | 'HOLD' | 'NONE';
    signalKind?: 'entry' | 'exit';
    displayTag?: string;
    pluginId?: string;
    time?: Date;
  }): KernelSignal {
    const signalTime = params.time ?? new Date('2026-10-28T09:30:00.000Z');
    return {
      definitionId: 1,
      versionId: 1,
      signalKind:
        params.signalKind ?? (params.action === 'SELL' ? 'exit' : 'entry'),
      signalTime,
      triggerTime: signalTime.toISOString(),
      triggerPrice: 10.0,
      pivotTime: null,
      pivotPrice: null,
      signalType: params.signalType,
      confidence: 1,
      confidenceLevel: 'HIGH',
      displayTag: params.displayTag,
      decisionTrace: {
        action: params.action ?? 'BUY',
        pluginId: params.pluginId ?? params.signalType,
      },
      contextSnapshot: {},
      ruleSnapshot: {},
    };
  }

  it('passes unconfigured regular signals through untouched', () => {
    const detector = new EdgeDetector(['plugin.regime.shanghai-index']);
    const regularSignal = createSignal({
      signalType: 'first_buy',
      displayTag: 'chan_1b',
    });

    const result = detector.detect(regularSignal);
    expect(result).toBe(regularSignal);
  });

  it('emits single pulse on NONE -> BUY (0 -> 1) and suppresses next 500 consecutive BUY bars', () => {
    const detector = new EdgeDetector(['plugin.regime.shanghai-index']);

    const firstSignal = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      action: 'BUY',
      time: new Date('2026-10-28T09:30:00.000Z'),
    });

    // 0 -> 1 跃迁边沿：首次 BUY 放行
    const firstResult = detector.detect(firstSignal);
    expect(firstResult).toBe(firstSignal);

    // 连续 500 根 Bar 的持续 BUY 状态全被静默抑制
    for (let i = 1; i <= 500; i++) {
      const steadySignal = createSignal({
        signalType: 'plugin.regime.shanghai-index',
        action: 'BUY',
        time: new Date(firstSignal.signalTime.getTime() + i * 60_000),
      });
      const suppressed = detector.detect(steadySignal);
      expect(suppressed).toBeNull();
    }
  });

  it('triggers new edge when status flips to SELL, and triggers again when flipping back to BUY', () => {
    const detector = new EdgeDetector(['plugin.regime.shanghai-index']);

    const buySignal1 = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      action: 'BUY',
      time: new Date('2026-10-28T09:30:00.000Z'),
    });
    expect(detector.detect(buySignal1)).toBe(buySignal1);

    const buySignal2 = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      action: 'BUY',
      time: new Date('2026-10-28T09:31:00.000Z'),
    });
    expect(detector.detect(buySignal2)).toBeNull();

    // 翻转为 SELL，触发新边沿
    const sellSignal1 = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      action: 'SELL',
      time: new Date('2026-10-28T09:32:00.000Z'),
    });
    expect(detector.detect(sellSignal1)).toBe(sellSignal1);

    // 持续 SELL 抑制
    const sellSignal2 = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      action: 'SELL',
      time: new Date('2026-10-28T09:33:00.000Z'),
    });
    expect(detector.detect(sellSignal2)).toBeNull();

    // 再次翻回 BUY，再次放行
    const buySignal3 = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      action: 'BUY',
      time: new Date('2026-10-28T09:34:00.000Z'),
    });
    expect(detector.detect(buySignal3)).toBe(buySignal3);
  });

  it('resets state tracking on reset()', () => {
    const detector = new EdgeDetector(['plugin.regime.shanghai-index']);

    const buySignal = createSignal({
      signalType: 'plugin.regime.shanghai-index',
      action: 'BUY',
    });
    expect(detector.detect(buySignal)).toBe(buySignal);
    expect(detector.detect(buySignal)).toBeNull();

    detector.reset();

    expect(detector.detect(buySignal)).toBe(buySignal);
  });
});
