import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from './errors';

export interface KdjSeriesResult {
  readonly begIndex: number;
  readonly K: number[];
  readonly D: number[];
  readonly J: number[];
}

export interface KdjObservation {
  readonly k: number;
  readonly d: number;
  readonly j: number;
}

export interface KdjSeriesParams {
  readonly period?: number;
  readonly kSmoothing?: number;
  readonly dSmoothing?: number;
}

/** KDJ(9,3,3) full series computed via Polars vectorized operators. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeKdjSeries(
  high: readonly number[],
  low: readonly number[],
  close: readonly number[],
  params?: KdjSeriesParams,
): KdjSeriesResult {
  if (high.length !== low.length || low.length !== close.length) {
    throw new IndicatorInputError(
      `computeKdjSeries requires equal-length high/low/close arrays; got ${high.length}/${low.length}/${close.length}`,
    );
  }

  const period = params?.period ?? 9;
  const kSmoothing = params?.kSmoothing ?? 3;
  const dSmoothing = params?.dSmoothing ?? 3;

  const minRequired = period + kSmoothing + dSmoothing - 2;
  if (close.length < minRequired) {
    return {
      begIndex: close.length,
      K: [],
      D: [],
      J: [],
    };
  }

  const df = pl.DataFrame({
    high: pl.Series('high', high as any).cast(pl.Float64),
    low: pl.Series('low', low as any).cast(pl.Float64),
    close: pl.Series('close', close as any).cast(pl.Float64),
  });
  const lowN = pl.col('low').rollingMin(period);
  const highN = pl.col('high').rollingMax(period);
  const denom = highN.sub(lowN);
  const fastKExpr = pl
    .when(denom.eq(0))
    .then(pl.lit(50))
    .otherwise(pl.col('close').sub(lowN).div(denom).mul(100));

  const fK = df
    .select(fastKExpr.alias('fk'))
    .getColumn('fk')
    .toArray()
    .slice(period - 1) as number[];

  const slowK = pl
    .Series(fK)
    .rollingMean(kSmoothing)
    .toArray()
    .slice(kSmoothing - 1) as number[];

  const D = pl
    .Series(slowK)
    .rollingMean(dSmoothing)
    .toArray()
    .slice(dSmoothing - 1) as number[];

  const K = slowK.slice(slowK.length - D.length);

  const J = pl.Series(K).mul(3).sub(pl.Series(D).mul(2)).toArray() as number[];

  return {
    begIndex: close.length - K.length,
    K,
    D,
    J,
  };
}

/** KDJ anchor observation: the trailing scalar value over the supplied window. */
export function computeKdjObservation(
  high: readonly number[],
  low: readonly number[],
  close: readonly number[],
  opts?: { readonly windowSize?: number },
): KdjObservation {
  if (
    opts?.windowSize !== undefined &&
    (high.length !== opts.windowSize ||
      low.length !== opts.windowSize ||
      close.length !== opts.windowSize)
  ) {
    throw new IndicatorInputError(
      `computeKdjObservation requires exactly ${opts.windowSize} elements; got ${close.length}`,
    );
  }

  const series = computeKdjSeries(high, low, close);
  if (series.K.length === 0) {
    throw new IndicatorValueError(
      'computeKdjObservation did not produce a finite trailing value',
    );
  }

  return {
    k: series.K.at(-1) as number,
    d: series.D.at(-1) as number,
    j: series.J.at(-1) as number,
  };
}
