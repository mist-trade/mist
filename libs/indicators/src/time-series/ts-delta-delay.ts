import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';
import { TimeSeriesResult } from './time-series.types';
import { assertValidPeriod } from './time-series.utils';

/**
 * Computes time-series first-order difference series (`computeTsDeltaSeries`).
 * `values[i] === input[i + period] - input[i]`.
 * Warmup begIndex is `period`.
 */
export function computeTsDeltaSeries(
  series: readonly number[],
  period: number = 1,
): TimeSeriesResult {
  assertValidPeriod(period, 'computeTsDeltaSeries');

  const len = series.length;
  if (len < period + 1) {
    return {
      begIndex: len,
      values: [],
    };
  }

  const begIndex = period;
  const s = pl.Series(series);
  const diffs = s.diff(period, 'ignore').toArray() as (number | null)[];
  const outCount = len - begIndex;
  const values = new Array<number>(outCount);

  for (let i = 0; i < outCount; i++) {
    values[i] = diffs[i + begIndex] as number;
  }

  return {
    begIndex,
    values,
  };
}

/**
 * Computes trailing time-series difference observation (`computeTsDeltaObservation`).
 * Returns `series[last] - series[last - period]`.
 */
export function computeTsDeltaObservation(
  series: readonly number[],
  period: number = 1,
): number {
  assertValidPeriod(period, 'computeTsDeltaObservation');

  const len = series.length;
  if (len < period + 1) {
    throw new IndicatorInputError(
      `computeTsDeltaObservation requires at least ${period + 1} elements; got ${len}`,
    );
  }

  return series[len - 1] - series[len - 1 - period];
}

/**
 * Computes time-series lag/delay series (`computeTsDelaySeries`).
 * `values[i] === input[i]`.
 * Warmup begIndex is `period`.
 */
export function computeTsDelaySeries(
  series: readonly number[],
  period: number = 1,
): TimeSeriesResult {
  assertValidPeriod(period, 'computeTsDelaySeries');

  const len = series.length;
  if (len < period + 1) {
    return {
      begIndex: len,
      values: [],
    };
  }

  const begIndex = period;
  const s = pl.Series(series);
  const shifted = s.shift(period).toArray() as (number | null)[];
  const outCount = len - begIndex;
  const values = new Array<number>(outCount);

  for (let i = 0; i < outCount; i++) {
    values[i] = shifted[i + begIndex] as number;
  }

  return {
    begIndex,
    values,
  };
}

/**
 * Computes trailing time-series lag/delay observation (`computeTsDelayObservation`).
 * Returns `series[last - period]`.
 */
export function computeTsDelayObservation(
  series: readonly number[],
  period: number = 1,
): number {
  assertValidPeriod(period, 'computeTsDelayObservation');

  const len = series.length;
  if (len < period + 1) {
    throw new IndicatorInputError(
      `computeTsDelayObservation requires at least ${period + 1} elements; got ${len}`,
    );
  }

  return series[len - 1 - period];
}
