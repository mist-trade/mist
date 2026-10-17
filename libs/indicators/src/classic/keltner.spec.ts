import {
  computeKeltnerChannelsSeries,
  computeKeltnerChannelsObservation,
} from './keltner';

describe('Keltner Channels (Polars Vectorized Implementation)', () => {
  it('returns empty result when input array is smaller than period', () => {
    const res = computeKeltnerChannelsSeries([10, 11], [9, 10], [10, 10.5], {
      period: 5,
    });
    expect(res.begIndex).toBe(2);
    expect(res.middle).toEqual([]);
    expect(res.upper).toEqual([]);
    expect(res.lower).toEqual([]);
  });

  it('computes correct Keltner Channels on constant price series', () => {
    const highs = new Array(30).fill(102);
    const lows = new Array(30).fill(98);
    const closes = new Array(30).fill(100);

    const res = computeKeltnerChannelsSeries(highs, lows, closes, {
      period: 20,
      atrMultiplier: 1.5,
    });

    expect(res.begIndex).toBe(20);
    expect(res.middle.length).toBe(10);
    expect(res.middle[0]).toBeCloseTo(100, 4);
    // TR is high - low = 4, so ATR = 4, upper = 100 + 1.5 * 4 = 106, lower = 100 - 1.5 * 4 = 94
    expect(res.upper[0]).toBeCloseTo(106, 2);
    expect(res.lower[0]).toBeCloseTo(94, 2);
  });

  it('computes expected upper and lower channels on fluctuating data', () => {
    const n = 30;
    const highs = Array.from({ length: n }, (_, i) => 10 + i * 0.5 + 1);
    const lows = Array.from({ length: n }, (_, i) => 10 + i * 0.5 - 1);
    const closes = Array.from({ length: n }, (_, i) => 10 + i * 0.5);

    const res = computeKeltnerChannelsSeries(highs, lows, closes, {
      period: 20,
      atrMultiplier: 1.5,
    });

    expect(res.begIndex).toBe(20);
    expect(res.middle.length).toBe(10);
    for (let i = 0; i < res.middle.length; i++) {
      expect(res.upper[i]).toBeGreaterThan(res.middle[i]);
      expect(res.lower[i]).toBeLessThan(res.middle[i]);
      expect(res.upper[i] - res.middle[i]).toBeCloseTo(
        res.middle[i] - res.lower[i],
        4,
      );
    }
  });

  it('computes single observation correctly', () => {
    const n = 30;
    const highs = Array.from({ length: n }, (_, i) => 10 + i * 0.5 + 1);
    const lows = Array.from({ length: n }, (_, i) => 10 + i * 0.5 - 1);
    const closes = Array.from({ length: n }, (_, i) => 10 + i * 0.5);

    const obs = computeKeltnerChannelsObservation(highs, lows, closes, {
      period: 20,
      atrMultiplier: 1.5,
    });

    expect(obs.middle).toBeGreaterThan(0);
    expect(obs.upper).toBeGreaterThan(obs.middle);
    expect(obs.lower).toBeLessThan(obs.middle);
  });

  it('throws on mismatched array lengths or invalid inputs', () => {
    expect(() =>
      computeKeltnerChannelsSeries([1, 2], [1], [1, 2], { period: 20 }),
    ).toThrow();
    expect(() =>
      computeKeltnerChannelsSeries([], [], [], { period: 0 }),
    ).toThrow();
    expect(() =>
      computeKeltnerChannelsSeries([], [], [], { atrMultiplier: -1 }),
    ).toThrow();
  });
});
