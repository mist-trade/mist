import pl from 'nodejs-polars';

export interface AtrSeriesResult {
  readonly begIndex: number;
  readonly atr: number[];
}

function computeWilderRma(arr: readonly number[], period: number): number[] {
  const s = pl.Series('v', arr as any).cast(pl.Float64);
  const sma = s.rollingMean(period).toArray() as (number | null)[];
  const seed = sma[period - 1] as number;
  const tail = [seed, ...arr.slice(period)];
  const tailSeries = pl.Series('tail', tail as any).cast(pl.Float64);
  return tailSeries.ewmMean(1 / period, false).toArray() as number[];
}

/** ATR(14) full series computed via Polars vectorized operators. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeAtrSeries(
  high: readonly number[],
  low: readonly number[],
  close: readonly number[],
  period: number = 14,
): AtrSeriesResult {
  if (close.length <= period) {
    return {
      begIndex: close.length,
      atr: [],
    };
  }

  const df = pl.DataFrame({
    high: pl.Series('high', high as any).cast(pl.Float64),
    low: pl.Series('low', low as any).cast(pl.Float64),
    close: pl.Series('close', close as any).cast(pl.Float64),
  });
  const prevClose = pl.col('close').shift(1);
  const tr1 = pl.col('high').sub(pl.col('low'));
  const tr2 = pl.col('high').sub(prevClose).abs();
  const tr3 = pl.col('low').sub(prevClose).abs();

  const m1 = pl.when(tr1.gt(tr2)).then(tr1).otherwise(tr2);
  const trExpr = pl.when(m1.gt(tr3)).then(m1).otherwise(tr3);

  const tr = df
    .select(trExpr.alias('tr'))
    .getColumn('tr')
    .toArray()
    .slice(1) as number[];

  const atr = computeWilderRma(tr, period);

  return {
    begIndex: close.length - atr.length,
    atr,
  };
}
