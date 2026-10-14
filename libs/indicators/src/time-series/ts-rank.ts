import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';
import { TimeSeriesResult, TsRankOptions } from './time-series.types';
import { assertValidWindow } from './time-series.utils';

/**
 * Computes rolling percentile rank full series (`computeTsRankSeries`) strictly via
 * Polars vectorized shift and conditional accumulator expressions (Rust SIMD).
 *
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

  if (window === 1) {
    return {
      begIndex,
      values: new Array<number>(outCount).fill(normalize ? 0.5 : 1),
    };
  }

  const s = pl.Series('val', series as any).cast(pl.Float64);
  const df = pl.DataFrame({ val: s });

  let smallerExpr = pl.lit(0);
  let equalExpr = pl.lit(0);

  for (let k = 0; k < window; k++) {
    const lag = pl.col('val').shift(k);
    smallerExpr = smallerExpr.add(
      pl
        .when(lag.lt(pl.col('val')))
        .then(pl.lit(1))
        .otherwise(pl.lit(0)),
    );
    equalExpr = equalExpr.add(
      pl
        .when(lag.eq(pl.col('val')))
        .then(pl.lit(1))
        .otherwise(pl.lit(0)),
    );
  }

  // Exact average rank formula matching Polars Series.rank(): smaller + (equal + 1) / 2
  const rankExpr = smallerExpr.add(equalExpr.add(pl.lit(1)).div(pl.lit(2)));

  const finalExpr = normalize
    ? rankExpr.sub(pl.lit(1)).div(pl.lit(window - 1))
    : rankExpr;

  const calculated = df.select(finalExpr.alias('tsRank'));
  const rawValues = calculated.getColumn('tsRank').toArray() as number[];

  return {
    begIndex,
    values: rawValues.slice(begIndex),
  };
}

/**
 * Computes trailing rolling percentile rank observation (`computeTsRankObservation`)
 * strictly via Polars Series.rank() over the trailing window ending at the input's last element.
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

  const s = pl.Series('trailing', trailing as any).cast(pl.Float64);
  const rank = s.rank().get(window - 1) as number;

  if (normalize) {
    return (rank - 1) / (window - 1);
  }

  return rank;
}
