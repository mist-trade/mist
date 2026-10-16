import { extractVolumeFeatures } from './volume-features.extractor';

function makeMockBar(
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  amountText: string | null = String(volume * close),
) {
  return {
    rawBar: {
      securityId: 1,
      source: 'tdx',
      period: 5,
      timestamp: new Date('2026-09-07T09:30:00Z'),
      open,
      high,
      low,
      close,
      volume: String(volume),
      amount: amountText,
      type: 'complete',
    },
    tradingDay: '2026-09-07',
    ohlc: {
      raw: { open, high, low, close },
      effective: { open, high, low, close },
      resolution: 'observed',
    },
    volume: {
      raw: String(volume),
      effective: String(volume),
      resolution: 'observed',
    },
    amount: {
      raw: amountText,
      effective: amountText,
      resolution: 'observed',
    },
  };
}

describe('VolumeFeaturesExtractor', () => {
  it('returns undefined if bar count is insufficient for VPCI / BB / KC computation (< 30)', () => {
    const bars = [makeMockBar(10, 11, 9, 10.5, 1000)];
    const features = extractVolumeFeatures(bars);
    expect(features).toBeUndefined();
  });

  it('extracts complete volume and volatility features on valid series', () => {
    const n = 35;
    const bars = Array.from({ length: n }, (_, i) =>
      makeMockBar(10 + i, 10 + i + 1, 10 + i - 1, 10 + i + 0.5, 1000 + i * 50),
    );

    const features = extractVolumeFeatures(bars);
    expect(features).toBeDefined();
    if (!features) return;

    expect(typeof features.isSqueezeOn).toBe('boolean');
    expect(typeof features.isSqueezeFired).toBe('boolean');
    expect(features.bbBandwidth).toBeGreaterThanOrEqual(0);
    expect(features.atr).toBeGreaterThan(0);
    expect(features.volumeTsRank).toBeGreaterThanOrEqual(0);
    expect(features.volumeTsRank).toBeLessThanOrEqual(1.0);
    expect(features.volumeRatio).toBeGreaterThan(0);
    expect(features.close).toBe(10 + 34 + 0.5);
    expect(features.open).toBe(10 + 34);
    expect(features.deltaPrice).toBeCloseTo(0.5, 4);
    expect(features.vwap).toBeGreaterThan(0);
    expect(features.rpp).toBeGreaterThanOrEqual(0);
    expect(features.rpp).toBeLessThanOrEqual(1.0);
    expect(features.vpci).toBeDefined();
    expect(features.vpciSignal).toBeDefined();
  });

  it('extracts from StrategyBarMinimal array as well', () => {
    const n = 35;
    const bars = Array.from({ length: n }, (_, i) => ({
      timestamp: new Date(),
      open: 10 + i,
      high: 10 + i + 1,
      low: 10 + i - 1,
      close: 10 + i + 0.5,
      volume: 1000 + i * 50,
      amount: (1000 + i * 50) * (10 + i + 0.5),
    }));

    const features = extractVolumeFeatures(bars);
    expect(features).toBeDefined();
    expect(features?.close).toBe(10 + 34 + 0.5);
  });

  it('computes the exact amount-weighted VWAP (Σamount / Σvolume) on the window', () => {
    const n = 35;
    // amount deliberately implies a per-bar VWAP that differs from close
    const bars = Array.from({ length: n }, (_, i) =>
      makeMockBar(
        10 + i,
        10 + i + 1,
        10 + i - 1,
        10 + i + 0.5,
        1000 + i * 50,
        String((1000 + i * 50) * (10 + i + 1)), // implied VWAP = close + 0.5
      ),
    );

    const features = extractVolumeFeatures(bars);
    expect(features).toBeDefined();
    if (!features) return;

    let amountSum = 0;
    let volumeSum = 0;
    for (let i = 0; i < n; i += 1) {
      amountSum += (1000 + i * 50) * (10 + i + 1);
      volumeSum += 1000 + i * 50;
    }
    expect(features.vwap).toBeCloseTo(amountSum / volumeSum, 6);

    // must NOT equal the close × volume approximation
    let closeWeighted = 0;
    for (let i = 0; i < n; i += 1) {
      closeWeighted += (1000 + i * 50) * (10 + i + 0.5);
    }
    expect(features.vwap).not.toBeCloseTo(closeWeighted / volumeSum, 4);
  });

  it('returns undefined when any bar amount is missing (fail-closed, no silent fallback)', () => {
    const n = 35;
    const bars = Array.from({ length: n }, (_, i) =>
      makeMockBar(10 + i, 10 + i + 1, 10 + i - 1, 10 + i + 0.5, 1000 + i * 50),
    );
    bars[10] = makeMockBar(20, 21, 19, 20.5, 1500, null);

    expect(extractVolumeFeatures(bars)).toBeUndefined();
  });

  it('returns undefined when the window amount sum is not positive (e.g. all-zero QMT history)', () => {
    const n = 35;
    const bars = Array.from({ length: n }, (_, i) =>
      makeMockBar(
        10 + i,
        10 + i + 1,
        10 + i - 1,
        10 + i + 0.5,
        1000 + i * 50,
        '0',
      ),
    );

    expect(extractVolumeFeatures(bars)).toBeUndefined();
  });
});
