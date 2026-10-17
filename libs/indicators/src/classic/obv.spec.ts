import { computeObvSeries, computeObvObservation } from './obv';
import { IndicatorInputError } from '../errors';

describe('OBV (On-Balance Volume) Indicator (Polars Vectorized)', () => {
  it('throws IndicatorInputError when closes and volumes lengths do not match', () => {
    expect(() => computeObvSeries([10, 11], [100])).toThrow(
      IndicatorInputError,
    );
  });

  it('returns empty series when input array is empty', () => {
    const result = computeObvSeries([], []);
    expect(result.begIndex).toBe(0);
    expect(result.obv).toEqual([]);
  });

  it('evaluates single-element sequence correctly', () => {
    const result = computeObvSeries([10], [100]);
    expect(result.begIndex).toBe(0);
    expect(result.obv).toEqual([0]);
  });

  it('computes correct cumulative OBV series with up, down, and flat price movements', () => {
    const closes = [10, 12, 11, 11, 13];
    const volumes = [100, 200, 150, 300, 500];

    const result = computeObvSeries(closes, volumes);
    expect(result.begIndex).toBe(0);
    expect(result.obv).toEqual([0, 200, 50, 50, 550]);
  });

  it('computes trailing observation matching last element of series', () => {
    const closes = [10, 12, 11, 11, 13];
    const volumes = [100, 200, 150, 300, 500];

    const series = computeObvSeries(closes, volumes);
    const obs = computeObvObservation(closes, volumes);

    expect(obs.obv).toBe(series.obv.at(-1));
    expect(obs.obv).toBe(550);
  });

  it('throws IndicatorInputError when observation is called with empty data', () => {
    expect(() => computeObvObservation([], [])).toThrow(IndicatorInputError);
  });
});
