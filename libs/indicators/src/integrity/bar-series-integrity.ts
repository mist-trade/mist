import * as pl from 'nodejs-polars';

/**
 * 结构化最小入参（与 StrategyBar 结构兼容；本库零 @app 依赖）。
 */
export interface BarSeriesIntegrityInput {
  readonly period: number;
  readonly timestamp: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export type BarSeriesValidationReason =
  | 'insufficient_bars'
  | 'timestamp_reversed'
  | 'invalid_price'
  | 'price_boundary_violation'
  | 'contains_null_or_nan';

export type BarSeriesValidationOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: BarSeriesValidationReason };

/**
 * Polars 向量化行情序列质检（盘前预热用，纯函数、无 I/O）：
 * 时间戳严格递增、四价非负有限、high >= low、OHLC 无空值。
 * volume/amount 允许 null，不参与检查。
 */
export function validateBarSeriesWithPolars(
  bars: readonly BarSeriesIntegrityInput[],
  minRequiredBars: number,
): BarSeriesValidationOutcome {
  if (bars.length < Math.max(1, minRequiredBars)) {
    return { ok: false, reason: 'insufficient_bars' };
  }

  const df = pl.DataFrame([
    pl
      .Series(
        'timestamp',
        bars.map((bar) => bar.timestamp.getTime()),
      )
      .cast(pl.Int64),
    pl.Series(
      'open',
      bars.map((bar) => bar.open),
    ),
    pl.Series(
      'high',
      bars.map((bar) => bar.high),
    ),
    pl.Series(
      'low',
      bars.map((bar) => bar.low),
    ),
    pl.Series(
      'close',
      bars.map((bar) => bar.close),
    ),
  ]);

  // OHLC 空值 / 非有限值（NaN）
  const nullOrNanCount = scalar(
    df,
    ['open', 'high', 'low', 'close']
      .map((field) =>
        pl.col(field).isNull().sum().add(pl.col(field).isNan().sum()),
      )
      .reduce((left, right) => left.add(right)),
  );
  if (nullOrNanCount > 0) {
    return { ok: false, reason: 'contains_null_or_nan' };
  }

  // 时间戳严格递增（diff 首行为 null，不构成违规）
  if (
    scalar(
      df,
      pl.col('timestamp').diff({ n: 1, nullBehavior: 'ignore' }).lt(0).sum(),
    ) > 0
  ) {
    return { ok: false, reason: 'timestamp_reversed' };
  }

  // 四价非负
  const negativeCount = scalar(
    df,
    ['open', 'high', 'low', 'close']
      .map((field) => pl.col(field).lt(0).sum())
      .reduce((left, right) => left.add(right)),
  );
  if (negativeCount > 0) {
    return { ok: false, reason: 'invalid_price' };
  }

  // high >= low
  if (scalar(df, pl.col('high').lt(pl.col('low')).sum()) > 0) {
    return { ok: false, reason: 'price_boundary_violation' };
  }

  return { ok: true };
}

function scalar(df: pl.DataFrame, expression: pl.Expr): number {
  return Number(df.select(expression).rows()[0][0]);
}
