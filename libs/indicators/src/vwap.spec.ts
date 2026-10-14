import { computeVwapSeries, computeVwapObservation } from './vwap';
import { IndicatorInputError } from './errors';

describe('VWAP (Volume-Weighted Average Price) Indicator (Polars Vectorized)', () => {
  it('throws IndicatorInputError when closes and volumes lengths do not match', () => {
    expect(() => computeVwapSeries([10, 11], [100])).toThrow(
      IndicatorInputError,
    );
  });

  it('returns empty series when input array is empty', () => {
    const result = computeVwapSeries([], []);
    expect(result.begIndex).toBe(0);
    expect(result.vwap).toEqual([]);
  });

  it('computes cumulative VWAP correctly across sequence', () => {
    const closes = [10, 20, 30];
    const volumes = [100, 100, 200];

    const result = computeVwapSeries(closes, volumes);
    expect(result.begIndex).toBe(0);
    expect(result.vwap.length).toBe(3);
    expect(result.vwap[0]).toBeCloseTo(10, 4);
    expect(result.vwap[1]).toBeCloseTo(15, 4);
    expect(result.vwap[2]).toBeCloseTo(22.5, 4);
  });

  it('computes rolling window VWAP correctly when window parameter is supplied', () => {
    const closes = [10, 20, 30];
    const volumes = [100, 100, 200];

    const result = computeVwapSeries(closes, volumes, { window: 2 });
    expect(result.begIndex).toBe(1);
    expect(result.vwap.length).toBe(2);
    // Window 0-1: (10*100 + 20*100) / 200 = 15
    expect(result.vwap[0]).toBeCloseTo(15, 4);
    // Window 1-2: (20*100 + 30*200) / 300 = 8000 / 300 ≈ 26.6667
    expect(result.vwap[1]).toBeCloseTo(8000 / 300, 4);
  });

  it('safely falls back to close price when volume is zero', () => {
    const closes = [10, 20];
    const volumes = [0, 0];

    const result = computeVwapSeries(closes, volumes);
    expect(result.vwap[0]).toBe(10);
    expect(result.vwap[1]).toBe(20);
  });

  it('computes trailing observation matching last element of series', () => {
    const closes = [10, 20, 30];
    const volumes = [100, 100, 200];

    const series = computeVwapSeries(closes, volumes);
    const obs = computeVwapObservation(closes, volumes);

    expect(obs.vwap).toBeCloseTo(series.vwap.at(-1)!, 4);
  });

  it('throws IndicatorInputError when observation is called with empty data', () => {
    expect(() => computeVwapObservation([], [])).toThrow(IndicatorInputError);
  });
});
