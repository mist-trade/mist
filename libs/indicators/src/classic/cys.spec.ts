import {
  computeCysSeries,
  computeCysObservation,
  computeIndexCysSeries,
  computeIndexCysObservation,
} from './cys';
import {
  computeCysMarketBreadth,
  computeBinaryMarketBreadth,
} from './market-breadth';
import { IndicatorInputError } from '../errors';

describe('computeCysSeries', () => {
  it('computes CYS correctly as (close - cyc) / cyc * 100', () => {
    // 5 bars where price is 10, then spikes to 12
    const closes = [10, 10, 10, 10, 12];
    const amounts = [1000, 1000, 1000, 1000, 1200];
    const volumes = [100, 100, 100, 100, 100];

    const result = computeCysSeries(closes, amounts, volumes, { period: 5 });
    expect(result.cys.length).toBe(5);
    // At bars 0-3, close == cyc == 10, so cys == 0%
    for (let i = 0; i < 4; i++) {
      expect(result.cys[i]).toBeCloseTo(0.0, 4);
    }
    // At bar 4, price is 12, CYC has moved up slightly from 10
    expect(result.cys[4]).toBeGreaterThan(0);
    expect(result.cys[4]).toBeCloseTo(
      ((12 - result.cyc[4]) / result.cyc[4]) * 100,
      4,
    );
  });

  it('detects oversold conditions when price drops sharply below cost', () => {
    // Price at 20, then crashes to 15
    const closes = [20, 20, 20, 20, 15];
    const amounts = [20000, 20000, 20000, 20000, 15000];
    const volumes = [1000, 1000, 1000, 1000, 1000];

    const result = computeCysSeries(closes, amounts, volumes, { period: 13 });
    // Expect negative CYS
    expect(result.cys[4]).toBeLessThan(-10.0);
  });

  it('computes observation snapshot correctly', () => {
    const closes = [10, 10, 11];
    const amounts = [1000, 1000, 1100];
    const volumes = [100, 100, 100];

    const obs = computeCysObservation(closes, amounts, volumes, { period: 5 });
    expect(obs.cys).toBeGreaterThan(0);
    expect(obs.cyc).toBeGreaterThan(10);
  });

  it('throws IndicatorInputError on mismatched lengths', () => {
    expect(() => computeCysSeries([10], [10, 20], [1])).toThrow(
      IndicatorInputError,
    );
  });
});

describe('computeCysMarketBreadth', () => {
  it('calculates oversold breadth ratio accurately across a cross-section', () => {
    // 10 stocks: 4 of them have CYS < -12.0
    const sample = [
      -15.2, -13.0, -18.5, -12.5, -5.0, 0.0, 2.5, -8.0, 1.0, -2.0,
    ];
    const result = computeCysMarketBreadth(sample, -12.0);

    expect(result.totalCount).toBe(10);
    expect(result.validCount).toBe(10);
    expect(result.matchingCount).toBe(4);
    expect(result.ratio).toBe(0.4);
  });

  it('handles null, undefined, and NaN entries safely', () => {
    const sample = [-15.0, null, undefined, NaN, -5.0, 10.0];
    const result = computeCysMarketBreadth(sample, -12.0);

    expect(result.totalCount).toBe(6);
    expect(result.validCount).toBe(3); // -15.0, -5.0, 10.0
    expect(result.matchingCount).toBe(1); // -15.0
    expect(result.ratio).toBeCloseTo(1 / 3, 4);
  });

  it('returns zero ratio when array is empty', () => {
    const result = computeCysMarketBreadth([]);
    expect(result.totalCount).toBe(0);
    expect(result.ratio).toBe(0.0);
  });
});

describe('computeBinaryMarketBreadth', () => {
  it('computes ratio of stocks above MA250 correctly', () => {
    // 5 stocks: 2 above MA250 (true), 3 below (false)
    const flags = [true, false, true, false, false];
    const result = computeBinaryMarketBreadth(flags);

    expect(result.totalCount).toBe(5);
    expect(result.validCount).toBe(5);
    expect(result.matchingCount).toBe(2);
    expect(result.ratio).toBe(0.4);
  });
});

describe('computeIndexCysSeries', () => {
  it('computes index CYS accurately as (close - indexCyc) / indexCyc * 100', () => {
    // 5 bars where index is 3000, then crashes to 2700
    const highs = [3050, 3050, 3050, 3050, 2750];
    const lows = [2950, 2950, 2950, 2950, 2650];
    const closes = [3000, 3000, 3000, 3000, 2700];

    const result = computeIndexCysSeries(highs, lows, closes, { period: 5 });
    expect(result.cys.length).toBe(5);
    for (let i = 0; i < 4; i++) {
      expect(result.cys[i]).toBeCloseTo(0.0, 4);
    }
    // Bar 4 crashes to 2700
    expect(result.cys[4]).toBeLessThan(-5.0);
    expect(result.cys[4]).toBeCloseTo(
      ((2700 - result.cyc[4]) / result.cyc[4]) * 100,
      4,
    );
  });

  it('computes index CYS observation accurately', () => {
    const highs = [3050, 3050];
    const lows = [2950, 2950];
    const closes = [3000, 3000];
    const obs = computeIndexCysObservation(highs, lows, closes, { period: 5 });
    expect(obs.cys).toBeCloseTo(0.0, 4);
    expect(obs.cyc).toBeCloseTo(3000.0, 4);
  });
});
