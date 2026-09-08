import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';
import { RollingStdOptions, TimeSeriesResult } from './time-series.types';
import { assertValidWindow } from './time-series.utils';

function validateDdof(ddof: number | undefined, functionName: string): number {
  const d = ddof ?? 1;
  if (d !== 0 && d !== 1) {
    throw new IndicatorInputError(
      `${functionName} requires ddof to be either 0 (population) or 1 (sample), received: ${ddof}`,
    );
  }
  return d;
}

/**
 * Computes rolling standard deviation full series (`computeRollingStdSeries`).
 * Defaults to sample standard deviation with Bessel correction (ddof = 1).
 * When options.ddof = 0, computes population standard deviation.
 */
export function computeRollingStdSeries(
  series: readonly number[],
  window: number,
  options?: RollingStdOptions,
): TimeSeriesResult {
  assertValidWindow(window, 'computeRollingStdSeries');
  const ddof = validateDdof(options?.ddof, 'computeRollingStdSeries');

  const len = series.length;
  if (len < window) {
    return {
      begIndex: len,
      values: [],
    };
  }

  const begIndex = window - 1;
  const outCount = len - begIndex;

  if (window === 1) {
    return {
      begIndex,
      values: new Array<number>(outCount).fill(0),
    };
  }

  const s = pl.Series(series);
  const sampleStds = s.rollingStd(window).toArray() as (number | null)[];
  const factor = ddof === 0 ? Math.sqrt((window - 1) / window) : 1;

  const values = new Array<number>(outCount);
  for (let i = 0; i < outCount; i++) {
    const std = (sampleStds[i + begIndex] as number) * factor;
    values[i] = Object.is(std, -0) ? 0 : std;
  }

  return {
    begIndex,
    values,
  };
}

/**
 * Computes trailing rolling standard deviation observation (`computeRollingStdObservation`).
 * Evaluates strictly over the trailing window ending at the input's last element.
 */
export function computeRollingStdObservation(
  series: readonly number[],
  window: number,
  options?: RollingStdOptions,
): number {
  assertValidWindow(window, 'computeRollingStdObservation');
  const ddof = validateDdof(options?.ddof, 'computeRollingStdObservation');

  if (series.length < window) {
    throw new IndicatorInputError(
      `computeRollingStdObservation requires at least ${window} elements; got ${series.length}`,
    );
  }

  if (window === 1) {
    return 0.0;
  }

  const trailing = series.slice(-window);
  const s = pl.Series(trailing);
  const sampleStd = s.rollingStd(window).toArray().at(-1) as number;
  const factor = ddof === 0 ? Math.sqrt((window - 1) / window) : 1;
  const result = sampleStd * factor;

  return Object.is(result, -0) ? 0 : result;
}
