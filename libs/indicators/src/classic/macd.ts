import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from '../errors';

export const DEFAULT_MACD_FAST_PERIOD = 12;
export const DEFAULT_MACD_SLOW_PERIOD = 26;
export const DEFAULT_MACD_SIGNAL_PERIOD = 9;

export interface MacdOptions {
  readonly fastPeriod?: number;
  readonly slowPeriod?: number;
  readonly signalPeriod?: number;
}

export interface MacdSeriesResult {
  readonly begIndex: number;
  readonly macd: number[];
  readonly signal: number[];
  readonly histogram: number[];
}

export interface MacdObservation {
  readonly line: number;
  readonly signal: number;
  readonly histogram: number;
}

/**
 * Evaluates exponential moving average (EMA) seeded by the initial period SMA,
 * executing strictly via Polars native rollingMean and ewmMean operators.
 */
function computePolarsEma(arr: readonly number[], period: number): number[] {
  const s = pl.Series('v', arr as any).cast(pl.Float64);
  const sma = s.rollingMean(period).toArray() as (number | null)[];
  const seed = sma[period - 1] as number;
  const tail = [seed, ...arr.slice(period)];
  const tailSeries = pl.Series('tail', tail as any).cast(pl.Float64);
  return tailSeries.ewmMean(2 / (period + 1), false).toArray() as number[];
}

/** MACD full series computed via Polars vectorized operators. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeMacdSeries(
  closes: readonly number[],
  options?: MacdOptions,
): MacdSeriesResult {
  const fastPeriod = options?.fastPeriod ?? DEFAULT_MACD_FAST_PERIOD;
  const slowPeriod = options?.slowPeriod ?? DEFAULT_MACD_SLOW_PERIOD;
  const signalPeriod = options?.signalPeriod ?? DEFAULT_MACD_SIGNAL_PERIOD;

  if (fastPeriod <= 0 || slowPeriod <= 0 || signalPeriod <= 0) {
    throw new IndicatorInputError('MACD periods must be positive integers');
  }
  if (fastPeriod >= slowPeriod) {
    throw new IndicatorInputError(
      `MACD fastPeriod (${fastPeriod}) must be less than slowPeriod (${slowPeriod})`,
    );
  }

  const minRequiredLength = slowPeriod + signalPeriod - 1;
  if (closes.length < minRequiredLength) {
    return {
      begIndex: closes.length,
      macd: [],
      signal: [],
      histogram: [],
    };
  }

  const fastTail = computePolarsEma(closes, fastPeriod);
  const slowTail = computePolarsEma(closes, slowPeriod);
  const fastForSlow = fastTail.slice(slowPeriod - fastPeriod);

  const dif = pl
    .Series(fastForSlow)
    .sub(pl.Series(slowTail))
    .toArray() as number[];

  const signalTail = computePolarsEma(dif, signalPeriod);
  const macd = dif.slice(signalPeriod - 1);
  const signal = signalTail;
  const histogram = pl
    .Series(macd)
    .sub(pl.Series(signal))
    .toArray() as number[];

  return {
    begIndex: closes.length - macd.length,
    macd,
    signal,
    histogram,
  };
}

/** MACD anchor observation: the trailing scalar value over the supplied window. */
export function computeMacdObservation(
  closes: readonly number[],
  opts?: { readonly windowSize?: number } & MacdOptions,
): MacdObservation {
  if (opts?.windowSize !== undefined && closes.length !== opts.windowSize) {
    throw new IndicatorInputError(
      `computeMacdObservation requires exactly ${opts.windowSize} closes; got ${closes.length}`,
    );
  }

  const series = computeMacdSeries(closes, opts);
  if (series.macd.length === 0) {
    throw new IndicatorValueError(
      'computeMacdObservation did not produce a finite trailing value',
    );
  }

  return {
    line: series.macd.at(-1) as number,
    signal: series.signal.at(-1) as number,
    histogram: series.histogram.at(-1) as number,
  };
}
