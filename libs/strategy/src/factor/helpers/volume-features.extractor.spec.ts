import { extractVolumeFeatures } from './volume-features.extractor';

function makeMockBar(
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
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
      amount: String(volume * close),
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
      raw: String(volume * close),
      effective: String(volume * close),
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
    }));

    const features = extractVolumeFeatures(bars);
    expect(features).toBeDefined();
    expect(features?.close).toBe(10 + 34 + 0.5);
  });
});
