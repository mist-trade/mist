import pl from 'nodejs-polars';

export interface DualMaSeriesResult {
  readonly begIndex: number;
  readonly shortMA: number[];
  readonly longMA: number[];
}

export interface DualMaSeriesParams {
  readonly shortPeriod?: number;
  readonly longPeriod?: number;
}

/** Dual moving average (SMA 13/60) full series via Polars rollingMean. `out[i]` aligns to `in[i + begIndex]`. */
export function computeDualMaSeries(
  closes: readonly number[],
  params?: DualMaSeriesParams,
): DualMaSeriesResult {
  const shortPeriod = params?.shortPeriod ?? 13;
  const longPeriod = params?.longPeriod ?? 60;

  if (closes.length < shortPeriod) {
    return {
      begIndex: closes.length,
      shortMA: [],
      longMA: [],
    };
  }

  const s = pl.Series(closes);
  const shortMA = s
    .rollingMean(shortPeriod)
    .toArray()
    .slice(shortPeriod - 1) as number[];

  const longMA =
    closes.length < longPeriod
      ? []
      : (s
          .rollingMean(longPeriod)
          .toArray()
          .slice(longPeriod - 1) as number[]);

  return {
    begIndex: closes.length - shortMA.length,
    shortMA,
    longMA,
  };
}
