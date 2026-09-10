import pl from 'nodejs-polars';
import { IndicatorInputError, IndicatorValueError } from '../errors';
import {
  FIBONACCI_EXTENSION_RATIOS,
  FIBONACCI_RETRACEMENT_RATIOS,
  FibonacciDirection,
  FibonacciLevelItem,
  FibonacciLevelsOptions,
  FibonacciLevelsResult,
  FibonacciObservation,
  FibonacciParams,
  FibonacciSeriesResult,
  RetracementZone,
  StaticSwingFibonacciResult,
} from './fibonacci.types';

function roundPrice(value: number, precision?: number): number {
  if (precision !== undefined && precision >= 0) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Computes full Fibonacci rolling series via Polars Rust-vectorized expressions.
 * Warm-up positions carry no value; `out[i]` aligns to `in[i + begIndex]`.
 *
 * @param highs - High price series
 * @param lows - Low price series
 * @param closes - Close price series
 * @param params - Rolling period (default 50) and ratio overrides
 */
export function computeFibonacciSeries(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  params?: FibonacciParams,
): FibonacciSeriesResult {
  const period = params?.period ?? 50;
  if (!Number.isInteger(period) || period <= 0) {
    throw new IndicatorInputError(
      `Fibonacci period must be a positive integer (got ${period})`,
    );
  }
  const len = highs.length;
  if (lows.length !== len || closes.length !== len) {
    throw new IndicatorInputError(
      `High (${highs.length}), low (${lows.length}) and close (${closes.length}) arrays must have identical length`,
    );
  }

  if (len < period) {
    return {
      begIndex: len,
      rollingHigh: [],
      rollingLow: [],
      diff: [],
      ratio: [],
      levels: {},
    };
  }

  const df = pl.DataFrame({
    high: pl.Series('high', highs as any).cast(pl.Float64),
    low: pl.Series('low', lows as any).cast(pl.Float64),
    close: pl.Series('close', closes as any).cast(pl.Float64),
  });

  const rHighExpr = pl.col('high').rollingMax(period);
  const rLowExpr = pl.col('low').rollingMin(period);
  const diffExpr = rHighExpr.sub(rLowExpr);

  const ratioExpr = pl
    .when(diffExpr.eq(0))
    .then(pl.lit(0.5))
    .otherwise(rHighExpr.sub(pl.col('close')).div(diffExpr));

  const retracements =
    params?.customRetracements ?? FIBONACCI_RETRACEMENT_RATIOS;
  const extensions = params?.customExtensions ?? FIBONACCI_EXTENSION_RATIOS;

  const selectExprs: any[] = [
    rHighExpr.alias('rHigh'),
    rLowExpr.alias('rLow'),
    diffExpr.alias('diff'),
    ratioExpr.alias('ratio'),
  ];

  for (const r of retracements) {
    selectExprs.push(rHighExpr.sub(diffExpr.mul(r)).alias(`ret_${r}`));
  }

  for (const ext of extensions) {
    selectExprs.push(rLowExpr.add(diffExpr.mul(ext)).alias(`ext_${ext}`));
  }

  const begIndex = period - 1;
  const computedDf = df
    .select(...selectExprs)
    .slice({ offset: begIndex, length: len - begIndex });

  const rHigh = computedDf.getColumn('rHigh').toArray() as number[];
  const rLow = computedDf.getColumn('rLow').toArray() as number[];
  const diff = computedDf.getColumn('diff').toArray() as number[];
  const ratio = computedDf.getColumn('ratio').toArray() as number[];

  const levels: Record<string, number[]> = {};

  for (const r of retracements) {
    levels[r.toString()] = computedDf
      .getColumn(`ret_${r}`)
      .toArray() as number[];
  }

  for (const ext of extensions) {
    levels[ext.toString()] = computedDf
      .getColumn(`ext_${ext}`)
      .toArray() as number[];
  }

  return Object.freeze({
    begIndex,
    rollingHigh: rHigh,
    rollingLow: rLow,
    diff,
    ratio,
    levels: Object.freeze(levels),
  });
}

/**
 * Computes trailing Fibonacci observation on a window of price bars via Polars.
 */
export function computeFibonacciObservation(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  params?: FibonacciParams,
): FibonacciObservation {
  const period = params?.period ?? 50;
  if (!Number.isInteger(period) || period <= 0) {
    throw new IndicatorInputError(
      `Fibonacci period must be a positive integer (got ${period})`,
    );
  }
  const len = highs.length;
  if (lows.length !== len || closes.length !== len) {
    throw new IndicatorInputError(
      `High (${highs.length}), low (${lows.length}) and close (${closes.length}) arrays must have identical length`,
    );
  }
  if (len < period) {
    throw new IndicatorInputError(
      `computeFibonacciObservation requires at least ${period} bars; got ${len}`,
    );
  }

  const trailingHigh = highs.slice(-period);
  const trailingLow = lows.slice(-period);
  const close = closes[len - 1];

  if (
    !Number.isFinite(close) ||
    trailingHigh.some((v) => !Number.isFinite(v)) ||
    trailingLow.some((v) => !Number.isFinite(v))
  ) {
    throw new IndicatorValueError(
      'Fibonacci observation contains non-finite price values',
    );
  }

  const df = pl.DataFrame({
    high: pl.Series('high', trailingHigh as any).cast(pl.Float64),
    low: pl.Series('low', trailingLow as any).cast(pl.Float64),
  });

  const high = df.getColumn('high').max() as number;
  const low = df.getColumn('low').min() as number;

  const diff = high - low;
  const ratio = diff === 0 ? 0.5 : (high - close) / diff;

  const retracements =
    params?.customRetracements ?? FIBONACCI_RETRACEMENT_RATIOS;
  const extensions = params?.customExtensions ?? FIBONACCI_EXTENSION_RATIOS;
  const levels: Record<string, number> = {};

  for (const r of retracements) {
    levels[r.toString()] = high - diff * r;
  }
  for (const ext of extensions) {
    levels[ext.toString()] = low + diff * ext;
  }

  const tol = params?.toleranceRatio ?? 0.008;
  const isGoldenPocket = ratio >= 0.5 - tol && ratio <= 0.618 + tol;

  let zone: RetracementZone;
  if (ratio < 0) {
    zone = 'ABOVE_SWING';
  } else if (ratio < 0.382) {
    zone = 'SHALLOW';
  } else if (ratio < 0.5 - tol) {
    zone = 'MODERATE';
  } else if (isGoldenPocket) {
    zone = 'GOLDEN_POCKET';
  } else if (ratio <= 1.0) {
    zone = 'DEEP';
  } else {
    zone = 'INVALIDATED';
  }

  return Object.freeze({
    high,
    low,
    close,
    diff,
    ratio,
    levels: Object.freeze(levels),
    zone,
    isGoldenPocket,
  });
}

/**
 * Pure deterministic calculation of Fibonacci retracement and extension levels for static high/low prices.
 */
export function computeFibonacciLevels(
  high: number,
  low: number,
  direction: FibonacciDirection = 'up',
  options?: FibonacciLevelsOptions,
): FibonacciLevelsResult {
  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    throw new IndicatorInputError(
      `Fibonacci swing high and low must be finite numbers (got high: ${high}, low: ${low})`,
    );
  }

  if (high <= low) {
    throw new IndicatorInputError(
      `Fibonacci swing high must be strictly greater than low (got high: ${high}, low: ${low})`,
    );
  }

  if (direction !== 'up' && direction !== 'down') {
    throw new IndicatorInputError(
      `Fibonacci direction must be 'up' or 'down' (got ${direction})`,
    );
  }

  const diff = high - low;
  const retracementRatios =
    options?.customRetracements ?? FIBONACCI_RETRACEMENT_RATIOS;
  const extensionRatios =
    options?.customExtensions ?? FIBONACCI_EXTENSION_RATIOS;
  const precision = options?.precision;

  const retracements: FibonacciLevelItem[] = [];
  const extensions: FibonacciLevelItem[] = [];
  const levelsByRatio: Record<string, number> = {};

  if (direction === 'up') {
    for (const ratio of retracementRatios) {
      const price = roundPrice(high - ratio * diff, precision);
      const label = ratio.toFixed(3).replace(/\.?0+$/, '') || '0';
      const item: FibonacciLevelItem = Object.freeze({ ratio, price, label });
      retracements.push(item);
      levelsByRatio[ratio.toString()] = price;
    }

    for (const ratio of extensionRatios) {
      const price = roundPrice(low + ratio * diff, precision);
      const label = ratio.toFixed(3).replace(/\.?0+$/, '');
      const item: FibonacciLevelItem = Object.freeze({ ratio, price, label });
      extensions.push(item);
      levelsByRatio[ratio.toString()] = price;
    }
  } else {
    for (const ratio of retracementRatios) {
      const price = roundPrice(low + ratio * diff, precision);
      const label = ratio.toFixed(3).replace(/\.?0+$/, '') || '0';
      const item: FibonacciLevelItem = Object.freeze({ ratio, price, label });
      retracements.push(item);
      levelsByRatio[ratio.toString()] = price;
    }

    for (const ratio of extensionRatios) {
      const price = roundPrice(high - ratio * diff, precision);
      const label = ratio.toFixed(3).replace(/\.?0+$/, '');
      const item: FibonacciLevelItem = Object.freeze({ ratio, price, label });
      extensions.push(item);
      levelsByRatio[ratio.toString()] = price;
    }
  }

  return Object.freeze({
    high,
    low,
    direction,
    diff,
    retracements: Object.freeze(retracements),
    extensions: Object.freeze(extensions),
    levelsByRatio: Object.freeze(levelsByRatio),
  });
}

