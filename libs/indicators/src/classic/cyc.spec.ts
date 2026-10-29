import {
  computeCycSeries,
  computeCycObservation,
  computeIndexCycSeries,
  computeIndexCycObservation,
} from './cyc';
import { IndicatorInputError } from '../errors';

describe('computeCycSeries', () => {
  it('computes volume-weighted EMA cost correctly for uniform values', () => {
    // 5 bars where price is constantly 10.0 (amount = volume * 10)
    const amounts = [1000, 2000, 3000, 4000, 5000];
    const volumes = [100, 200, 300, 400, 500];

    const result = computeCycSeries(amounts, volumes, { period: 5 });
    expect(result.begIndex).toBe(0);
    expect(result.cyc.length).toBe(5);
    for (const val of result.cyc) {
      expect(val).toBeCloseTo(10.0, 6);
    }
  });

  it('weights heavy volume bars higher than light volume bars', () => {
    // Bar 0: price = 10, vol = 100
    // Bar 1: price = 20, vol = 10000 (huge volume at 20)
    // Bar 2: price = 10, vol = 100 (light volume back at 10)
    const amounts = [1000, 200000, 1000];
    const volumes = [100, 10000, 100];

    const result = computeCycSeries(amounts, volumes, { period: 13 });
    // After bar 1, CYC should be pulled strongly toward 20, and bar 2 should barely affect it
    expect(result.cyc[1]).toBeCloseTo(19.434, 3);
    expect(result.cyc[2]).toBeCloseTo(19.331, 3);
  });

  it('respects volumeInShares: false for lot-based volumes (TDX convention)', () => {
    // In TDX: volume in lots (手, 100 shares), amount in Yuan
    // 100 shares traded at 15.0 Yuan = 1 lot, amount = 1500 Yuan
    const amounts = [1500, 3000, 4500];
    const volumes = [1, 2, 3]; // in lots

    const result = computeCycSeries(amounts, volumes, {
      period: 5,
      volumeInShares: false,
    });
    for (const val of result.cyc) {
      expect(val).toBeCloseTo(15.0, 6);
    }
  });

  it('falls back to close price when volume is zero and closes are provided', () => {
    const amounts = [0, 0];
    const volumes = [0, 0];
    const closes = [12.5, 12.5];

    const result = computeCycSeries(amounts, volumes, {
      closes,
      period: 13,
    });
    expect(result.cyc).toEqual([12.5, 12.5]);
  });

  it('throws IndicatorInputError on mismatched array lengths', () => {
    expect(() => computeCycSeries([100], [10, 20])).toThrow(
      IndicatorInputError,
    );
  });

  it('throws IndicatorInputError on non-positive period', () => {
    expect(() => computeCycSeries([100], [10], { period: 0 })).toThrow(
      IndicatorInputError,
    );
  });

  it('computes observation snapshot correctly', () => {
    const amounts = [1000, 2000, 3000];
    const volumes = [100, 200, 300];
    const obs = computeCycObservation(amounts, volumes, { period: 5 });
    expect(obs.cyc).toBeCloseTo(10.0, 6);
  });
});

describe('computeIndexCycSeries', () => {
  it('computes typical price EMA accurately for index bars', () => {
    // 3 bars where high=12, low=8, close=10 => TP = (12+8+10)/3 = 10
    const highs = [12, 12, 12];
    const lows = [8, 8, 8];
    const closes = [10, 10, 10];

    const result = computeIndexCycSeries(highs, lows, closes, { period: 5 });
    expect(result.begIndex).toBe(0);
    expect(result.cyc.length).toBe(3);
    for (const val of result.cyc) {
      expect(val).toBeCloseTo(10.0, 6);
    }
  });

  it('handles empty input gracefully', () => {
    const result = computeIndexCycSeries([], [], []);
    expect(result.begIndex).toBe(0);
    expect(result.cyc).toEqual([]);
  });

  it('throws IndicatorInputError on mismatched lengths', () => {
    expect(() => computeIndexCycSeries([10], [5, 6], [8])).toThrow(
      IndicatorInputError,
    );
  });

  it('computes observation snapshot correctly', () => {
    const highs = [12, 12];
    const lows = [8, 8];
    const closes = [10, 10];
    const obs = computeIndexCycObservation(highs, lows, closes, { period: 5 });
    expect(obs.cyc).toBeCloseTo(10.0, 6);
  });
});
