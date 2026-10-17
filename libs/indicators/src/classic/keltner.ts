import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from '../errors';
import { computeAtrSeries } from './atr';

export interface KeltnerChannelsSeriesResult {
  readonly begIndex: number;
  readonly upper: number[];
  readonly middle: number[];
  readonly lower: number[];
}

export interface KeltnerChannelsObservation {
  readonly upper: number;
  readonly middle: number;
  readonly lower: number;
}

export interface KeltnerChannelsOptions {
  readonly period?: number;
  readonly atrMultiplier?: number;
}

const DEFAULT_KC_PERIOD = 20;
const DEFAULT_KC_ATR_MULTIPLIER = 1.5;

/**
 * Keltner Channels (肯特纳通道) computed via Polars SIMD expressions and ATR.
 * Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`.
 */
export function computeKeltnerChannelsSeries(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  options?: KeltnerChannelsOptions,
): KeltnerChannelsSeriesResult {
  if (highs.length !== lows.length || lows.length !== closes.length) {
    throw new IndicatorInputError(
      `computeKeltnerChannelsSeries requires equal-length high/low/close arrays; got ${highs.length}/${lows.length}/${closes.length}`,
    );
  }

  const period = options?.period ?? DEFAULT_KC_PERIOD;
  const multiplier = options?.atrMultiplier ?? DEFAULT_KC_ATR_MULTIPLIER;

  if (period <= 0) {
    throw new IndicatorInputError(
      'Keltner Channels period must be greater than 0',
    );
  }
  if (multiplier < 0) {
    throw new IndicatorInputError(
      'Keltner Channels atrMultiplier must be non-negative',
    );
  }

  if (closes.length <= period) {
    return {
      begIndex: closes.length,
      upper: [],
      middle: [],
      lower: [],
    };
  }

  const atrResult = computeAtrSeries(highs, lows, closes, period);
  const begIndex = atrResult.begIndex; // period

  const s = pl.Series('close', closes as any).cast(pl.Float64);
  const rawMiddle = s.rollingMean(period).toArray() as (number | null)[];
  const middle = rawMiddle.slice(begIndex) as number[];

  const atrArr = atrResult.atr;

  const middleSeries = pl.Series('middle', middle as any).cast(pl.Float64);
  const atrSeries = pl.Series('atr', atrArr as any).cast(pl.Float64);

  const df = pl.DataFrame({
    middle: middleSeries,
    atr: atrSeries,
  });

  const upperExpr = pl.col('middle').add(pl.col('atr').mul(multiplier));
  const lowerExpr = pl.col('middle').sub(pl.col('atr').mul(multiplier));

  const calculated = df.select(
    pl.col('middle'),
    upperExpr.alias('upper'),
    lowerExpr.alias('lower'),
  );

  const upper = calculated.getColumn('upper').toArray() as number[];
  const lower = calculated.getColumn('lower').toArray() as number[];

  return {
    begIndex,
    middle,
    upper,
    lower,
  };
}

/**
 * Computes single Keltner Channels observation for the latest bar.
 */
export function computeKeltnerChannelsObservation(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  options?: KeltnerChannelsOptions,
): KeltnerChannelsObservation {
  const series = computeKeltnerChannelsSeries(highs, lows, closes, options);
  const len = series.middle.length;
  if (len === 0) {
    throw new IndicatorValueError(
      'Insufficient price data to compute Keltner Channels observation',
    );
  }
  return {
    upper: series.upper[len - 1],
    middle: series.middle[len - 1],
    lower: series.lower[len - 1],
  };
}