/**
 * Pure calculation of Fibonacci retracement for any generic static swing and current price.
 */
export function computeStaticSwingFibonacci(
  high: number,
  low: number,
  currentPrice: number,
  direction: FibonacciDirection = 'up',
  options?: FibonacciLevelsOptions & { toleranceRatio?: number },
): StaticSwingFibonacciResult {
  if (!Number.isFinite(currentPrice)) {
    throw new IndicatorInputError(
      `Current price must be a finite number (got ${currentPrice})`,
    );
  }

  const levels = computeFibonacciLevels(high, low, direction, options);
  const diff = high - low;

  let rawRatio: number;
  if (direction === 'up') {
    rawRatio = (high - currentPrice) / diff;
  } else {
    rawRatio = (currentPrice - low) / diff;
  }

  const precision = options?.precision ?? 4;
  const retracementRatio =
    Math.round(rawRatio * 10 ** precision) / 10 ** precision;

  const tolerance = options?.toleranceRatio ?? 0.008;
  const isGoldenPocket =
    retracementRatio >= 0.5 - tolerance &&
    retracementRatio <= 0.618 + tolerance;

  let zone: RetracementZone;
  if (retracementRatio < 0) {
    zone = 'ABOVE_SWING';
  } else if (retracementRatio < 0.382) {
    zone = 'SHALLOW';
  } else if (retracementRatio < 0.5 - tolerance) {
    zone = 'MODERATE';
  } else if (isGoldenPocket) {
    zone = 'GOLDEN_POCKET';
  } else if (retracementRatio <= 1.0) {
    zone = 'DEEP';
  } else {
    zone = 'INVALIDATED';
  }

  return Object.freeze({
    high,
    low,
    currentPrice,
    direction,
    diff,
    retracementRatio,
    zone,
    isGoldenPocket,
    levels,
  });
}
