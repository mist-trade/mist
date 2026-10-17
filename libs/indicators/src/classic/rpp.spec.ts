import { computeRppSeries, computeRppObservation } from './rpp';
import { IndicatorInputError } from '../errors';

describe('RPP (Relative Price Position) Indicator (Polars Vectorized)', () => {
  it('throws IndicatorInputError when input array lengths do not match', () => {
    expect(() => computeRppSeries([10, 11], [9], [10, 10])).toThrow(
      IndicatorInputError,
    );
  });

  it('returns empty series when sequence length is less than window', () => {
    const result = computeRppSeries([10, 11], [9, 9], [10, 10], 5);
    expect(result.begIndex).toBe(2);
    expect(result.rpp).toEqual([]);
  });

  it('evaluates completely flat price windows to 0.5', () => {
    const highs = new Array(10).fill(100);
    const lows = new Array(10).fill(100);
    const closes = new Array(10).fill(100);

    const result = computeRppSeries(highs, lows, closes, 5);
    expect(result.begIndex).toBe(4);
    expect(result.rpp.length).toBe(6);
    expect(result.rpp.every((val) => val === 0.5)).toBe(true);
  });

  it('computes correct relative price position across range [0.0, 1.0]', () => {
    // 5-bar window:
    // Bar 0: H: 20, L: 10, C: 15
    // Bar 1: H: 25, L: 10, C: 20
    // Bar 2: H: 30, L: 10, C: 10 (at minLow -> RPP = 0.0)
    // Bar 3: H: 30, L: 10, C: 30 (at maxHigh -> RPP = 1.0)
    // Bar 4: H: 30, L: 10, C: 20 (middle -> (20 - 10) / (30 - 10) = 0.5)
    const highs = [20, 25, 30, 30, 30];
    const lows = [10, 10, 10, 10, 10];
    const closes = [15, 20, 10, 30, 20];

    const result = computeRppSeries(highs, lows, closes, 5);
    expect(result.begIndex).toBe(4);
    expect(result.rpp.length).toBe(1);
    expect(result.rpp[0]).toBeCloseTo(0.5, 4);

    // Add a 6th bar where price breaks to new high 40
    highs.push(40);
    lows.push(10);
    closes.push(40); // (40 - 10) / (40 - 10) = 1.0
    const result2 = computeRppSeries(highs, lows, closes, 5);
    expect(result2.rpp[1]).toBeCloseTo(1.0, 4);

    // Add a 7th bar where price drops to new low 5
    highs.push(40);
    lows.push(5);
    closes.push(5); // (5 - 5) / (40 - 5) = 0.0
    const result3 = computeRppSeries(highs, lows, closes, 5);
    expect(result3.rpp[2]).toBeCloseTo(0.0, 4);
  });

  it('computes trailing observation matching last element of series', () => {
    const highs = [20, 25, 30, 30, 30];
    const lows = [10, 10, 10, 10, 10];
    const closes = [15, 20, 10, 30, 20];

    const series = computeRppSeries(highs, lows, closes, 5);
    const obs = computeRppObservation(highs, lows, closes, 5);

    expect(obs.rpp).toBeCloseTo(series.rpp.at(-1)!, 4);
  });

  it('throws IndicatorInputError when observation is called with insufficient data', () => {
    expect(() => computeRppObservation([10], [9], [10], 5)).toThrow(
      IndicatorInputError,
    );
  });
});
