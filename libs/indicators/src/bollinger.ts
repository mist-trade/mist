import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from './errors';
import { computeRollingStdSeries } from './time-series';

export interface BollingerBandsSeriesResult {
  readonly begIndex: number;
  readonly upper: number[];
  readonly middle: number[];
  readonly lower: number[];
  readonly bandwidth: number[];
}

export interface BollingerBandsObservation {
  readonly upper: number;
  readonly middle: number;
  readonly lower: number;
  readonly bandwidth: number;
}

export interface BollingerBandsOptions {
  readonly period?: number;
  readonly stdDevMultiplier?: number;
}

const DEFAULT_BB_PERIOD = 20;
const DEFAULT_BB_STD_DEV = 2.0;

/**
 * Bollinger Bands (布林带) computed via Polars SIMD expressions.
 * Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`.
 */
export function computeBollingerBandsSeries(
  prices: readonly number[],
  options?: BollingerBandsOptions,
): BollingerBandsSeriesResult {
  const period = options?.period ?? DEFAULT_BB_PERIOD;
  const multiplier = options?.stdDevMultiplier ?? DEFAULT_BB_STD_DEV;

  if (period <= 0) {
    throw new IndicatorInputError(
      'Bollinger Bands period must be greater than 0',
    );
  }
  if (multiplier < 0) {
    throw new IndicatorInputError(
      'Bollinger Bands stdDevMultiplier must be non-negative',
    );
  }

  if (prices.length < period) {
    return {
      begIndex: prices.length,
      upper: [],
      middle: [],
      lower: [],
      bandwidth: [],
    };
  }

  // Classic Bollinger Bands use the POPULATION standard deviation (ddof = 0).
  // nodejs-polars ignores the `ddof` rolling option, so the shared ddof-aware
  // operator is the single source of truth for the Bessel correction.
  const begIndex = period - 1;
  const stdResult = computeRollingStdSeries(prices, period, { ddof: 0 });
  const s = pl.Series('price', prices as any).cast(pl.Float64);
  const meanArr = (s.rollingMean(period).toArray() as (number | null)[]).slice(
    begIndex,
  ) as number[];

  const df = pl.DataFrame({
    mean: meanArr,
    std: stdResult.values,
  });

  const upperExpr = pl.col('mean').add(pl.col('std').mul(multiplier));
  const lowerExpr = pl.col('mean').sub(pl.col('std').mul(multiplier));
  const bwExpr = pl
    .when(pl.col('mean').gt(0))
    .then(upperExpr.sub(lowerExpr).div(pl.col('mean')))
    .otherwise(pl.lit(0.0));

  const calculated = df.select(
    pl.col('mean'),
    upperExpr.alias('upper'),
    lowerExpr.alias('lower'),
    bwExpr.alias('bandwidth'),
  );

  const middleArr = calculated.getColumn('mean').toArray() as number[];
  const upperArr = calculated.getColumn('upper').toArray() as number[];
  const lowerArr = calculated.getColumn('lower').toArray() as number[];
  const bwArr = calculated.getColumn('bandwidth').toArray() as number[];

  return {
    begIndex,
    middle: middleArr,
    upper: upperArr,
    lower: lowerArr,
    bandwidth: bwArr,
  };
}

/**
 * Computes single Bollinger Bands observation for the latest bar.
 */
export function computeBollingerBandsObservation(
  prices: readonly number[],
  options?: BollingerBandsOptions,
): BollingerBandsObservation {
  const series = computeBollingerBandsSeries(prices, options);
  const len = series.middle.length;
  if (len === 0) {
    throw new IndicatorValueError(
      'Insufficient price data to compute Bollinger Bands observation',
    );
  }
  return {
    upper: series.upper[len - 1],
    middle: series.middle[len - 1],
    lower: series.lower[len - 1],
    bandwidth: series.bandwidth[len - 1],
  };
}
