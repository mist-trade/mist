import pl from 'nodejs-polars';

export interface RsiSeriesResult {
  readonly begIndex: number;
  readonly rsi: number[];
}

function computeWilderRma(arr: readonly number[], period: number): number[] {
  const s = pl.Series('v', arr as any).cast(pl.Float64);
  const sma = s.rollingMean(period).toArray() as (number | null)[];
  const seed = sma[period - 1] as number;
  const tail = [seed, ...arr.slice(period)];
  const tailSeries = pl.Series('tail', tail as any).cast(pl.Float64);
  return tailSeries.ewmMean(1 / period, false).toArray() as number[];
}

/** RSI(14) full series computed via Polars vectorized operators. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeRsiSeries(
  closes: readonly number[],
  period: number = 14,
): RsiSeriesResult {
  if (closes.length <= period) {
    return {
      begIndex: closes.length,
      rsi: [],
    };
  }

  const df = pl.DataFrame({
    close: pl.Series('close', closes as any).cast(pl.Float64),
  });
  const diff = pl.col('close').diff(1, 'ignore');
  const gainExpr = pl.when(diff.gt(0)).then(diff).otherwise(pl.lit(0));
  const lossExpr = pl.when(diff.lt(0)).then(diff.abs()).otherwise(pl.lit(0));

  const diffDf = df.select(gainExpr.alias('gain'), lossExpr.alias('loss'));

  const gains = diffDf.getColumn('gain').toArray().slice(1) as number[];
  const losses = diffDf.getColumn('loss').toArray().slice(1) as number[];

  const avgGains = computeWilderRma(gains, period);
  const avgLosses = computeWilderRma(losses, period);

  const rsiDf = pl.DataFrame({
    gain: avgGains,
    loss: avgLosses,
  });
  const rs = pl.col('gain').div(pl.col('loss'));
  const rsiExpr = pl
    .when(pl.col('loss').eq(0))
    .then(pl.lit(100))
    .otherwise(pl.lit(100).sub(pl.lit(100).div(pl.lit(1).add(rs))));

  const rsi = rsiDf
    .select(rsiExpr.alias('rsi'))
    .getColumn('rsi')
    .toArray() as number[];

  return {
    begIndex: closes.length - rsi.length,
    rsi,
  };
}
