import pl from 'nodejs-polars';

export type ZhongshuZone =
  | 'LOWER_SUPPORT'
  | 'UPPER_RESISTANCE'
  | 'NEUTRAL_CORE'
  | 'OUTSIDE_ABOVE'
  | 'OUTSIDE_BELOW';

export interface ZhongshuOscillationSeriesResult {
  readonly begIndex: number;
  readonly zoi: readonly number[];
  readonly zone: readonly ZhongshuZone[];
}

export interface ZhongshuOscillationObservationResult {
  readonly zoi: number;
  readonly zone: ZhongshuZone;
}

/**
 * Classifies a normalized Zhongshu Oscillation Index (ZOI) into structural trading zones:
 * - LOWER_SUPPORT: [0.0, 0.20] (lower boundary support, prime area for 1st/2nd buy)
 * - UPPER_RESISTANCE: [0.80, 1.00] (upper boundary resistance, prime area for take-profit/exit)
 * - NEUTRAL_CORE: (0.20, 0.80) (central oscillation core, prone to noise and churn)
 * - OUTSIDE_ABOVE: > 1.00 (breakout above central, candidate for 3rd buy pullback)
 * - OUTSIDE_BELOW: < 0.00 (breakdown below central, candidate for 3rd sell rally)
 */
export function classifyZhongshuZone(zoi: number): ZhongshuZone {
  if (zoi < 0.0) return 'OUTSIDE_BELOW';
  if (zoi <= 0.2) return 'LOWER_SUPPORT';
  if (zoi < 0.8) return 'NEUTRAL_CORE';
  if (zoi <= 1.0) return 'UPPER_RESISTANCE';
  return 'OUTSIDE_ABOVE';
}

/**
 * Computes Dynamic Zhongshu Oscillation Index (ZOI) series using Polars SIMD expressions:
 * ZOI_t = (Close_t - ZD) / (ZG - ZD)
 *
 * Respects dynamic narrowing of Bi centrals or fixed invariant boundaries of Duan centrals.
 * Safe fallback: when ZG <= ZD (flat or inverted), ZOI defaults to 0.5 (NEUTRAL_CORE).
 */
export function computeZhongshuOscillationSeries(
  closes: readonly number[],
  zd: number,
  zg: number,
): ZhongshuOscillationSeriesResult {
  if (closes.length === 0) {
    return {
      begIndex: 0,
      zoi: [],
      zone: [],
    };
  }

  if (zg <= zd) {
    return {
      begIndex: 0,
      zoi: new Array(closes.length).fill(0.5),
      zone: new Array(closes.length).fill('NEUTRAL_CORE'),
    };
  }

  const s = pl.Series('close', closes as any).cast(pl.Float64);
  const span = zg - zd;
  const zoiSeries = s.sub(zd).div(span);
  const zoi = zoiSeries.toArray() as number[];
  const zone = zoi.map(classifyZhongshuZone);

  return {
    begIndex: 0,
    zoi,
    zone,
  };
}

/**
 * Computes Dynamic Zhongshu Oscillation Index (ZOI) observation for a single price point.
 */
export function computeZhongshuOscillationObservation(
  close: number,
  zd: number,
  zg: number,
): ZhongshuOscillationObservationResult {
  if (zg <= zd) {
    return {
      zoi: 0.5,
      zone: 'NEUTRAL_CORE',
    };
  }

  const zoi = (close - zd) / (zg - zd);
  return {
    zoi,
    zone: classifyZhongshuZone(zoi),
  };
}
