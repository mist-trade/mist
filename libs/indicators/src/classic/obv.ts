import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from '../errors';

export interface ObvSeriesResult {
  readonly begIndex: number;
  readonly obv: number[];
}

export interface ObvObservation {
  readonly obv: number;
}

/**
 * OBV (On-Balance Volume) series computed via Polars vectorized operators.
 * Cumulative signed volume: +volume when close > prevClose, -volume when close < prevClose, 0 when flat.
 */
export function computeObvSeries(
  closes: readonly number[],
  volumes: readonly number[],
): ObvSeriesResult {
  if (closes.length !== volumes.length) {
    throw new IndicatorInputError(
      `computeObvSeries requires equal-length closes and volumes arrays; got ${closes.length}/${volumes.length}`,
    );
  }

  if (closes.length === 0) {
    return {
      begIndex: 0,
      obv: [],
    };
  }

  if (closes.length === 1) {
    return {
      begIndex: 0,
      obv: [0],
    };
  }

  const df = pl.DataFrame({
    close: pl.Series('close', closes as any).cast(pl.Float64),
    volume: pl.Series('volume', volumes as any).cast(pl.Float64),
  });

  const diff = pl.col('close').sub(pl.col('close').shift(1));
  const signExpr = pl
    .when(diff.gt(0))
    .then(pl.lit(1))
    .when(diff.lt(0))
    .then(pl.lit(-1))
    .otherwise(pl.lit(0));

  const signedVolExpr = pl.col('volume').mul(signExpr);
  const calculated = df.select(signedVolExpr.cumSum().alias('obv'));

  const obvArr = calculated.getColumn('obv').toArray() as number[];

  return {
    begIndex: 0,
    obv: obvArr,
  };
}

/**
 * OBV observation: trailing scalar snapshot over the supplied sequence.
 */
export function computeObvObservation(
  closes: readonly number[],
  volumes: readonly number[],
): ObvObservation {
  if (closes.length === 0 || volumes.length === 0) {
    throw new IndicatorInputError(
      'computeObvObservation requires non-empty closes and volumes',
    );
  }

  const series = computeObvSeries(closes, volumes);
  if (series.obv.length === 0) {
    throw new IndicatorValueError(
      'computeObvObservation did not produce a finite trailing value',
    );
  }

  return {
    obv: series.obv.at(-1) as number,
  };
}
