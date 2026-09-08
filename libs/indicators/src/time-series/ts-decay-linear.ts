import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';
import { TimeSeriesResult } from './time-series.types';
import { assertValidWindow } from './time-series.utils';

/**
 * Computes linear decay moving average series (`computeDecayLinearSeries`).
 * Weights are w = [1, 2, ..., W] where the latest element has weight W.
 * Evaluates natively via Polars weighted rolling sum.
 */
export function computeDecayLinearSeries(
  series: readonly number[],
  window: number,
): TimeSeriesResult {
  assertValidWindow(window, 'computeDecayLinearSeries');

  const len = series.length;
  if (len < window) {
    return {
      begIndex: len,
      values: [],
    };
  }

  const begIndex = window - 1;
  const weights = Array.from({ length: window }, (_, i) => i + 1);
  const weightSum = (window * (window + 1)) / 2;

  const s = pl.Series(series);
  const weightedSums = s.rollingSum(window, weights).toArray() as (
    | number
    | null
  )[];

  const outCount = len - begIndex;
  const values = new Array<number>(outCount);

  for (let i = 0; i < outCount; i++) {
    values[i] = (weightedSums[i + begIndex] as number) / weightSum;
  }

  return {
    begIndex,
    values,
  };
}

/**
 * Computes trailing linear decay moving average observation (`computeDecayLinearObservation`).
 * Evaluates strictly over the trailing window ending at the input's last element.
 */
export function computeDecayLinearObservation(
  series: readonly number[],
  window: number,
): number {
  assertValidWindow(window, 'computeDecayLinearObservation');

  if (series.length < window) {
    throw new IndicatorInputError(
      `computeDecayLinearObservation requires at least ${window} elements; got ${series.length}`,
    );
  }

  const trailing = series.slice(-window);
  const weights = Array.from({ length: window }, (_, i) => i + 1);
  const weightSum = (window * (window + 1)) / 2;

  const s = pl.Series(trailing);
  const weightedSum = s.rollingSum(window, weights).toArray().at(-1) as number;

  return weightedSum / weightSum;
}
