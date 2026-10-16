import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';
import type {
  ClosedTradeInput,
  DailyReturnsSeriesResult,
  DrawdownSeriesResult,
  PerformanceSummaryOptions,
  PerformanceSummaryResult,
  SharpeRatioOptions,
} from './performance.types';

const DEFAULT_ANNUAL_RISK_FREE_RATE = 0.02;
const DEFAULT_TRADING_DAYS_PER_YEAR = 250;
const MAX_PROFIT_LOSS_RATIO_CAP = 999.0;
const RATIO_ROUNDING_SCALE = 10000;

const COL_NAV = 'nav';
const COL_RET = 'ret';
const COL_PEAK = 'peak';
const COL_DD = 'dd';
const COL_MAX_DD = 'maxDd';

/**
 * 基于 Rust nodejs-polars 向量化计算每日收益率时序。
 * 遵循 double-track / series 规范：begIndex = 1，对齐 out[i] === in[i + 1]。
 */
export function computeDailyReturns(
  navSeries: readonly number[],
): DailyReturnsSeriesResult {
  const len = navSeries.length;
  if (len < 2) {
    return {
      begIndex: len,
      returns: [],
    };
  }

  const s = pl.Series(COL_NAV, navSeries as any).cast(pl.Float64);
  const df = pl.DataFrame({ [COL_NAV]: s });
  const prevExpr = pl.col(COL_NAV).shift(1);
  const retExpr = pl
    .when(prevExpr.gt(0))
    .then(pl.col(COL_NAV).sub(prevExpr).div(prevExpr))
    .otherwise(pl.lit(0.0));

  const res = df.select(retExpr.alias(COL_RET));
  const returns = (res.getColumn(COL_RET).toArray() as (number | null)[]).slice(
    1,
  ) as number[];

  return {
    begIndex: 1,
    returns,
  };
}

/**
 * 计算动态回撤时序与历史最大回撤（Max Drawdown）。
 * 严格使用 Rust Polars cumMax 向量化计算，严禁 JS 循环。
 */
export function computeDrawdownSeries(
  navSeries: readonly number[],
): DrawdownSeriesResult {
  const len = navSeries.length;
  if (len === 0) {
    return {
      maxDrawdown: 0,
      peakSeries: [],
      drawdownSeries: [],
    };
  }

  const s = pl.Series(COL_NAV, navSeries as any).cast(pl.Float64);
  const df = pl.DataFrame({ [COL_NAV]: s });
  const peakExpr = pl.col(COL_NAV).cumMax();
  const ddExpr = pl
    .when(peakExpr.gt(0))
    .then(peakExpr.sub(pl.col(COL_NAV)).div(peakExpr))
    .otherwise(pl.lit(0.0));

  const res = df.select(
    peakExpr.alias(COL_PEAK),
    ddExpr.alias(COL_DD),
    ddExpr.max().alias(COL_MAX_DD),
  );

  const peaks = res.getColumn(COL_PEAK).toArray() as number[];
  const dds = res.getColumn(COL_DD).toArray() as number[];
  const maxDd = (res.getColumn(COL_MAX_DD).get(0) as number) ?? 0;

  return {
    maxDrawdown: Math.max(0, maxDd),
    peakSeries: peaks,
    drawdownSeries: dds,
  };
}

/**
 * 快速获取单一标的净值曲线的最大回撤。
 */
export function computeMaxDrawdown(navSeries: readonly number[]): number {
  return computeDrawdownSeries(navSeries).maxDrawdown;
}

/**
 * 基于 Rust Polars 统计矩计算年化夏普比率（Sharpe Ratio）。
 * Sharpe = ((E[R] - Rf) / Std(R)) * sqrt(TradingDays)
 */
