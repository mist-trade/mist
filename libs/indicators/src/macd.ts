import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from './errors';

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
  const s = pl.Series(arr);
  const sma = s.rollingMean(period).toArray() as (number | null)[];
  const seed = sma[period - 1] as number;
  const tail = [seed, ...arr.slice(period)];
  const tailSeries = pl.Series(tail);
  return tailSeries.ewmMean(2 / (period + 1), false).toArray() as number[];
}

/** MACD(12/26/9 EMA) full series computed via Polars vectorized operators. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeMacdSeries(closes: readonly number[]): MacdSeriesResult {
  if (closes.length < 34) {
    return {
      begIndex: closes.length,
      macd: [],
      signal: [],
      histogram: [],
    };
  }

  const fastTail = computePolarsEma(closes, 12);
  const slowTail = computePolarsEma(closes, 26);
  const fastForSlow = fastTail.slice(26 - 12);

  const dif = pl
    .Series(fastForSlow)
    .sub(pl.Series(slowTail))
    .toArray() as number[];

  const signalTail = computePolarsEma(dif, 9);
  const macd = dif.slice(8);
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
  opts?: { readonly windowSize?: number },
): MacdObservation {
  if (opts?.windowSize !== undefined && closes.length !== opts.windowSize) {
    throw new IndicatorInputError(
      `computeMacdObservation requires exactly ${opts.windowSize} closes; got ${closes.length}`,
    );
  }

  const series = computeMacdSeries(closes);
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
