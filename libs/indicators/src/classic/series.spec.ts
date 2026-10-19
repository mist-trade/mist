import {
  computeAtrSeries,
  computeAtrObservation,
  computeDualMaSeries,
} from '../index';

describe('computeAtrSeries', () => {
  const close = Array.from(
    { length: 80 },
    (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.7,
  );
  const high = close.map((value, index) => value + 2 + (index % 4) * 0.1);
  const low = close.map((value, index) => value - 2 - (index % 3) * 0.1);

  it('matches the historical IndicatorService output exactly (golden)', () => {
    const result = computeAtrSeries(high, low, close, 14);

    expect(result.begIndex).toBe(14);
    expect(result.atr).toHaveLength(66);
    expect(result.atr[0]).toBeCloseTo(4.273998, 6);
  });

  it('computes trailing observation matching last element of series', () => {
    const series = computeAtrSeries(high, low, close, 14);
    const obs = computeAtrObservation(high, low, close, 14);

    expect(obs.atr).toBeCloseTo(series.atr.at(-1)!, 6);
  });
});

describe('computeDualMaSeries', () => {
  const close = Array.from(
    { length: 80 },
    (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.7,
  );

  it('matches the historical IndicatorService output exactly (golden)', () => {
    const result = computeDualMaSeries(close, {
      shortPeriod: 13,
      longPeriod: 60,
    });

    expect(result.begIndex).toBe(12);
    expect(result.shortMA).toHaveLength(68);
    expect(result.longMA).toHaveLength(21);
    expect(result.shortMA[0]).toBeCloseTo(105.944811, 6);
    expect(result.longMA[0]).toBeCloseTo(120.758567, 6);
  });

  it('is deterministic and does not mutate its input', () => {
    const snapshot = [...close];

    computeDualMaSeries(close);

    expect(close).toEqual(snapshot);
  });
});
