import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from './errors';

export interface RppSeriesResult {
  readonly begIndex: number;
  readonly rpp: number[];
}

export interface RppObservation {
  readonly rpp: number;
}

/**
 * RPP (Relative Price Position) series computed via Polars rolling expressions.
 * Normalized to [0.0, 1.0]; flat windows evaluate safely to 0.5.
 * Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`.
 */
export function computeRppSeries(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  window: number = 20,
): RppSeriesResult {
  if (highs.length !== lows.length || lows.length !== closes.length) {
    throw new IndicatorInputError(
      `computeRppSeries requires equal-length highs/lows/closes arrays; got ${highs.length}/${lows.length}/${closes.length}`,
    );
  }

  if (window <= 0) {
    throw new IndicatorInputError(
      `computeRppSeries window must be positive; got ${window}`,
    );
  }

  const len = closes.length;
  if (len < window) {
    return {
      begIndex: len,
      rpp: [],
    };
  }

  const df = pl.DataFrame({
    high: pl.Series('high', highs as any).cast(pl.Float64),
    low: pl.Series('low', lows as any).cast(pl.Float64),
    close: pl.Series('close', closes as any).cast(pl.Float64),
  });

  const minLow = pl.col('low').rollingMin(window);
  const maxHigh = pl.col('high').rollingMax(window);
  const range = maxHigh.sub(minLow);

  const rppExpr = pl
    .when(range.gt(0))
    .then(pl.col('close').sub(minLow).div(range))
    .otherwise(pl.lit(0.5));

  const calculated = df.select(rppExpr.alias('rpp'));
  const begIndex = window - 1;
  const rawRpp = calculated.getColumn('rpp').toArray() as number[];

  return {
    begIndex,
    rpp: rawRpp.slice(begIndex),
  };
}

/**
 * RPP observation: trailing scalar snapshot over the supplied window.
 */
export function computeRppObservation(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  window: number = 20,
): RppObservation {
  if (closes.length < window) {
    throw new IndicatorInputError(
      `computeRppObservation requires at least ${window} closes; got ${closes.length}`,
    );
  }

  const series = computeRppSeries(highs, lows, closes, window);
  if (series.rpp.length === 0) {
    throw new IndicatorValueError(
      'computeRppObservation did not produce a finite trailing value',
    );
  }

  return {
    rpp: series.rpp.at(-1) as number,
  };
}
