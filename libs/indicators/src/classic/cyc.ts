import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from '../errors';

export interface CycSeriesResult {
  readonly begIndex: number;
  readonly cyc: number[];
}

export interface CycObservation {
  readonly cyc: number;
}

export interface CycOptions {
  /** Smoothing period. Defaults to 13. */
  readonly period?: number;
  /**
   * If true (default), volume array is in shares (股), so `amount / volume` is price per share.
   * If false, volume array is in lots (手, TDX convention), so `0.01 * amount / volume` is price per share.
   */
  readonly volumeInShares?: boolean;
  /**
   * Optional fallback close prices when cumulative or smoothed volume is zero.
   */
  readonly closes?: readonly number[];
}

export const DEFAULT_CYC_PERIOD = 13;

const COL_AMOUNT = 'amount';
const COL_VOLUME = 'volume';
const COL_CLOSE = 'close';
const COL_CYC = 'cyc';
const COL_HIGH = 'high';
const COL_LOW = 'low';

export interface IndexCycOptions {
  /** Smoothing period. Defaults to 13. */
  readonly period?: number;
}

/**
 * Computes authentic Compass Cost Moving Average (CYC, 成本均线) using Polars vectorized operators:
 * CYC_N = EMA(amount, N) / (scaleFactor * EMA(volume, N))
 * where scaleFactor is 1.0 (if volume in shares) or 100.0 (if volume in lots).
 *
 * Side-effect free, strictly pure numeric kernel.
 */
export function computeCycSeries(
  amounts: readonly number[],
  volumes: readonly number[],
  options?: CycOptions,
): CycSeriesResult {
  if (amounts.length !== volumes.length) {
    throw new IndicatorInputError(
      `computeCycSeries requires equal-length amounts and volumes; got ${amounts.length}/${volumes.length}`,
    );
  }

  const period = options?.period ?? DEFAULT_CYC_PERIOD;
  if (period <= 0) {
    throw new IndicatorInputError(
      `computeCycSeries period must be positive; got ${period}`,
    );
  }

  const closes = options?.closes;
  if (closes !== undefined && closes.length !== amounts.length) {
    throw new IndicatorInputError(
      `computeCycSeries requires closes to match amounts length; got ${closes.length}/${amounts.length}`,
    );
  }

  const len = amounts.length;
  if (len === 0) {
    return {
      begIndex: 0,
      cyc: [],
    };
  }

  const volumeInShares = options?.volumeInShares ?? true;
  const unitScale = volumeInShares ? 1.0 : 0.01;
  const alpha = 2 / (period + 1);

  const df = pl.DataFrame({
    [COL_AMOUNT]: pl.Series(COL_AMOUNT, amounts as any).cast(pl.Float64),
    [COL_VOLUME]: pl.Series(COL_VOLUME, volumes as any).cast(pl.Float64),
    ...(closes !== undefined
      ? { [COL_CLOSE]: pl.Series(COL_CLOSE, closes as any).cast(pl.Float64) }
      : {}),
  });

  const emaAmountExpr = pl.col(COL_AMOUNT).ewmMean({ alpha, adjust: false });
  const emaVolExpr = pl.col(COL_VOLUME).ewmMean({ alpha, adjust: false });

  const fallbackExpr = closes !== undefined ? pl.col(COL_CLOSE) : pl.lit(0.0);

  const cycExpr = pl
    .when(emaVolExpr.gt(0).and(emaAmountExpr.gt(0)))
    .then(emaAmountExpr.div(emaVolExpr).mul(unitScale))
    .otherwise(fallbackExpr);

  const calculated = df.select(cycExpr.alias(COL_CYC));
  const rawCyc = calculated.getColumn(COL_CYC).toArray() as number[];

  return {
    begIndex: 0,
    cyc: rawCyc,
  };
}

/**
 * Observation: trailing scalar snapshot of the authentic CYC.
 */
export function computeCycObservation(
  amounts: readonly number[],
  volumes: readonly number[],
  options?: CycOptions,
): CycObservation {
  if (amounts.length === 0 || volumes.length === 0) {
    throw new IndicatorInputError(
      'computeCycObservation requires non-empty amounts and volumes',
    );
  }

  const series = computeCycSeries(amounts, volumes, options);
  if (series.cyc.length === 0) {
    throw new IndicatorValueError(
      'computeCycObservation did not produce a finite trailing value',
    );
  }

  return {
    cyc: series.cyc.at(-1) as number,
  };
}

/**
 * Computes authentic Index Cost Moving Average (Index CYC, 指数成本均线) using Polars vectorized operators:
 * Following TongDaXin/Compass index specification:
 * TP = (high + low + close) / 3
 * IndexCYC_N = EMA(TP, N)
 *
 * Side-effect free, strictly pure numeric kernel.
 */
export function computeIndexCycSeries(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  options?: IndexCycOptions,
): CycSeriesResult {
  if (highs.length !== lows.length || highs.length !== closes.length) {
    throw new IndicatorInputError(
      `computeIndexCycSeries requires equal-length highs, lows, and closes; got ${highs.length}/${lows.length}/${closes.length}`,
    );
  }

  const period = options?.period ?? DEFAULT_CYC_PERIOD;
  if (period <= 0) {
    throw new IndicatorInputError(
      `computeIndexCycSeries period must be positive; got ${period}`,
    );
  }

  const len = closes.length;
  if (len === 0) {
    return {
      begIndex: 0,
      cyc: [],
    };
  }

  const alpha = 2 / (period + 1);

  const df = pl.DataFrame({
    [COL_HIGH]: pl.Series(COL_HIGH, highs as any).cast(pl.Float64),
    [COL_LOW]: pl.Series(COL_LOW, lows as any).cast(pl.Float64),
    [COL_CLOSE]: pl.Series(COL_CLOSE, closes as any).cast(pl.Float64),
  });

  const tpExpr = pl
    .col(COL_HIGH)
    .add(pl.col(COL_LOW))
    .add(pl.col(COL_CLOSE))
    .div(3.0);

  const cycExpr = tpExpr.ewmMean({ alpha, adjust: false });
  const calculated = df.select(cycExpr.alias(COL_CYC));
  const rawCyc = calculated.getColumn(COL_CYC).toArray() as number[];

  return {
    begIndex: 0,
    cyc: rawCyc,
  };
}

/**
 * Observation: trailing scalar snapshot of the authentic Index CYC.
 */
export function computeIndexCycObservation(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  options?: IndexCycOptions,
): CycObservation {
  if (highs.length === 0 || lows.length === 0 || closes.length === 0) {
    throw new IndicatorInputError(
      'computeIndexCycObservation requires non-empty highs, lows, and closes',
    );
  }

  const series = computeIndexCycSeries(highs, lows, closes, options);
  if (series.cyc.length === 0) {
    throw new IndicatorValueError(
      'computeIndexCycObservation did not produce a finite trailing value',
    );
  }

  return {
    cyc: series.cyc.at(-1) as number,
  };
}
