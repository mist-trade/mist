import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';
import { TimeSeriesResult } from './time-series.types';
import { assertMatchingLengths, assertValidWindow } from './time-series.utils';

/**
 * Computes rolling Pearson correlation coefficient full series (`computeRollingCorrSeries`).
 * If either series within the window has zero variance, safely evaluates to 0.0.
 * Output values are strictly clamped to [-1.0, 1.0].
 */
export function computeRollingCorrSeries(
  seriesX: readonly number[],
  seriesY: readonly number[],
  window: number,
): TimeSeriesResult {
  assertValidWindow(window, 'computeRollingCorrSeries');
  assertMatchingLengths(
    seriesX.length,
    seriesY.length,
    'computeRollingCorrSeries',
  );

  const len = seriesX.length;
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

  const sx = pl.Series(seriesX);
  const sy = pl.Series(seriesY);
  const sxy = sx.mul(sy);

  const mX = sx.rollingMean(window).toArray() as (number | null)[];
  const mY = sy.rollingMean(window).toArray() as (number | null)[];
  const mXY = sxy.rollingMean(window).toArray() as (number | null)[];
  const sX = sx.rollingStd(window).toArray() as (number | null)[];
  const sY = sy.rollingStd(window).toArray() as (number | null)[];

  const values = new Array<number>(outCount);
  const factor = window / (window - 1);

  for (let i = 0; i < outCount; i++) {
    const t = i + begIndex;
    const stdX = sX[t] as number;
    const stdY = sY[t] as number;
    const stdProd = stdX * stdY;

    if (
      stdProd === 0 ||
      !Number.isFinite(stdProd) ||
      stdX === 0 ||
      stdY === 0
    ) {
      values[i] = 0.0;
      continue;
    }

    const meanX = mX[t] as number;
    const meanY = mY[t] as number;
    const meanXY = mXY[t] as number;

    const cov = factor * (meanXY - meanX * meanY);
    const r = cov / stdProd;
    const clamped = Math.max(-1, Math.min(1, r));
    values[i] = Object.is(clamped, -0) ? 0 : clamped;
  }

  return {
    begIndex,
    values,
  };
}

/**
 * Computes trailing rolling Pearson correlation observation (`computeRollingCorrObservation`).
 * Evaluates strictly over the trailing window ending at the input's last element.
 */
export function computeRollingCorrObservation(
  seriesX: readonly number[],
  seriesY: readonly number[],
  window: number,
): number {
  assertValidWindow(window, 'computeRollingCorrObservation');
  assertMatchingLengths(
    seriesX.length,
    seriesY.length,
    'computeRollingCorrObservation',
  );

  if (seriesX.length < window) {
    throw new IndicatorInputError(
      `computeRollingCorrObservation requires at least ${window} elements; got ${seriesX.length}`,
    );
  }

  if (window === 1) {
    return 0.0;
  }

  const trailingX = seriesX.slice(-window);
  const trailingY = seriesY.slice(-window);

  const sx = pl.Series(trailingX);
  const sy = pl.Series(trailingY);

  const mx = sx.mean() as number;
  const my = sy.mean() as number;

  const dx = sx.sub(mx);
  const dy = sy.sub(my);

  const varX = dx.mul(dx).sum() as number;
  const varY = dy.mul(dy).sum() as number;

  if (
    varX === 0 ||
    varY === 0 ||
    !Number.isFinite(varX) ||
    !Number.isFinite(varY)
  ) {
    return 0.0;
  }

  const cov = dx.mul(dy).sum() as number;
  const denom = Math.sqrt(varX * varY);

  if (denom === 0) {
    return 0.0;
  }

  const r = cov / denom;
  const clamped = Math.max(-1, Math.min(1, r));
  return Object.is(clamped, -0) ? 0 : clamped;
}
