import { computeVolumeSeries, computeVolumeObservation } from './volume';
import { IndicatorInputError } from './errors';

describe('Volume & Volume MA Indicator (Polars Vectorized)', () => {
  it('returns empty series when input volume length is less than maximum period (20)', () => {
    const volumes = [100, 200, 300];
    const result = computeVolumeSeries(volumes);
    expect(result.begIndex).toBe(volumes.length);
    expect(result.volumes).toEqual([]);
    expect(result.vma5).toEqual([]);
    expect(result.vma10).toEqual([]);
    expect(result.vma20).toEqual([]);
    expect(result.volumeRatio).toEqual([]);
  });

  it('computes rolling means and volume ratio correctly for valid sequence', () => {
    // 25 periods of constant volume 1000
    const volumes = new Array(25).fill(1000);
    // Introduce a spike at the end: 2000
    volumes[24] = 2000;

    const result = computeVolumeSeries(volumes);
    expect(result.begIndex).toBe(19);
    expect(result.volumes.length).toBe(6); // 25 - 19
    expect(result.vma20.length).toBe(6);
    expect(result.vma5.length).toBe(6);

    // Initial 20-bar window of all 1000s -> vma20 = 1000, vma10 = 1000, vma5 = 1000
    // volumeRatio = current / mean(previous 5 bars) = 1000 / 1000 = 1.0
    expect(result.vma20[0]).toBeCloseTo(1000, 4);
    expect(result.vma5[0]).toBeCloseTo(1000, 4);
    expect(result.volumeRatio[0]).toBeCloseTo(1.0, 4);

    // Last bar (index 24, spike to 2000):
    // vma5 includes the current bar: [1000, 1000, 1000, 1000, 2000] -> mean = 1200
    // volumeRatio excludes the current bar: 2000 / mean(prev five 1000s) = 2000 / 1000 = 2.0
    const lastIdx = result.volumes.length - 1;
    expect(result.volumes[lastIdx]).toBe(2000);
    expect(result.vma5[lastIdx]).toBeCloseTo(1200, 4);
    expect(result.volumeRatio[lastIdx]).toBeCloseTo(2.0, 4);
  });

  it('excludes the current bar from the standard volume-ratio denominator', () => {
    const volumes = new Array(25).fill(1000);
    volumes[24] = 5000;

    const result = computeVolumeSeries(volumes);
    const lastIdx = result.volumes.length - 1;

    // standard 量比: 5000 / mean(prev five bars = 1000) = 5.0
    expect(result.volumeRatio[lastIdx]).toBeCloseTo(5.0, 4);
    // must NOT be the current-inclusive denominator 5000 / 1800
    expect(result.volumeRatio[lastIdx]).not.toBeCloseTo(5000 / 1800, 4);
  });

  it('handles division by zero gracefully when volume is all zero', () => {
    const volumes = new Array(25).fill(0);
    const result = computeVolumeSeries(volumes);
    expect(result.volumeRatio[0]).toBe(1.0);
  });

  it('computes trailing observation matching last element of series', () => {
    const volumes = new Array(25).fill(1000);
    volumes[24] = 2500;

    const series = computeVolumeSeries(volumes);
    const obs = computeVolumeObservation(volumes);

    expect(obs.volume).toBe(2500);
    expect(obs.vma5).toBeCloseTo(series.vma5.at(-1)!, 4);
    expect(obs.vma10).toBeCloseTo(series.vma10.at(-1)!, 4);
    expect(obs.vma20).toBeCloseTo(series.vma20.at(-1)!, 4);
    expect(obs.volumeRatio).toBeCloseTo(series.volumeRatio.at(-1)!, 4);
  });

  it('throws IndicatorInputError when observation is called with insufficient data', () => {
    expect(() => computeVolumeObservation([100, 200])).toThrow(
      IndicatorInputError,
    );
  });
});
