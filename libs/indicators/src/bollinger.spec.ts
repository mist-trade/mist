import {
  computeBollingerBandsSeries,
  computeBollingerBandsObservation,
} from './bollinger';

describe('Bollinger Bands (Polars Vectorized Implementation)', () => {
  it('returns empty result when input array is smaller than period', () => {
    const res = computeBollingerBandsSeries([10, 11, 12], { period: 5 });
    expect(res.begIndex).toBe(3);
    expect(res.middle).toEqual([]);
    expect(res.upper).toEqual([]);
    expect(res.lower).toEqual([]);
    expect(res.bandwidth).toEqual([]);
  });

  it('computes correct Bollinger Bands on a constant price series (zero stddev)', () => {
    const prices = new Array(25).fill(100);
    const res = computeBollingerBandsSeries(prices, {
      period: 20,
      stdDevMultiplier: 2.0,
    });

    expect(res.begIndex).toBe(19);
    expect(res.middle.length).toBe(6);
    expect(res.middle[0]).toBeCloseTo(100, 4);
    expect(res.upper[0]).toBeCloseTo(100, 4);
    expect(res.lower[0]).toBeCloseTo(100, 4);
    expect(res.bandwidth[0]).toBeCloseTo(0, 4);
  });

  it('computes expected upper and lower bands on fluctuating series', () => {
    // 20 prices with known mean and stddev
    const prices = [
      10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18, 17, 19, 18, 20,
      19, 21,
    ];
    const res = computeBollingerBandsSeries(prices, {
      period: 20,
      stdDevMultiplier: 2.0,
    });

    expect(res.begIndex).toBe(19);
    expect(res.middle.length).toBe(1);
    expect(res.upper[0]).toBeGreaterThan(res.middle[0]);
    expect(res.lower[0]).toBeLessThan(res.middle[0]);
    expect(res.bandwidth[0]).toBeGreaterThan(0);
    expect(res.upper[0] - res.middle[0]).toBeCloseTo(
      res.middle[0] - res.lower[0],
      4,
    );
  });

  it('computes single observation correctly', () => {
    const prices = [
      10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18, 17, 19, 18, 20,
      19, 21,
    ];
    const obs = computeBollingerBandsObservation(prices, {
      period: 20,
      stdDevMultiplier: 2.0,
    });

    expect(obs.middle).toBeGreaterThan(0);
    expect(obs.upper).toBeGreaterThan(obs.middle);
    expect(obs.lower).toBeLessThan(obs.middle);
    expect(obs.bandwidth).toBeGreaterThan(0);
  });

  it('throws on invalid inputs', () => {
    expect(() => computeBollingerBandsSeries([], { period: 0 })).toThrow();
    expect(() =>
      computeBollingerBandsSeries([], { stdDevMultiplier: -1 }),
    ).toThrow();
  });
});
