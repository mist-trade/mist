import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';

export type KissType = 'FLYING' | 'LIP' | 'WET' | 'NONE';

export interface KissStatesOptions {
  readonly fastPeriod?: number;
  readonly slowPeriod?: number;
  readonly windowSize?: number;
  /** 湿吻缠绕均比阈值，默认 0.003 (0.3%) */
  readonly wetRatioThreshold?: number;
  /** 飞吻逼近最大均比阈值，默认 0.006 (0.6%) */
  readonly flyingRatioThreshold?: number;
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

  const wetRatioThreshold = options?.wetRatioThreshold ?? 0.003;
  const flyingRatioThreshold = options?.flyingRatioThreshold ?? 0.006;

  const df = pl.DataFrame({
    close: pl.Series('close', close as any).cast(pl.Float64),
  });

  const fastCol = pl.col('close').rollingMean(fastPeriod);
  const slowCol = pl.col('close').rollingMean(slowPeriod);
  const diff = fastCol.sub(slowCol);
  const prevDiff = diff.shift(1);
  const mean = fastCol.add(slowCol).mul(0.5);

  const stdRel = pl
    .when(mean.abs().gt(1e-12))
    .then(diff.abs().div(mean))
    .otherwise(pl.lit(0.0));

  const diffRatio = pl
    .when(slowCol.abs().gt(1e-12))
    .then(diff.div(slowCol))
    .otherwise(pl.lit(0.0));

  const absDiffRatio = diffRatio.abs();
  const mei = pl.lit(1.0).div(pl.lit(1.0).add(stdRel.mul(100.0)));

  // Polars 向量化零交叉统计 (相邻变号)
  const isCrossing = pl
    .when(
      diff
        .gt(0)
        .and(prevDiff.lt(0))
        .or(diff.lt(0).and(prevDiff.gt(0))),
    )
    .then(pl.lit(1))
    .otherwise(pl.lit(0));
  const crossings = isCrossing.rollingSum({
    windowSize: Math.max(1, windowSize - 1),
    minPeriods: 1,
  });

  // 近 5 根均比与窗口内最小均比
  const recent5AvgAbsRatio = absDiffRatio.rollingMean({
    windowSize: 5,
    minPeriods: 1,
  });
  const minAbsRatio = absDiffRatio.rollingMin({
    windowSize,
    minPeriods: 1,
  });

  // Polars 向量化吻态分类 (WET / LIP / FLYING / NONE)
  const wetCond = crossings
    .gtEq(2)
    .or(recent5AvgAbsRatio.lt(wetRatioThreshold));
  const lipCond = crossings.eq(1);
  const flyingCond = crossings
    .eq(0)
    .and(minAbsRatio.ltEq(flyingRatioThreshold))
    .and(absDiffRatio.gt(minAbsRatio));

  const kissTypeCol = pl
    .when(wetCond)
    .then(pl.lit('WET'))
    .when(lipCond)
    .then(pl.lit('LIP'))
    .when(flyingCond)
    .then(pl.lit('FLYING'))
    .otherwise(pl.lit('NONE'));

  const computedDf = df.select(
    fastCol.alias('fast'),
    slowCol.alias('slow'),
    diff.alias('diff'),
    diffRatio.alias('diffRatio'),
    mei.alias('mei'),
    kissTypeCol.alias('kissType'),
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
  const meiArr = computedDf
    .getColumn('mei')
    .toArray()
    .slice(begIndex) as number[];
  const kissTypes = computedDf
    .getColumn('kissType')
    .toArray()
    .slice(begIndex) as KissType[];

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
