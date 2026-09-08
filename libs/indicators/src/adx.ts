import pl from 'nodejs-polars';

export interface AdxSeriesResult {
  readonly begIndex: number;
  readonly adx: number[];
}

function computeWilderRma(arr: readonly number[], period: number): number[] {
  const s = pl.Series(arr);
  const sma = s.rollingMean(period).toArray() as (number | null)[];
  const seed = sma[period - 1] as number;
  const tail = [seed, ...arr.slice(period)];
  const tailSeries = pl.Series(tail);
  return tailSeries.ewmMean(1 / period, false).toArray() as number[];
}

/** ADX(14) full series computed via Polars vectorized operators. Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`. */
export function computeAdxSeries(
  high: readonly number[],
  low: readonly number[],
  close: readonly number[],
  period: number = 14,
): AdxSeriesResult {
  if (
    close.length < 2 * period ||
    high.length !== close.length ||
    low.length !== close.length
  ) {
    return {
      begIndex: close.length,
      adx: [],
    };
  }

  const df = pl.DataFrame({ high, low, close });

  const prevHigh = pl.col('high').shift(1);
  const prevLow = pl.col('low').shift(1);
  const prevClose = pl.col('close').shift(1);

  const tr1 = pl.col('high').sub(pl.col('low'));
  const tr2 = pl.col('high').sub(prevClose).abs();
  const tr3 = pl.col('low').sub(prevClose).abs();
  const m1 = pl.when(tr1.gt(tr2)).then(tr1).otherwise(tr2);
  const trExpr = pl.when(m1.gt(tr3)).then(m1).otherwise(tr3);

  const upMove = pl.col('high').sub(prevHigh);
  const downMove = prevLow.sub(pl.col('low'));

  const plusDm = pl
    .when(upMove.gt(downMove).and(upMove.gt(0)))
    .then(upMove)
    .otherwise(pl.lit(0));

  const minusDm = pl
    .when(downMove.gt(upMove).and(downMove.gt(0)))
    .then(downMove)
    .otherwise(pl.lit(0));

  const selected = df.select(
    trExpr.alias('tr'),
    plusDm.alias('plusDm'),
    minusDm.alias('minusDm'),
  );

  const tr = selected.getColumn('tr').toArray().slice(1) as number[];
  const pdm = selected.getColumn('plusDm').toArray().slice(1) as number[];
  const mdm = selected.getColumn('minusDm').toArray().slice(1) as number[];

  const trSmooth = computeWilderRma(tr, period);
  const pdmSmooth = computeWilderRma(pdm, period);
  const mdmSmooth = computeWilderRma(mdm, period);

  const diDf = pl.DataFrame({
    tr: trSmooth,
    pdm: pdmSmooth,
    mdm: mdmSmooth,
  });

  const pdi = pl.col('pdm').div(pl.col('tr')).mul(100);
  const mdi = pl.col('mdm').div(pl.col('tr')).mul(100);
  const diDiff = pdi.sub(mdi).abs();
  const diSum = pdi.add(mdi);

  const dxExpr = pl
    .when(diSum.eq(0))
    .then(pl.lit(0))
    .otherwise(diDiff.div(diSum).mul(100));

  const dx = diDf
    .select(dxExpr.alias('dx'))
    .getColumn('dx')
    .toArray() as number[];
  const adx = computeWilderRma(dx, period);

  return {
    begIndex: close.length - adx.length,
    adx,
  };
}
