import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from '../errors';
import {
  computeCycSeries,
  computeIndexCycSeries,
  CycOptions,
  IndexCycOptions,
  DEFAULT_CYC_PERIOD,
} from './cyc';

export interface CysSeriesResult {
  readonly begIndex: number;
  readonly cys: number[];
  readonly cyc: number[];
}

export interface CysObservation {
  readonly cys: number;
  readonly cyc: number;
}

export interface CysOptions extends CycOptions {
  /** Smoothing period for the underlying CYC cost average. Defaults to 13. */
  readonly period?: number;
}

export interface IndexCysOptions extends IndexCycOptions {
  /** Smoothing period for the underlying Index CYC cost average. Defaults to 13. */
  readonly period?: number;
}

export const DEFAULT_CYS_PERIOD = DEFAULT_CYC_PERIOD;

const COL_CLOSE = 'close';
const COL_CYC = 'cyc';
const COL_CYS = 'cys';

/**
 * Computes authentic Compass Market Gain/Loss Rate (CYS, 市场盈亏指标) using Polars vectorized operators:
 * CYS_N = 100 * (close - CYC_N) / CYC_N
 *
 * Side-effect free, strictly pure numeric kernel.
 */
export function computeCysSeries(
  closes: readonly number[],
  amounts: readonly number[],
  volumes: readonly number[],
  options?: CysOptions,
): CysSeriesResult {
  if (closes.length !== amounts.length || closes.length !== volumes.length) {
    throw new IndicatorInputError(
      `computeCysSeries requires equal-length closes, amounts, and volumes; got closes=${closes.length}, amounts=${amounts.length}, volumes=${volumes.length}`,
    );
  }

  const len = closes.length;
  if (len === 0) {
    return {
      begIndex: 0,
      cys: [],
      cyc: [],
    };
  }

  const cycResult = computeCycSeries(amounts, volumes, {
    ...options,
    closes,
  });

  const df = pl.DataFrame({
    [COL_CLOSE]: pl.Series(COL_CLOSE, closes as any).cast(pl.Float64),
    [COL_CYC]: pl.Series(COL_CYC, cycResult.cyc as any).cast(pl.Float64),
  });

  const cysExpr = pl
    .when(pl.col(COL_CYC).gt(0))
    .then(
      pl.col(COL_CLOSE).sub(pl.col(COL_CYC)).div(pl.col(COL_CYC)).mul(100.0),
    )
    .otherwise(pl.lit(0.0));

  const calculated = df.select(cysExpr.alias(COL_CYS));
  const rawCys = calculated.getColumn(COL_CYS).toArray() as number[];

  return {
    begIndex: 0,
    cys: rawCys,
    cyc: cycResult.cyc,
  };
}

/**
 * Observation: trailing scalar snapshot of the authentic CYS and CYC.
 */
export function computeCysObservation(
  closes: readonly number[],
  amounts: readonly number[],
  volumes: readonly number[],
  options?: CysOptions,
): CysObservation {
  if (closes.length === 0 || amounts.length === 0 || volumes.length === 0) {
    throw new IndicatorInputError(
      'computeCysObservation requires non-empty closes, amounts, and volumes',
    );
  }

  const series = computeCysSeries(closes, amounts, volumes, options);
  if (series.cys.length === 0) {
    throw new IndicatorValueError(
      'computeCysObservation did not produce a finite trailing value',
    );
  }

  return {
    cys: series.cys.at(-1) as number,
    cyc: series.cyc.at(-1) as number,
  };
}

/**
 * Computes authentic Index Market Gain/Loss Rate (Index CYS, 指数市场盈亏指标) using Polars vectorized operators:
 * IndexCYS_N = 100 * (close - IndexCYC_N) / IndexCYC_N
 * where IndexCYC_N = EMA((high + low + close) / 3, N)
 *
 * Side-effect free, strictly pure numeric kernel.
 */
export function computeIndexCysSeries(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  options?: IndexCysOptions,
): CysSeriesResult {
  if (highs.length !== lows.length || highs.length !== closes.length) {
    throw new IndicatorInputError(
      `computeIndexCysSeries requires equal-length highs, lows, and closes; got highs=${highs.length}, lows=${lows.length}, closes=${closes.length}`,
    );
  }

  const len = closes.length;
  if (len === 0) {
    return {
      begIndex: 0,
      cys: [],
      cyc: [],
    };
  }

  const cycResult = computeIndexCycSeries(highs, lows, closes, options);

  const df = pl.DataFrame({
    [COL_CLOSE]: pl.Series(COL_CLOSE, closes as any).cast(pl.Float64),
    [COL_CYC]: pl.Series(COL_CYC, cycResult.cyc as any).cast(pl.Float64),
  });

  const cysExpr = pl
    .when(pl.col(COL_CYC).gt(0))
    .then(
      pl.col(COL_CLOSE).sub(pl.col(COL_CYC)).div(pl.col(COL_CYC)).mul(100.0),
    )
    .otherwise(pl.lit(0.0));

  const calculated = df.select(cysExpr.alias(COL_CYS));
  const rawCys = calculated.getColumn(COL_CYS).toArray() as number[];

  return {
    begIndex: 0,
    cys: rawCys,
    cyc: cycResult.cyc,
  };
}

/**
 * Observation: trailing scalar snapshot of the authentic Index CYS and Index CYC.
 */
export function computeIndexCysObservation(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  options?: IndexCysOptions,
): CysObservation {
  if (highs.length === 0 || lows.length === 0 || closes.length === 0) {
    throw new IndicatorInputError(
      'computeIndexCysObservation requires non-empty highs, lows, and closes',
    );
  }

  const series = computeIndexCysSeries(highs, lows, closes, options);
  if (series.cys.length === 0) {
    throw new IndicatorValueError(
      'computeIndexCysObservation did not produce a finite trailing value',
    );
  }

  return {
    cys: series.cys.at(-1) as number,
    cyc: series.cyc.at(-1) as number,
  };
}
