import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';
import { TimeSeriesResult, TsRankOptions } from './time-series.types';
import { assertValidWindow } from './time-series.utils';

/**
 * Computes the ordinal or percentile rank of target element within window.
 * Ties receive average rank, identical to Polars Series.rank().
 */
function computeWindowRank(windowSlice: readonly number[]): number {
  const wLen = windowSlice.length;
  const target = windowSlice[wLen - 1];
  let smaller = 0;
  let equal = 0;

  for (let i = 0; i < wLen; i++) {
    const val = windowSlice[i];
    if (val < target) {
      smaller++;
    } else if (val === target) {
      equal++;
    }
  }

  // Exact average rank formula matching Polars Series.rank()
  return smaller + (equal + 1) / 2;
}

/**
 * Computes rolling percentile rank full series (`computeTsRankSeries`).
 * Each output aligns to `values[i] === input[i + begIndex]`.
 * Warmup period is `window - 1`.
 * Normalized to [0.0, 1.0] by default; flat windows evaluate to 0.5.
 */
export function computeTsRankSeries(
  series: readonly number[],
  window: number,
  options?: TsRankOptions,
): TimeSeriesResult {
  assertValidWindow(window, 'computeTsRankSeries');

  const len = series.length;
  if (len < window) {
    return {
      begIndex: len,
      values: [],
    };
  }

  const begIndex = window - 1;
  const normalize = options?.normalize !== false;
  const outCount = len - begIndex;
  const values = new Array<number>(outCount);

  for (let i = 0; i < outCount; i++) {
    const endIdx = i + begIndex;
    const windowSlice = series.slice(endIdx - window + 1, endIdx + 1);

    if (window === 1) {
      values[i] = normalize ? 0.5 : 1;
      continue;
    }

    const rank = computeWindowRank(windowSlice);
    if (normalize) {
      // If all values are identical, rank is (window + 1) / 2, formula evaluates exactly to 0.5
      values[i] = (rank - 1) / (window - 1);
    } else {
      values[i] = rank;
    }
  }

  return {
    begIndex,
    values,
  };
}

/**
 * Computes trailing rolling percentile rank observation (`computeTsRankObservation`).
 * Evaluates strictly over the trailing window ending at the input's last element.
 */
export function computeTsRankObservation(
  series: readonly number[],
  window: number,
  options?: TsRankOptions,
): number {
  assertValidWindow(window, 'computeTsRankObservation');

  if (series.length < window) {
    throw new IndicatorInputError(
      `computeTsRankObservation requires at least ${window} elements; got ${series.length}`,
    );
  }

  const trailing = series.slice(-window);
  const normalize = options?.normalize !== false;

  if (window === 1) {
    return normalize ? 0.5 : 1;
  }

  // Cross-verify with Polars rank on the trailing observation window
  const s = pl.Series(trailing);
  const rank = s.rank().get(window - 1) as number;

  if (normalize) {
    return (rank - 1) / (window - 1);
  }

  return rank;
}
