import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';

export type KissType = 'FLYING' | 'LIP' | 'WET' | 'NONE';

export interface KissStatesOptions {
  readonly fastPeriod?: number;
  readonly slowPeriod?: number;
  readonly windowSize?: number;
}

export interface KissStatesSeriesResult {
  readonly begIndex: number;
  readonly fastMa: readonly number[];
  readonly slowMa: readonly number[];
  readonly entanglementIndex: readonly number[];
  readonly kissTypes: readonly KissType[];
}

export interface KissStatesObservationResult {
  readonly fastMa: number;
  readonly slowMa: number;
  readonly entanglementIndex: number;
  readonly kissType: KissType;
}

/**
 * Computes moving average kiss states (飞吻 FLYING, 唇吻 LIP, 湿吻 WET, 无吻 NONE)
 * and Moving Average Entanglement Index (MEI) series via Polars SIMD expressions.
 */
export function computeKissStatesSeries(
  close: readonly number[],
  options?: KissStatesOptions,
): KissStatesSeriesResult {
  const fastPeriod = options?.fastPeriod ?? 5;
  const slowPeriod = options?.slowPeriod ?? 20;
  const windowSize = options?.windowSize ?? 10;

  if (fastPeriod <= 0) {
    throw new IndicatorInputError(
      `computeKissStatesSeries fastPeriod must be positive; got ${fastPeriod}`,
    );
  }
  if (slowPeriod <= fastPeriod) {
    throw new IndicatorInputError(
      `computeKissStatesSeries slowPeriod (${slowPeriod}) must be greater than fastPeriod (${fastPeriod})`,
    );
  }
  if (windowSize <= 0) {
    throw new IndicatorInputError(
      `computeKissStatesSeries windowSize must be positive; got ${windowSize}`,
    );
  }

  if (close.length < slowPeriod) {
    return {
      begIndex: close.length,
      fastMa: [],
      slowMa: [],
      entanglementIndex: [],
      kissTypes: [],
    };
  }

  const df = pl.DataFrame({
    close: pl.Series('close', close as any).cast(pl.Float64),
  });

  const fastCol = pl.col('close').rollingMean(fastPeriod);
  const slowCol = pl.col('close').rollingMean(slowPeriod);
  const diff = fastCol.sub(slowCol);
  const mean = fastCol.add(slowCol).mul(0.5);

  const stdRel = pl
    .when(mean.abs().gt(1e-12))
    .then(diff.abs().div(mean))
    .otherwise(pl.lit(0.0));

  const diffRatio = pl
    .when(slowCol.abs().gt(1e-12))
    .then(diff.div(slowCol))
    .otherwise(pl.lit(0.0));

  const mei = pl.lit(1.0).div(pl.lit(1.0).add(stdRel.mul(100.0)));

  const computedDf = df.select(
    fastCol.alias('fast'),
    slowCol.alias('slow'),
    diff.alias('diff'),
    diffRatio.alias('diffRatio'),
    mei.alias('mei'),
  );

  const begIndex = slowPeriod - 1;
  const fastArr = computedDf
    .getColumn('fast')
    .toArray()
    .slice(begIndex) as number[];
  const slowArr = computedDf
    .getColumn('slow')
    .toArray()
    .slice(begIndex) as number[];
  const diffArr = computedDf
    .getColumn('diff')
    .toArray()
    .slice(begIndex) as number[];
  const diffRatioArr = computedDf
    .getColumn('diffRatio')
    .toArray()
    .slice(begIndex) as number[];
  const meiArr = computedDf
    .getColumn('mei')
    .toArray()
    .slice(begIndex) as number[];

  const kissTypes: KissType[] = new Array(fastArr.length);

  for (let i = 0; i < fastArr.length; i++) {
    const startIdx = Math.max(0, i - windowSize + 1);
    const windowDiff = diffArr.slice(startIdx, i + 1);
    const windowDiffRatio = diffRatioArr.slice(startIdx, i + 1);

    // Count zero crossings in the window
    let crossings = 0;
    for (let j = 1; j < windowDiff.length; j++) {
      const prev = windowDiff[j - 1];
      const curr = windowDiff[j];
      if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
        crossings++;
      }
    }

    // Recent 5 bars average relative distance
    const recent5Start = Math.max(0, i - 4);
    const recent5Ratios = diffRatioArr.slice(recent5Start, i + 1);
    const recent5AvgAbsRatio =
      recent5Ratios.reduce((acc, v) => acc + Math.abs(v), 0) /
      recent5Ratios.length;

    // Minimum absolute distance in window
    let minAbsRatio = Infinity;
    for (let j = 0; j < windowDiffRatio.length; j++) {
      const absVal = Math.abs(windowDiffRatio[j]);
      if (absVal < minAbsRatio) {
        minAbsRatio = absVal;
      }
    }

    const currAbsRatio = Math.abs(diffRatioArr[i]);

    if (
      crossings >= 2 ||
      (recent5Ratios.length >= 3 && recent5AvgAbsRatio < 0.003)
    ) {
      kissTypes[i] = 'WET';
    } else if (crossings === 1) {
      kissTypes[i] = 'LIP';
    } else if (
      crossings === 0 &&
      minAbsRatio <= 0.006 &&
      currAbsRatio > minAbsRatio
    ) {
      kissTypes[i] = 'FLYING';
    } else {
      kissTypes[i] = 'NONE';
    }
  }

  return {
    begIndex,
    fastMa: fastArr,
    slowMa: slowArr,
    entanglementIndex: meiArr,
    kissTypes,
  };
}

/**
 * Computes moving average kiss state observation for the latest trailing candle.
 */
export function computeKissStatesObservation(
  close: readonly number[],
  options?: KissStatesOptions,
): KissStatesObservationResult {
  const slowPeriod = options?.slowPeriod ?? 20;
  if (close.length < slowPeriod) {
    throw new IndicatorInputError(
      `computeKissStatesObservation requires at least ${slowPeriod} closes; got ${close.length}`,
    );
  }

  const series = computeKissStatesSeries(close, options);
  const len = series.fastMa.length;
  if (len === 0) {
    throw new IndicatorInputError(
      'computeKissStatesObservation did not produce a valid output',
    );
  }

  return {
    fastMa: series.fastMa[len - 1],
    slowMa: series.slowMa[len - 1],
    entanglementIndex: series.entanglementIndex[len - 1],
    kissType: series.kissTypes[len - 1],
  };
}
