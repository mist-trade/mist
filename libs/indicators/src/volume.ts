import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from './errors';

export interface VolumeSeriesResult {
  readonly begIndex: number;
  readonly volumes: number[];
  readonly vma5: number[];
  readonly vma10: number[];
  readonly vma20: number[];
  readonly volumeRatio: number[];
}

export interface VolumeObservation {
  readonly volume: number;
  readonly vma5: number;
  readonly vma10: number;
  readonly vma20: number;
  readonly volumeRatio: number;
}

export interface VolumeOptions {
  readonly periods?: readonly [number, number, number];
}

/**
 * VOL and Volume Moving Averages (VMA 5/10/20 & VolumeRatio) computed via Polars SIMD expressions.
 * Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`.
 */
export function computeVolumeSeries(
  volumes: readonly number[],
  options?: VolumeOptions,
): VolumeSeriesResult {
  const [p1, p2, p3] = options?.periods ?? [5, 10, 20];
  const maxPeriod = Math.max(p1, p2, p3);

  if (volumes.length < maxPeriod) {
    return {
      begIndex: volumes.length,
      volumes: [],
      vma5: [],
      vma10: [],
      vma20: [],
      volumeRatio: [],
    };
  }

  const s = pl.Series('volume', volumes as any).cast(pl.Float64);
  const rawVma5 = s.rollingMean(p1);
  const rawVma10 = s.rollingMean(p2);
  const rawVma20 = s.rollingMean(p3);

  const df = pl.DataFrame({
    volume: s,
    vma5: rawVma5,
    vma10: rawVma10,
    vma20: rawVma20,
  });

  // Standard 量比 realized on a bar series: the current bar's volume over the mean of
  // the PREVIOUS five bars (the current bar is excluded from the denominator).
  const prevVma5Expr = pl.col('volume').rollingMean(p1).shift(1);
  const ratioExpr = pl
    .when(prevVma5Expr.gt(0))
    .then(pl.col('volume').div(prevVma5Expr))
    .otherwise(pl.lit(1.0));

  const calculated = df.select(
    pl.col('volume'),
    pl.col('vma5'),
    pl.col('vma10'),
    pl.col('vma20'),
    ratioExpr.alias('ratio'),
  );

  const begIndex = maxPeriod - 1;
  const volArr = calculated.getColumn('volume').toArray() as number[];
  const vma5Arr = calculated.getColumn('vma5').toArray() as number[];
  const vma10Arr = calculated.getColumn('vma10').toArray() as number[];
  const vma20Arr = calculated.getColumn('vma20').toArray() as number[];
  const ratioArr = calculated.getColumn('ratio').toArray() as number[];

  return {
    begIndex,
    volumes: volArr.slice(begIndex),
    vma5: vma5Arr.slice(begIndex),
    vma10: vma10Arr.slice(begIndex),
    vma20: vma20Arr.slice(begIndex),
    volumeRatio: ratioArr.slice(begIndex),
  };
}

/**
 * Volume observation: trailing scalar snapshot over the supplied window.
 */
export function computeVolumeObservation(
  volumes: readonly number[],
  options?: VolumeOptions,
): VolumeObservation {
  const [p1, p2, p3] = options?.periods ?? [5, 10, 20];
  const maxPeriod = Math.max(p1, p2, p3);

  if (volumes.length < maxPeriod) {
    throw new IndicatorInputError(
      `computeVolumeObservation requires at least ${maxPeriod} volumes; got ${volumes.length}`,
    );
  }

  const series = computeVolumeSeries(volumes, options);
  if (series.volumes.length === 0) {
    throw new IndicatorValueError(
      'computeVolumeObservation did not produce a finite trailing value',
    );
  }

  return {
    volume: series.volumes.at(-1) as number,
    vma5: series.vma5.at(-1) as number,
    vma10: series.vma10.at(-1) as number,
    vma20: series.vma20.at(-1) as number,
    volumeRatio: series.volumeRatio.at(-1) as number,
  };
}
