import { computeVpciSeries, computeVpciObservation } from './vpci';

describe('VPCI (Volume Price Confirmation Indicator - Polars Implementation)', () => {
  it('returns empty result when input array is smaller than longPeriod + signalPeriod - 1', () => {
    const res = computeVpciSeries([10, 11], [100, 200], {
      shortPeriod: 5,
      longPeriod: 20,
      signalPeriod: 10,
    });
    expect(res.begIndex).toBe(2);
    expect(res.vpci).toEqual([]);
    expect(res.signalLine).toEqual([]);
    expect(res.vpc).toEqual([]);
    expect(res.vpr).toEqual([]);
  });

  it('computes expected VPCI on volume-price confirming uptrend', () => {
    // 35 bars: price rising from 10 to 44, volume also rising (VWMA > SMA => VPC > 0)
    const n = 35;
    const prices = Array.from({ length: n }, (_, i) => 10 + i);
    const volumes = Array.from({ length: n }, (_, i) => 1000 + i * 100);

    const res = computeVpciSeries(prices, volumes, {
      shortPeriod: 5,
      longPeriod: 20,
      signalPeriod: 10,
    });

    expect(res.begIndex).toBe(28); // 20 + 10 - 2 or 28
    expect(res.vpci.length).toBeGreaterThan(0);
    // Since higher prices correspond to higher volume, VWMA > SMA => VPC > 0 => VPCI > 0
    for (const val of res.vpci) {
      expect(val).toBeGreaterThan(0);
    }
  });

  it('computes expected negative VPCI on volume-price declining/distribution trend', () => {
    // Price falling, but volume rising on down days => VWMA < SMA => VPC < 0
    const n = 35;
    const prices = Array.from({ length: n }, (_, i) => 50 - i);
    const volumes = Array.from({ length: n }, (_, i) => 1000 + i * 100);

    const res = computeVpciSeries(prices, volumes, {
      shortPeriod: 5,
      longPeriod: 20,
      signalPeriod: 10,
    });

    expect(res.vpci.length).toBeGreaterThan(0);
    for (const val of res.vpci) {
      expect(val).toBeLessThan(0);
    }
  });

  it('computes single observation correctly', () => {
    const n = 35;
    const prices = Array.from({ length: n }, (_, i) => 10 + i);
    const volumes = Array.from({ length: n }, (_, i) => 1000 + i * 100);

    const obs = computeVpciObservation(prices, volumes, {
      shortPeriod: 5,
      longPeriod: 20,
      signalPeriod: 10,
    });

    expect(obs.vpci).toBeGreaterThan(0);
    expect(obs.signalLine).toBeDefined();
    expect(obs.vpc).toBeGreaterThan(0);
    expect(obs.vpr).toBeGreaterThan(0);
  });

  it('throws on mismatched arrays or invalid periods', () => {
    expect(() => computeVpciSeries([1], [1, 2])).toThrow();
    expect(() =>
      computeVpciSeries([], [], { shortPeriod: 20, longPeriod: 5 }),
    ).toThrow();
    expect(() => computeVpciSeries([], [], { signalPeriod: 0 })).toThrow();
  });
});
