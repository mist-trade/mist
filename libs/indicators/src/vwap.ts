import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from './errors';

export interface VwapSeriesResult {
  readonly begIndex: number;
  readonly vwap: number[];
}

export interface VwapObservation {
  readonly vwap: number;
}

export interface VwapOptions {
  readonly window?: number;
}

/**
 * VWAP (Volume-Weighted Average Price) computed via Polars vectorized operators.
 * Supports cumulative session VWAP (default) or rolling window VWAP.
 * Falls back safely to close price when cumulative volume is zero.
 */
export function computeVwapSeries(
  closes: readonly number[],
  volumes: readonly number[],
  options?: VwapOptions,
): VwapSeriesResult {
  if (closes.length !== volumes.length) {
    throw new IndicatorInputError(
      `computeVwapSeries requires equal-length closes and volumes arrays; got ${closes.length}/${volumes.length}`,
    );
  }

  const window = options?.window;
  if (window !== undefined && window <= 0) {
    throw new IndicatorInputError(
      `computeVwapSeries window must be positive; got ${window}`,
    );
  }

  const len = closes.length;
  if (len === 0) {
    return {
      begIndex: 0,
      vwap: [],
    };
  }

  if (window !== undefined && len < window) {
    return {
      begIndex: len,
      vwap: [],
    };
  }

  const df = pl.DataFrame({
    close: pl.Series('close', closes as any).cast(pl.Float64),
    volume: pl.Series('volume', volumes as any).cast(pl.Float64),
  });

  const pvExpr = pl.col('close').mul(pl.col('volume'));
  const pvSumExpr =
    window !== undefined ? pvExpr.rollingSum(window) : pvExpr.cumSum();
  const volSumExpr =
    window !== undefined
      ? pl.col('volume').rollingSum(window)
      : pl.col('volume').cumSum();

  const vwapExpr = pl
    .when(volSumExpr.gt(0))
    .then(pvSumExpr.div(volSumExpr))
    .otherwise(pl.col('close'));

  const calculated = df.select(vwapExpr.alias('vwap'));
  const begIndex = window !== undefined ? window - 1 : 0;
  const rawVwap = calculated.getColumn('vwap').toArray() as number[];

  return {
    begIndex,
    vwap: rawVwap.slice(begIndex),
  };
}

/**
 * VWAP observation: trailing scalar snapshot over the supplied sequence.
 */
export function computeVwapObservation(
  closes: readonly number[],
  volumes: readonly number[],
  options?: VwapOptions,
): VwapObservation {
  const window = options?.window;
  if (closes.length === 0 || volumes.length === 0) {
    throw new IndicatorInputError(
      'computeVwapObservation requires non-empty closes and volumes',
    );
  }

  if (window !== undefined && closes.length < window) {
    throw new IndicatorInputError(
      `computeVwapObservation requires at least ${window} elements; got ${closes.length}`,
    );
  }

  const series = computeVwapSeries(closes, volumes, options);
  if (series.vwap.length === 0) {
    throw new IndicatorValueError(
      'computeVwapObservation did not produce a finite trailing value',
    );
  }

  return {
    vwap: series.vwap.at(-1) as number,
  };
}