export function computeSharpeRatio(
  dailyReturns: readonly number[],
  options?: SharpeRatioOptions,
): number {
  if (dailyReturns.length < 2) {
    return 0;
  }

  const rfAnnual = options?.annualRiskFreeRate ?? DEFAULT_ANNUAL_RISK_FREE_RATE;
  const tradingDays =
    options?.tradingDaysPerYear ?? DEFAULT_TRADING_DAYS_PER_YEAR;

  if (tradingDays <= 0) {
    throw new IndicatorInputError('tradingDaysPerYear must be greater than 0');
  }

  const dailyRf = rfAnnual / tradingDays;
  const df = pl.DataFrame({
    [COL_RET]: pl.Series(COL_RET, dailyReturns as any).cast(pl.Float64),
  });

  const mean = df
    .select(pl.col(COL_RET).mean())
    .getColumn(COL_RET)
    .get(0) as number;
  const std = df
    .select(pl.col(COL_RET).std())
    .getColumn(COL_RET)
    .get(0) as number;

  if (!Number.isFinite(std) || std <= 0) {
    return 0;
  }

  const excessMean = mean - dailyRf;
  const rawSharpe = (excessMean / std) * Math.sqrt(tradingDays);

  return Number.isFinite(rawSharpe)
    ? Math.round(rawSharpe * RATIO_ROUNDING_SCALE) / RATIO_ROUNDING_SCALE
    : 0;
}

/**
 * 计算卡玛比率（Calmar Ratio = 年化收益率 / 最大回撤）。
 */
export function computeCalmarRatio(
  annualizedReturn: number,
  maxDrawdown: number,
): number {
  if (!Number.isFinite(maxDrawdown) || maxDrawdown <= 0) {
    return 0;
  }
  if (!Number.isFinite(annualizedReturn)) {
    return 0;
  }

  const rawCalmar = annualizedReturn / maxDrawdown;
  return Number.isFinite(rawCalmar)
    ? Math.round(rawCalmar * RATIO_ROUNDING_SCALE) / RATIO_ROUNDING_SCALE
    : 0;
}

/**
 * 整合输出完整绩效指标摘要，供回测执行器汇总使用。
 */
export function computePerformanceSummary(
  navSeries: readonly number[],
  trades: readonly ClosedTradeInput[],
  options?: PerformanceSummaryOptions,
): PerformanceSummaryResult {
  if (navSeries.length === 0) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      calmarRatio: 0,
      winRate: 0,
      profitLossRatio: 0,
      tradeCount: 0,
    };
  }

  const initialNav = navSeries[0];
  const finalNav = navSeries[navSeries.length - 1];
  const totalReturn = initialNav > 0 ? (finalNav - initialNav) / initialNav : 0;

  const tradingDaysPerYear =
    options?.tradingDaysPerYear ?? DEFAULT_TRADING_DAYS_PER_YEAR;
  const totalDays = navSeries.length;
  const annualizedReturn =
    totalDays > 1 && totalReturn > -1
      ? Math.pow(1 + totalReturn, tradingDaysPerYear / totalDays) - 1
      : totalReturn;

  const returnsResult = computeDailyReturns(navSeries);
  const maxDrawdown = computeMaxDrawdown(navSeries);
  const sharpeRatio = computeSharpeRatio(returnsResult.returns, options);
  const calmarRatio = computeCalmarRatio(annualizedReturn, maxDrawdown);

  // 交易指标统计
  const tradeCount = trades.length;
  const winTrades = trades.filter((t) => t.realizedPnl > 0);
  const lossTrades = trades.filter((t) => t.realizedPnl < 0);
  const winRate = tradeCount > 0 ? winTrades.length / tradeCount : 0;

  const totalWinPnl = winTrades.reduce((acc, t) => acc + t.realizedPnl, 0);
  const totalLossPnl = Math.abs(
    lossTrades.reduce((acc, t) => acc + t.realizedPnl, 0),
  );

  let profitLossRatio = 0;
  if (totalLossPnl > 0) {
    profitLossRatio = totalWinPnl / totalLossPnl;
  } else if (totalWinPnl > 0) {
    profitLossRatio = MAX_PROFIT_LOSS_RATIO_CAP;
  }

  return {
    totalReturn:
      Math.round(totalReturn * RATIO_ROUNDING_SCALE) / RATIO_ROUNDING_SCALE,
    annualizedReturn:
      Math.round(annualizedReturn * RATIO_ROUNDING_SCALE) /
      RATIO_ROUNDING_SCALE,
    maxDrawdown:
      Math.round(maxDrawdown * RATIO_ROUNDING_SCALE) / RATIO_ROUNDING_SCALE,
    sharpeRatio,
    calmarRatio,
    winRate: Math.round(winRate * RATIO_ROUNDING_SCALE) / RATIO_ROUNDING_SCALE,
    profitLossRatio:
      Math.round(profitLossRatio * RATIO_ROUNDING_SCALE) / RATIO_ROUNDING_SCALE,
    tradeCount,
  };
}
