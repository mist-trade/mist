/**
 * Time-series primitive types and result contracts for @app/indicators.
 * All public types are pure TypeScript interfaces with zero leakage of internal engines.
 */

/**
 * Standard time-series calculation result for full-series views (`compute*Series`).
 * Aligns strictly with Mist indicator conventions: `values[i] === input[i + begIndex]`.
 */
export interface TimeSeriesResult {
  /** Leading warm-up offset. When input length is less than window, begIndex equals input.length. */
  readonly begIndex: number;
  /** Valid computed values aligned to input at `i + begIndex`. */
  readonly values: readonly number[];
}

/**
 * Options for time-series rolling percentile rank (`computeTsRankSeries` / `computeTsRankObservation`).
 */
export interface TsRankOptions {
  /**
   * Whether to normalize the rank to the range [0.0, 1.0].
   * Defaults to `true`.
   * When `false`, returns ordinal rank from 1 to W.
   */
  readonly normalize?: boolean;
}

/**
 * Options for rolling standard deviation (`computeRollingStdSeries` / `computeRollingStdObservation`).
 */
export interface RollingStdOptions {
  /**
   * Delta degrees of freedom.
   * Defaults to 1 (sample standard deviation with Bessel correction).
   * Set to 0 for population standard deviation.
   */
  readonly ddof?: number;
}
