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
  /**
   * Optional per-bar traded amount series. When supplied, the VWAP is weighted by the
   * exact amount (`Σamount / Σvolume`, the true traded average price) instead of the
   * default `close × volume` approximation.
   */
  readonly amounts?: readonly number[];
}

const COL_CLOSE = 'close';
const COL_VOLUME = 'volume';
const COL_AMOUNT = 'amount';
const COL_VWAP = 'vwap';

/**
 * VWAP (Volume-Weighted Average Price) computed via Polars vectorized operators.
 * Cumulative (window-accumulated) VWAP by default, or rolling window VWAP when a
 * `window` is supplied — NOT a session-reset variant. When `options.amounts` is
 * supplied the weighting source is the exact amount (`Σamount / Σvolume`); otherwise
 * it falls back to the `close × volume` approximation.
 * Falls back safely to close price when cumulative volume (or weighted sum) is not positive.
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

  const amounts = options?.amounts;
  if (amounts !== undefined && amounts.length !== closes.length) {
    throw new IndicatorInputError(
      `computeVwapSeries requires amounts to match closes length; got ${amounts.length}/${closes.length}`,
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
    close: pl.Series(COL_CLOSE, closes as any).cast(pl.Float64),
    volume: pl.Series(COL_VOLUME, volumes as any).cast(pl.Float64),
    ...(amounts !== undefined
      ? { amount: pl.Series(COL_AMOUNT, amounts as any).cast(pl.Float64) }
      : {}),
  });

  const pvExpr =
    amounts !== undefined
      ? pl.col(COL_AMOUNT)
      : pl.col(COL_CLOSE).mul(pl.col(COL_VOLUME));
  const pvSumExpr =
    window !== undefined ? pvExpr.rollingSum(window) : pvExpr.cumSum();
  const volSumExpr =
    window !== undefined
      ? pl.col(COL_VOLUME).rollingSum(window)
      : pl.col(COL_VOLUME).cumSum();

  const vwapExpr = pl
    .when(volSumExpr.gt(0).and(pvSumExpr.gt(0)))
    .then(pvSumExpr.div(volSumExpr))
    .otherwise(pl.col(COL_CLOSE));

  const calculated = df.select(vwapExpr.alias(COL_VWAP));
  const begIndex = window !== undefined ? window - 1 : 0;
  const rawVwap = calculated.getColumn(COL_VWAP).toArray() as number[];

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
