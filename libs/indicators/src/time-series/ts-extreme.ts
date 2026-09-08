import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';
import { TimeSeriesResult } from './time-series.types';
import { assertValidWindow } from './time-series.utils';

function computeExtremeSeries(
  series: readonly number[],
  window: number,
  isMax: boolean,
  functionName: string,
): TimeSeriesResult {
  assertValidWindow(window, functionName);

  const len = series.length;
  if (len < window) {
    return {
      begIndex: len,
      values: [],
    };
  }

  const begIndex = window - 1;
  const s = pl.Series(series);
  const rollingExtremes = (
    isMax ? s.rollingMax(window) : s.rollingMin(window)
  ).toArray();

  const outCount = len - begIndex;
  const values = new Array<number>(outCount);

  for (let i = 0; i < outCount; i++) {
    const t = i + begIndex;
    const extremeVal = rollingExtremes[t] as number;

    // Tie-break: start from offset 0 (current bar) up to window - 1.
    // The first match is guaranteed to be the closest to the current bar (minimum offset).
    for (let offset = 0; offset < window; offset++) {
      if (series[t - offset] === extremeVal) {
        values[i] = offset;
        break;
      }
    }
  }

  return {
    begIndex,
    values,
  };
}

function computeExtremeObservation(
  series: readonly number[],
  window: number,
  isMax: boolean,
  functionName: string,
): number {
  assertValidWindow(window, functionName);

  if (series.length < window) {
    throw new IndicatorInputError(
      `${functionName} requires at least ${window} elements; got ${series.length}`,
    );
  }

  const trailing = series.slice(-window);
  const s = pl.Series(trailing);
  const extremeVal = (isMax ? s.max() : s.min()) as number;

  for (let offset = 0; offset < window; offset++) {
    if (trailing[window - 1 - offset] === extremeVal) {
      return offset;
    }
  }

  return 0;
}

/**
 * Computes offset to maximum in rolling window (`computeTsArgMaxSeries`).
 * Output ranges from 0 to W - 1; ties pick the closest bar (minimum offset).
 */
export function computeTsArgMaxSeries(
  series: readonly number[],
  window: number,
): TimeSeriesResult {
  return computeExtremeSeries(series, window, true, 'computeTsArgMaxSeries');
}

/**
 * Trailing observation for offset to maximum in rolling window (`computeTsArgMaxObservation`).
 */
export function computeTsArgMaxObservation(
  series: readonly number[],
  window: number,
): number {
  return computeExtremeObservation(
    series,
    window,
    true,
    'computeTsArgMaxObservation',
  );
}

/**
 * Computes offset to minimum in rolling window (`computeTsArgMinSeries`).
 * Output ranges from 0 to W - 1; ties pick the closest bar (minimum offset).
 */
export function computeTsArgMinSeries(
  series: readonly number[],
  window: number,
): TimeSeriesResult {
  return computeExtremeSeries(series, window, false, 'computeTsArgMinSeries');
}

/**
 * Trailing observation for offset to minimum in rolling window (`computeTsArgMinObservation`).
 */
export function computeTsArgMinObservation(
  series: readonly number[],
  window: number,
): number {
  return computeExtremeObservation(
    series,
    window,
    false,
    'computeTsArgMinObservation',
  );
}
