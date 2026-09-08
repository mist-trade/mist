import { IndicatorInputError } from './errors';
import {
  computeDecayLinearObservation,
  computeDecayLinearSeries,
  computeRollingCorrObservation,
  computeRollingCorrSeries,
  computeRollingStdObservation,
  computeRollingStdSeries,
  computeTsArgMaxObservation,
  computeTsArgMaxSeries,
  computeTsArgMinObservation,
  computeTsArgMinSeries,
  computeTsDelayObservation,
  computeTsDelaySeries,
  computeTsDeltaObservation,
  computeTsDeltaSeries,
  computeTsRankObservation,
  computeTsRankSeries,
} from './index';

describe('Time-series alpha primitives (@app/indicators)', () => {
  describe('computeTsRank', () => {
    it('computes golden test cases for rolling percentile rank', () => {
      const ascending = [10, 20, 30, 40];
      const resAsc = computeTsRankSeries(ascending, 4);
      expect(resAsc.begIndex).toBe(3);
      expect(resAsc.values).toEqual([1.0]);
      expect(computeTsRankObservation(ascending, 4)).toBe(1.0);

      const descending = [40, 30, 20, 10];
      const resDesc = computeTsRankSeries(descending, 4);
      expect(resDesc.begIndex).toBe(3);
      expect(resDesc.values).toEqual([0.0]);
      expect(computeTsRankObservation(descending, 4)).toBe(0.0);

      const ties = [10, 20, 20, 30];
      // Trailing 30 in [10, 20, 20, 30]: rank is 4 -> (4-1)/3 = 1.0
      expect(computeTsRankObservation(ties, 4)).toBe(1.0);
      // Window 3 on ties: [10, 20, 20] -> trailing 20 has rank 2.5 -> (2.5-1)/2 = 0.75
      expect(computeTsRankObservation(ties.slice(0, 3), 3)).toBe(0.75);

      // Ordinal rank without normalization
      const rawRes = computeTsRankSeries(ascending, 4, { normalize: false });
      expect(rawRes.values).toEqual([4]);
      expect(computeTsRankObservation(ascending, 4, { normalize: false })).toBe(
        4,
      );
    });

    it('returns 0.5 for flat / identical sequences when normalized', () => {
      const flat = [5, 5, 5, 5, 5];
      const res = computeTsRankSeries(flat, 3);
      expect(res.begIndex).toBe(2);
      expect(res.values).toEqual([0.5, 0.5, 0.5]);
      expect(computeTsRankObservation(flat, 3)).toBe(0.5);

      // Raw rank for flat is (W + 1) / 2 = 2
      expect(computeTsRankObservation(flat, 3, { normalize: false })).toBe(2);
    });

    it('handles window size 1 gracefully', () => {
      const data = [10, 20, 30];
      const res = computeTsRankSeries(data, 1);
      expect(res.begIndex).toBe(0);
      expect(res.values).toEqual([0.5, 0.5, 0.5]);
      expect(computeTsRankObservation(data, 1)).toBe(0.5);
    });
  });

  describe('computeTsArgMax and computeTsArgMin', () => {
    it('computes offset to maximum and minimum with correct tie-breaking (closest bar)', () => {
      // Index:         0   1   2   3   4
      const series = [10, 50, 30, 50, 20];
      // Window 3:
      // at index 2 [10, 50, 30]: max=50 at idx 1 (offset 1), min=10 at idx 0 (offset 2)
      // at index 3 [50, 30, 50]: max=50 at idx 1 & 3 (closest is idx 3, offset 0), min=30 at idx 2 (offset 1)
      // at index 4 [30, 50, 20]: max=50 at idx 3 (offset 1), min=20 at idx 4 (offset 0)
      const maxSeries = computeTsArgMaxSeries(series, 3);
      expect(maxSeries.begIndex).toBe(2);
      expect(maxSeries.values).toEqual([1, 0, 1]);
      expect(computeTsArgMaxObservation(series, 3)).toBe(1);

      const minSeries = computeTsArgMinSeries(series, 3);
      expect(minSeries.begIndex).toBe(2);
      expect(minSeries.values).toEqual([2, 1, 0]);
      expect(computeTsArgMinObservation(series, 3)).toBe(0);
    });

    it('resolves ties by choosing the closest bar (minimum offset)', () => {
      // Identical values everywhere
      const flat = [7, 7, 7, 7];
      const maxRes = computeTsArgMaxSeries(flat, 3);
      expect(maxRes.values).toEqual([0, 0]);
      expect(computeTsArgMaxObservation(flat, 3)).toBe(0);

      const minRes = computeTsArgMinSeries(flat, 3);
      expect(minRes.values).toEqual([0, 0]);
      expect(computeTsArgMinObservation(flat, 3)).toBe(0);
    });
  });

  describe('computeDecayLinear', () => {
    it('computes linear decay weighted moving average', () => {
      const data = [1, 2, 3, 4];
      // Window 3:
      // at index 2 [1, 2, 3]: (1*1 + 2*2 + 3*3)/6 = 14/6 = 7/3
      // at index 3 [2, 3, 4]: (1*2 + 2*3 + 3*4)/6 = 20/6 = 10/3
      const res = computeDecayLinearSeries(data, 3);
      expect(res.begIndex).toBe(2);
      expect(res.values[0]).toBeCloseTo(7 / 3, 10);
      expect(res.values[1]).toBeCloseTo(10 / 3, 10);

      const obs = computeDecayLinearObservation(data, 3);
      expect(obs).toBeCloseTo(10 / 3, 10);
    });

    it('handles window size 1', () => {
      const data = [10, 20, 30];
      const res = computeDecayLinearSeries(data, 1);
      expect(res.begIndex).toBe(0);
      expect(res.values).toEqual([10, 20, 30]);
      expect(computeDecayLinearObservation(data, 1)).toBe(30);
    });
  });

  describe('computeRollingCorr', () => {
    it('computes perfect positive and negative correlation', () => {
      const x = [1, 2, 3, 4, 5];
      const yPos = [2, 4, 6, 8, 10];
      const yNeg = [10, 8, 6, 4, 2];

      const posRes = computeRollingCorrSeries(x, yPos, 3);
      expect(posRes.begIndex).toBe(2);
      for (const val of posRes.values) {
        expect(val).toBeCloseTo(1.0, 10);
      }
      expect(computeRollingCorrObservation(x, yPos, 3)).toBeCloseTo(1.0, 10);

      const negRes = computeRollingCorrSeries(x, yNeg, 3);
      expect(negRes.begIndex).toBe(2);
      for (const val of negRes.values) {
        expect(val).toBeCloseTo(-1.0, 10);
      }
      expect(computeRollingCorrObservation(x, yNeg, 3)).toBeCloseTo(-1.0, 10);
    });

    it('safely evaluates to 0.0 for zero-variance flat series without NaN', () => {
      const x = [1, 2, 3, 4, 5];
      const flatY = [3, 3, 3, 3, 3];

      const res = computeRollingCorrSeries(x, flatY, 3);
      expect(res.begIndex).toBe(2);
      expect(res.values).toEqual([0, 0, 0]);
      expect(computeRollingCorrObservation(x, flatY, 3)).toBe(0);
    });

    it('handles window size 1 safely returning 0', () => {
      const x = [1, 2];
      const y = [3, 4];
      const res = computeRollingCorrSeries(x, y, 1);
      expect(res.values).toEqual([0, 0]);
      expect(computeRollingCorrObservation(x, y, 1)).toBe(0);
    });
  });

  describe('computeRollingStd', () => {
    it('computes sample standard deviation by default (ddof=1) and population (ddof=0)', () => {
      const data = [1, 2, 3, 4, 5];
      // For [1, 2, 3]: mean=2, var = ((1-2)^2 + (2-2)^2 + (3-2)^2)/2 = 1.0, std = 1.0
      const sampleRes = computeRollingStdSeries(data, 3);
      expect(sampleRes.begIndex).toBe(2);
      expect(sampleRes.values[0]).toBeCloseTo(1.0, 10);
      expect(computeRollingStdObservation(data, 3)).toBeCloseTo(1.0, 10);

      // Population std: sqrt(2/3) ~ 0.8164965809
      const popRes = computeRollingStdSeries(data, 3, { ddof: 0 });
      expect(popRes.begIndex).toBe(2);
      expect(popRes.values[0]).toBeCloseTo(Math.sqrt(2 / 3), 10);
      expect(computeRollingStdObservation(data, 3, { ddof: 0 })).toBeCloseTo(
        Math.sqrt(2 / 3),
        10,
      );
    });

    it('returns 0.0 for flat sequence', () => {
      const flat = [4, 4, 4, 4];
      const res = computeRollingStdSeries(flat, 3);
      expect(res.values).toEqual([0, 0]);
      expect(computeRollingStdObservation(flat, 3)).toBe(0);
    });

    it('returns 0.0 for window size 1', () => {
      const data = [10, 20];
      const res = computeRollingStdSeries(data, 1);
      expect(res.values).toEqual([0, 0]);
      expect(computeRollingStdObservation(data, 1)).toBe(0);
    });
  });

  describe('computeTsDelta and computeTsDelay', () => {
    it('computes first-order differences and lags', () => {
      const data = [10, 25, 45, 70];
      const delta1 = computeTsDeltaSeries(data, 1);
      expect(delta1.begIndex).toBe(1);
      expect(delta1.values).toEqual([15, 20, 25]);
      expect(computeTsDeltaObservation(data, 1)).toBe(25);

      const delay1 = computeTsDelaySeries(data, 1);
      expect(delay1.begIndex).toBe(1);
      expect(delay1.values).toEqual([10, 25, 45]);
      expect(computeTsDelayObservation(data, 1)).toBe(45);

      const delta2 = computeTsDeltaSeries(data, 2);
      expect(delta2.begIndex).toBe(2);
      expect(delta2.values).toEqual([35, 45]);
      expect(computeTsDeltaObservation(data, 2)).toBe(45);

      const delay2 = computeTsDelaySeries(data, 2);
      expect(delay2.begIndex).toBe(2);
      expect(delay2.values).toEqual([10, 25]);
      expect(computeTsDelayObservation(data, 2)).toBe(25);
    });
  });

  describe('Input validation & parameter errors', () => {
    it('throws IndicatorInputError for non-positive or non-integer window sizes', () => {
      const data = [1, 2, 3, 4, 5];
      expect(() => computeTsRankSeries(data, 0)).toThrow(IndicatorInputError);
      expect(() => computeTsRankSeries(data, -2)).toThrow(IndicatorInputError);
      expect(() => computeTsRankSeries(data, 2.5)).toThrow(IndicatorInputError);
      expect(() => computeTsRankSeries(data, NaN)).toThrow(IndicatorInputError);

      expect(() => computeTsArgMaxObservation(data, -1)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeDecayLinearObservation(data, 0)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeRollingStdSeries(data, 1.2)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeRollingStdSeries(data, 3, { ddof: 3 })).toThrow(
        IndicatorInputError,
      );
    });

    it('throws IndicatorInputError for non-positive or non-integer periods', () => {
      const data = [1, 2, 3, 4];
      expect(() => computeTsDeltaSeries(data, 0)).toThrow(IndicatorInputError);
      expect(() => computeTsDeltaSeries(data, -1)).toThrow(IndicatorInputError);
      expect(() => computeTsDelaySeries(data, 1.5)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeTsDeltaObservation(data, 0)).toThrow(
        IndicatorInputError,
      );
    });

    it('throws IndicatorInputError for mismatched dual series lengths in rollingCorr', () => {
      const x = [1, 2, 3];
      const y = [1, 2];
      expect(() => computeRollingCorrSeries(x, y, 2)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeRollingCorrObservation(x, y, 2)).toThrow(
        IndicatorInputError,
      );
    });
  });

  describe('Insufficient input length behavior', () => {
    it('returns empty array with begIndex=length for series when input < window', () => {
      const shortData = [10, 20];
      const rankRes = computeTsRankSeries(shortData, 3);
      expect(rankRes).toEqual({ begIndex: 2, values: [] });

      const maxRes = computeTsArgMaxSeries(shortData, 3);
      expect(maxRes).toEqual({ begIndex: 2, values: [] });

      const decayRes = computeDecayLinearSeries(shortData, 3);
      expect(decayRes).toEqual({ begIndex: 2, values: [] });

      const corrRes = computeRollingCorrSeries(shortData, [1, 2], 3);
      expect(corrRes).toEqual({ begIndex: 2, values: [] });

      const stdRes = computeRollingStdSeries(shortData, 3);
      expect(stdRes).toEqual({ begIndex: 2, values: [] });

      // For delta/delay, minimum length is period + 1
      const deltaRes = computeTsDeltaSeries(shortData, 2);
      expect(deltaRes).toEqual({ begIndex: 2, values: [] });
    });

    it('throws IndicatorInputError for observations when input < window', () => {
      const shortData = [10, 20];
      expect(() => computeTsRankObservation(shortData, 3)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeTsArgMaxObservation(shortData, 3)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeDecayLinearObservation(shortData, 3)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeRollingCorrObservation(shortData, [1, 2], 3)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeRollingStdObservation(shortData, 3)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeTsDeltaObservation(shortData, 2)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeTsDelayObservation(shortData, 2)).toThrow(
        IndicatorInputError,
      );
    });
  });

  describe('Input immutability (frozen inputs)', () => {
    it('does not mutate caller arrays even when frozen', () => {
      const frozenInput = Object.freeze([12, 18, 25, 31, 22, 19, 28, 35]);
      const frozenInputY = Object.freeze([5, 8, 12, 16, 14, 11, 15, 20]);

      expect(() => computeTsRankSeries(frozenInput, 4)).not.toThrow();
      expect(() => computeTsArgMaxSeries(frozenInput, 4)).not.toThrow();
      expect(() => computeTsArgMinSeries(frozenInput, 4)).not.toThrow();
      expect(() => computeDecayLinearSeries(frozenInput, 4)).not.toThrow();
      expect(() =>
        computeRollingCorrSeries(frozenInput, frozenInputY, 4),
      ).not.toThrow();
      expect(() => computeRollingStdSeries(frozenInput, 4)).not.toThrow();
      expect(() => computeTsDeltaSeries(frozenInput, 2)).not.toThrow();
      expect(() => computeTsDelaySeries(frozenInput, 2)).not.toThrow();

      expect(() => computeTsRankObservation(frozenInput, 4)).not.toThrow();
      expect(() => computeTsArgMaxObservation(frozenInput, 4)).not.toThrow();
      expect(() => computeTsArgMinObservation(frozenInput, 4)).not.toThrow();
      expect(() => computeDecayLinearObservation(frozenInput, 4)).not.toThrow();
      expect(() =>
        computeRollingCorrObservation(frozenInput, frozenInputY, 4),
      ).not.toThrow();
      expect(() => computeRollingStdObservation(frozenInput, 4)).not.toThrow();
      expect(() => computeTsDeltaObservation(frozenInput, 2)).not.toThrow();
      expect(() => computeTsDelayObservation(frozenInput, 2)).not.toThrow();
    });
  });

  describe('Series tail vs Observation parity invariants', () => {
    it('ensures compute*Observation strictly matches compute*Series trailing value', () => {
      const length = 40;
      const dataX = Array.from(
        { length },
        (_, i) => Math.sin(i * 0.3) * 10 + 20,
      );
      const dataY = Array.from(
        { length },
        (_, i) => Math.cos(i * 0.2) * 5 + 15,
      );
      const window = 7;
      const period = 3;

      // 1. TsRank
      const rankSeries = computeTsRankSeries(dataX, window);
      const rankObs = computeTsRankObservation(dataX, window);
      expect(rankObs).toBeCloseTo(rankSeries.values.at(-1) as number, 10);

      // 2. TsArgMax
      const maxSeries = computeTsArgMaxSeries(dataX, window);
      const maxObs = computeTsArgMaxObservation(dataX, window);
      expect(maxObs).toBe(maxSeries.values.at(-1));

      // 3. TsArgMin
      const minSeries = computeTsArgMinSeries(dataX, window);
      const minObs = computeTsArgMinObservation(dataX, window);
      expect(minObs).toBe(minSeries.values.at(-1));

      // 4. DecayLinear
      const decaySeries = computeDecayLinearSeries(dataX, window);
      const decayObs = computeDecayLinearObservation(dataX, window);
      expect(decayObs).toBeCloseTo(decaySeries.values.at(-1) as number, 10);

      // 5. RollingCorr
      const corrSeries = computeRollingCorrSeries(dataX, dataY, window);
      const corrObs = computeRollingCorrObservation(dataX, dataY, window);
      expect(corrObs).toBeCloseTo(corrSeries.values.at(-1) as number, 10);

      // 6. RollingStd
      const stdSeries = computeRollingStdSeries(dataX, window);
      const stdObs = computeRollingStdObservation(dataX, window);
      expect(stdObs).toBeCloseTo(stdSeries.values.at(-1) as number, 10);

      // 7. TsDelta
      const deltaSeries = computeTsDeltaSeries(dataX, period);
      const deltaObs = computeTsDeltaObservation(dataX, period);
      expect(deltaObs).toBeCloseTo(deltaSeries.values.at(-1) as number, 10);

      // 8. TsDelay
      const delaySeries = computeTsDelaySeries(dataX, period);
      const delayObs = computeTsDelayObservation(dataX, period);
      expect(delayObs).toBeCloseTo(delaySeries.values.at(-1) as number, 10);
    });
  });
});
