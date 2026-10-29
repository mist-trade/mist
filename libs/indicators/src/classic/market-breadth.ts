import pl from 'nodejs-polars';

export interface MarketBreadthResult {
  readonly totalCount: number;
  readonly validCount: number;
  readonly matchingCount: number;
  readonly ratio: number;
}

export const DEFAULT_CYS_OVERSOLD_THRESHOLD = -12.0;

/**
 * Computes cross-sectional CYS oversold market breadth across all active A-share stocks
 * using Polars vectorized expressions:
 * ratio = count(CYS < threshold) / validCount
 *
 * Side-effect free, strictly pure numeric kernel.
 */
export function computeCysMarketBreadth(
  cysValues: readonly (number | null | undefined)[],
  threshold: number = DEFAULT_CYS_OVERSOLD_THRESHOLD,
): MarketBreadthResult {
  const totalCount = cysValues.length;
  if (totalCount === 0) {
    return {
      totalCount: 0,
      validCount: 0,
      matchingCount: 0,
      ratio: 0.0,
    };
  }

  // Filter out null, undefined, or NaN
  const validNumbers = cysValues.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  const validCount = validNumbers.length;
  if (validCount === 0) {
    return {
      totalCount,
      validCount: 0,
      matchingCount: 0,
      ratio: 0.0,
    };
  }

  const s = pl.Series('cys', validNumbers as any).cast(pl.Float64);
  const matchingCount = Number(s.lt(threshold).cast(pl.Float64).sum());
  const ratio =
    validCount > 0 ? Number((matchingCount / validCount).toFixed(4)) : 0.0;

  return {
    totalCount,
    validCount,
    matchingCount,
    ratio,
  };
}

/**
 * Computes cross-sectional binary market breadth (e.g. stocks above MA250) across active stocks:
 * ratio = count(flag === true or 1) / validCount
 */
export function computeBinaryMarketBreadth(
  flags: readonly (boolean | number | null | undefined)[],
): MarketBreadthResult {
  const totalCount = flags.length;
  if (totalCount === 0) {
    return {
      totalCount: 0,
      validCount: 0,
      matchingCount: 0,
      ratio: 0.0,
    };
  }

  const validFlags = flags.filter(
    (v): v is boolean | number =>
      v !== null &&
      v !== undefined &&
      (typeof v === 'boolean' || Number.isFinite(v)),
  );
  const validCount = validFlags.length;
  if (validCount === 0) {
    return {
      totalCount,
      validCount: 0,
      matchingCount: 0,
      ratio: 0.0,
    };
  }

  const numericFlags = validFlags.map((f) =>
    f === true || f === 1 ? 1.0 : 0.0,
  );
  const s = pl.Series('flag', numericFlags as any).cast(pl.Float64);
  const matchingCount = s.sum() as number;
  const ratio =
    validCount > 0 ? Number((matchingCount / validCount).toFixed(4)) : 0.0;

  return {
    totalCount,
    validCount,
    matchingCount,
    ratio,
  };
}
