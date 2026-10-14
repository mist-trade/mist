import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from './errors';

export interface VpciSeriesResult {
  readonly begIndex: number;
  readonly vpci: number[];
  readonly signalLine: number[];
  readonly vpc: number[];
  readonly vpr: number[];
}

export interface VpciObservation {
  readonly vpci: number;
  readonly signalLine: number;
  readonly vpc: number;
  readonly vpr: number;
}

export interface VpciOptions {
  readonly shortPeriod?: number;
  readonly longPeriod?: number;
  readonly signalPeriod?: number;
}

const DEFAULT_VPCI_SHORT = 5;
const DEFAULT_VPCI_LONG = 20;
const DEFAULT_VPCI_SIGNAL = 10;

/**
 * Volume Price Confirmation Indicator (VPCI) computed via Polars SIMD expressions.
 * Measures the intrinsic relationship between volume trends and price trends.
 * Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`.
 */
export function computeVpciSeries(
  prices: readonly number[],
  volumes: readonly number[],
  options?: VpciOptions,
): VpciSeriesResult {
  if (prices.length !== volumes.length) {
    throw new IndicatorInputError(
      `computeVpciSeries requires equal-length price and volume arrays; got ${prices.length}/${volumes.length}`,
    );
  }

  const shortPeriod = options?.shortPeriod ?? DEFAULT_VPCI_SHORT;
  const longPeriod = options?.longPeriod ?? DEFAULT_VPCI_LONG;
  const signalPeriod = options?.signalPeriod ?? DEFAULT_VPCI_SIGNAL;

  if (shortPeriod <= 0 || longPeriod <= 0 || signalPeriod <= 0) {
    throw new IndicatorInputError('VPCI periods must be greater than 0');
  }
  if (shortPeriod >= longPeriod) {
    throw new IndicatorInputError(
      `VPCI shortPeriod (${shortPeriod}) must be less than longPeriod (${longPeriod})`,
    );
  }

  const begIndex = longPeriod + signalPeriod - 2;
  const minRequired = begIndex + 1;

  if (prices.length < minRequired) {
    return {
      begIndex: prices.length,
      vpci: [],
      signalLine: [],
      vpc: [],
      vpr: [],
    };
  }

  const pSeries = pl.Series('price', prices as any).cast(pl.Float64);
  const vSeries = pl.Series('volume', volumes as any).cast(pl.Float64);

  const df = pl.DataFrame({
    price: pSeries,
    volume: vSeries,
  });

  const pvExpr = pl.col('price').mul(pl.col('volume'));
  const dfWithPv = df.withColumn(pvExpr.alias('pv'));

  // VWMA helper expressions: rollingSum(pv, N) / rollingSum(volume, N), fallback to SMA(price, N) if volume sum == 0
  const pvSumShort = pl.col('pv').rollingSum(shortPeriod);
  const vSumShort = pl.col('volume').rollingSum(shortPeriod);
  const smaShort = pl.col('price').rollingMean(shortPeriod);

  const vwmaShort = pl
    .when(vSumShort.gt(0))
    .then(pvSumShort.div(vSumShort))
    .otherwise(smaShort);

  const pvSumLong = pl.col('pv').rollingSum(longPeriod);
  const vSumLong = pl.col('volume').rollingSum(longPeriod);
  const smaLong = pl.col('price').rollingMean(longPeriod);

  const vwmaLong = pl
    .when(vSumLong.gt(0))
    .then(pvSumLong.div(vSumLong))
    .otherwise(smaLong);

  // VPC = VWMA_long - SMA_long
  const vpcExpr = vwmaLong.sub(smaLong);

  // VPR = (VWMA_short / SMA_short) / (VWMA_long / SMA_long)
  const ratioShort = pl
    .when(smaShort.gt(0))
    .then(vwmaShort.div(smaShort))
    .otherwise(pl.lit(1.0));

  const ratioLong = pl
    .when(smaLong.gt(0))
    .then(vwmaLong.div(smaLong))
    .otherwise(pl.lit(1.0));

  const vprExpr = pl
    .when(ratioLong.gt(0))
    .then(ratioShort.div(ratioLong))
    .otherwise(pl.lit(1.0));

  // VM = Volume_MA_short / Volume_MA_long
  const vmaShort = pl.col('volume').rollingMean(shortPeriod);
  const vmaLong = pl.col('volume').rollingMean(longPeriod);

  const vmExpr = pl
    .when(vmaLong.gt(0))
    .then(vmaShort.div(vmaLong))
    .otherwise(pl.lit(1.0));

  // VPCI = VPC * VPR * VM
  const vpciExpr = vpcExpr.mul(vprExpr).mul(vmExpr);

  const stage1 = dfWithPv.select(
    vpcExpr.alias('vpc'),
    vprExpr.alias('vpr'),
    vpciExpr.alias('vpci'),
  );

  // SignalLine = SMA(VPCI, signalPeriod)
  const signalExpr = pl.col('vpci').rollingMean(signalPeriod);
  const stage2 = stage1.withColumn(signalExpr.alias('signalLine'));

  const vpcArr = stage2.getColumn('vpc').toArray() as number[];
  const vprArr = stage2.getColumn('vpr').toArray() as number[];
  const vpciArr = stage2.getColumn('vpci').toArray() as number[];
  const signalArr = stage2.getColumn('signalLine').toArray() as number[];

  return {
    begIndex,
    vpc: vpcArr.slice(begIndex),
    vpr: vprArr.slice(begIndex),
    vpci: vpciArr.slice(begIndex),
    signalLine: signalArr.slice(begIndex),
  };
}

/**
 * Computes single VPCI observation for the latest bar.
 */
export function computeVpciObservation(
  prices: readonly number[],
  volumes: readonly number[],
  options?: VpciOptions,
): VpciObservation {
  const series = computeVpciSeries(prices, volumes, options);
  const len = series.vpci.length;
  if (len === 0) {
    throw new IndicatorValueError(
      'Insufficient price and volume data to compute VPCI observation',
    );
  }
  return {
    vpci: series.vpci[len - 1],
    signalLine: series.signalLine[len - 1],
    vpc: series.vpc[len - 1],
    vpr: series.vpr[len - 1],
  };
}
