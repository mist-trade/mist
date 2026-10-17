import pl from 'nodejs-polars';
import { IndicatorInputError } from '../errors';
import type {
  ClosedTradeInput,
  ComprehensiveRiskPerformanceResult,
  DailyReturnsSeriesResult,
  DrawdownSeriesResult,
  LiquidityDelayTradeInput,
  PerformanceSummaryOptions,
  PerformanceSummaryResult,
  SharpeRatioOptions,
} from './risk-performance.types';

export const DEFAULT_ANNUAL_RISK_FREE_RATE = 0.02;
export const DEFAULT_TRADING_DAYS_PER_YEAR = 250;
export const MAX_PROFIT_LOSS_RATIO_CAP = 999.0;
export const RATIO_ROUNDING_SCALE = 10000;
export const CALMAR_MIN_DRAWDOWN_EPSILON = 1e-4;
export const MAX_CALMAR_RATIO_CAP = 999.0;
export const DEFAULT_VAR_CONFIDENCE = 0.95;
export const MAX_OVERFITTING_RATIO_CAP = 999.0;

const COL_NAV = 'nav';
const COL_RET = 'ret';
const COL_PEAK = 'peak';
const COL_DD = 'dd';
const COL_MAX_DD = 'maxDd';
const COL_MEAN = 'mean';
const COL_STD = 'std';
const COL_PNL = 'pnl';
const COL_WIN_COUNT = 'winCount';
const COL_WIN_TOTAL = 'winTotal';
const COL_LOSS_TOTAL = 'lossTotal';
const COL_CVAR = 'cvar';
const COL_IS_UNDERWATER = 'is_underwater';
const COL_RUN_GROUP = 'run_group';
const COL_RUN_LEN = 'run_len';
const COL_MAX_LEN = 'max_len';
const COL_SLIPPAGE = 'slippage';
const COL_TOTAL = 'total';
const COL_VAR = 'var';

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
 * 计算历史最大回撤（Max Drawdown 标量）。
 */
export function computeMaxDrawdown(navSeries: readonly number[]): number {
  return computeDrawdownSeries(navSeries).maxDrawdown;
}

/**
 * 基于 Rust nodejs-polars 统计矩计算年化夏普比率（Annualized Sharpe Ratio）。
 */
export function computeSharpeRatio(
  dailyReturns: readonly number[],
  options?: SharpeRatioOptions,
): number {
  const len = dailyReturns.length;
  if (len < 2) return 0;

  const annualRiskFreeRate =
    options?.annualRiskFreeRate ?? DEFAULT_ANNUAL_RISK_FREE_RATE;
  const tradingDaysPerYear =
    options?.tradingDaysPerYear ?? DEFAULT_TRADING_DAYS_PER_YEAR;

  const dailyRf = annualRiskFreeRate / tradingDaysPerYear;

  const s = pl.Series(COL_RET, dailyReturns as any).cast(pl.Float64);
  const df = pl.DataFrame({ [COL_RET]: s });

  const agg = df.select(
    pl.col(COL_RET).mean().alias(COL_MEAN),
    pl.col(COL_RET).std().alias(COL_STD),
  );

  const mean = (agg.getColumn(COL_MEAN).get(0) as number) ?? 0;
  const std = (agg.getColumn(COL_STD).get(0) as number) ?? 0;

  if (std <= 0 || Number.isNaN(std)) return 0;

  const sharpe = ((mean - dailyRf) / std) * Math.sqrt(tradingDaysPerYear);
  return Math.round(sharpe * RATIO_ROUNDING_SCALE) / RATIO_ROUNDING_SCALE;
}

/**
 * 计算卡玛比率（Calmar Ratio = 年化收益率 / 最大回撤）。
 */
export function computeCalmarRatio(
  annualizedReturn: number,
  maxDrawdown: number,
): number {
  const safeDrawdown = Math.max(maxDrawdown, 0);
  if (safeDrawdown < CALMAR_MIN_DRAWDOWN_EPSILON) {
    return annualizedReturn > 0 ? MAX_CALMAR_RATIO_CAP : 0;
  }

  const calmar = annualizedReturn / safeDrawdown;
  const clamped = Math.max(
    -MAX_CALMAR_RATIO_CAP,
    Math.min(MAX_CALMAR_RATIO_CAP, calmar),
  );
  return Math.round(clamped * RATIO_ROUNDING_SCALE) / RATIO_ROUNDING_SCALE;
}

/**
 * 汇总计算常规量化回测绩效指标。
 */
export function computePerformanceSummary(
  navSeries: readonly number[],
  closedTrades: readonly ClosedTradeInput[],
  options?: PerformanceSummaryOptions,
): PerformanceSummaryResult {
  const len = navSeries.length;
  if (len === 0) {
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

  const initialNav =
    options?.initialCash && options.initialCash > 0
      ? options.initialCash
      : navSeries[0];
  const finalNav = navSeries[len - 1];

  const totalReturn = initialNav > 0 ? (finalNav - initialNav) / initialNav : 0;

  const tradingDaysPerYear =
    options?.tradingDaysPerYear ?? DEFAULT_TRADING_DAYS_PER_YEAR;

  let annualizedReturn = 0;
  if (len > 1 && totalReturn > -1.0) {
    const years = (len - 1) / tradingDaysPerYear;
    if (years > 0) {
      annualizedReturn = Math.pow(1.0 + totalReturn, 1.0 / years) - 1.0;
    }
  }

  const { returns: dailyReturns } = computeDailyReturns(navSeries);
  const maxDrawdown = computeMaxDrawdown(navSeries);
  const sharpeRatio = computeSharpeRatio(dailyReturns, options);
  const calmarRatio = computeCalmarRatio(annualizedReturn, maxDrawdown);

  let winRate = 0;
  let profitLossRatio = 0;
  const tradeCount = closedTrades.length;

  if (tradeCount > 0) {
    const pnlSeries = pl
      .Series(
        COL_PNL,
        closedTrades.map((t) => t.realizedPnl),
      )
      .cast(pl.Float64);
    const tradeDf = pl.DataFrame({ [COL_PNL]: pnlSeries });

    const winTradesExpr = pl.col(COL_PNL).filter(pl.col(COL_PNL).gt(0)).count();
    const winSumExpr = pl.col(COL_PNL).filter(pl.col(COL_PNL).gt(0)).sum();
    const lossSumExpr = pl.col(COL_PNL).filter(pl.col(COL_PNL).lt(0)).sum();

    const stats = tradeDf.select(
      winTradesExpr.alias(COL_WIN_COUNT),
      winSumExpr.alias(COL_WIN_TOTAL),
      lossSumExpr.alias(COL_LOSS_TOTAL),
    );

    const winCount = (stats.getColumn(COL_WIN_COUNT).get(0) as number) ?? 0;
    const winTotal = (stats.getColumn(COL_WIN_TOTAL).get(0) as number) ?? 0;
    const lossTotal = (stats.getColumn(COL_LOSS_TOTAL).get(0) as number) ?? 0;

    winRate =
      Math.round((winCount / tradeCount) * RATIO_ROUNDING_SCALE) /
      RATIO_ROUNDING_SCALE;

    const absLoss = Math.abs(lossTotal);
    if (absLoss > 0) {
      const plRatio = winTotal / absLoss;
      profitLossRatio =
        Math.round(
          Math.min(MAX_PROFIT_LOSS_RATIO_CAP, plRatio) * RATIO_ROUNDING_SCALE,
        ) / RATIO_ROUNDING_SCALE;
    } else {
      profitLossRatio = winTotal > 0 ? MAX_PROFIT_LOSS_RATIO_CAP : 0;
    }
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
    winRate,
    profitLossRatio,
    tradeCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 极端事件压力与防过拟合风险算子 (Stress Testing & Tail Risk Metrics)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 基于 Rust nodejs-polars 向量化计算日度历史在险价值 (Value at Risk, VaR)。
 * 返回负数或 0（表示损失比例，例如 -0.035 代表 3.5% 损失）。
 *
 * @param dailyReturns 日度收益率时序
 * @param confidence 置信度，默认 0.95 (支持 0.90 ~ 0.999)
 */
export function computeValueAtRisk(
  dailyReturns: readonly number[],
  confidence: number = DEFAULT_VAR_CONFIDENCE,
): number {
  if (confidence <= 0 || confidence >= 1) {
    throw new IndicatorInputError(
      `confidence must be in (0, 1), got ${confidence}`,
    );
  }
  const len = dailyReturns.length;
  if (len === 0) return 0;

  const s = pl.Series(COL_RET, dailyReturns as any).cast(pl.Float64);
  const df = pl.DataFrame({ [COL_RET]: s });

  const q = 1 - confidence;
  const quantileRes = df.select(pl.col(COL_RET).quantile(q).alias(COL_VAR));
  const varValue = (quantileRes.getColumn(COL_VAR).get(0) as number) ?? 0;

  // 在险价值通常表达为损失下限分位数，若分位数为正（极佳单边市场），损失下限为 0
  const lossVaR = Math.min(0, varValue);
  return Math.round(lossVaR * RATIO_ROUNDING_SCALE) / RATIO_ROUNDING_SCALE;
}

/**
 * 计算条件在险价值 (Conditional VaR / Expected Shortfall, CVaR)。
 * 衡量低于或等于 VaR 阈值情况下的期望极端损失。
 */
export function computeConditionalVaR(
  dailyReturns: readonly number[],
  confidence: number = DEFAULT_VAR_CONFIDENCE,
): number {
  const len = dailyReturns.length;
  if (len === 0) return 0;

  const varThreshold = computeValueAtRisk(dailyReturns, confidence);
  if (varThreshold >= 0) return 0;

  const s = pl.Series(COL_RET, dailyReturns as any).cast(pl.Float64);
  const df = pl.DataFrame({ [COL_RET]: s });

  const cvarRes = df
    .filter(pl.col(COL_RET).ltEq(varThreshold))
    .select(pl.col(COL_RET).mean().alias(COL_CVAR));

  const cvarValue = (cvarRes.getColumn(COL_CVAR).get(0) as number) ?? 0;
  return (
    Math.round(Math.min(0, cvarValue) * RATIO_ROUNDING_SCALE) /
    RATIO_ROUNDING_SCALE
  );
}

/**
 * 计算策略处于历史回撤状态的最长连续交易日数 (Underwater Duration)。
 * 严格使用 Rust Polars cumMax + cumSum + groupBy 向量化统计连续回撤游程长度，严禁 JS 命令式循环。
 */
export function computeUnderwaterDuration(
  navSeries: readonly number[],
): number {
  const len = navSeries.length;
  if (len <= 1) return 0;

  const s = pl.Series(COL_NAV, navSeries as any).cast(pl.Float64);
  const df = pl.DataFrame({ [COL_NAV]: s });

  const peakExpr = pl.col(COL_NAV).cumMax();
  // is_underwater: 净值严格小于历史峰值
  const isUnderwaterExpr = pl.col(COL_NAV).lt(peakExpr);

  const annotatedDf = df.select(isUnderwaterExpr.alias(COL_IS_UNDERWATER));

  // shift(1) 对齐判断跳变点，使用 cumSum 向量化分配连续状态游程分组 ID
  const prevExpr = pl.col(COL_IS_UNDERWATER).shift(1).fillNull(pl.lit(false));
  const changeExpr = pl.col(COL_IS_UNDERWATER).neq(prevExpr);
  const runGroupExpr = changeExpr.cumSum().alias(COL_RUN_GROUP);

  const groupedDf = annotatedDf.withColumns(runGroupExpr);

  // 过滤出处于 underwater 状态的分组，统计各分组条目计数，取最大值
  const underwaterRuns = groupedDf
    .filter(pl.col(COL_IS_UNDERWATER).eq(true))
    .groupBy(COL_RUN_GROUP)
    .agg(pl.col(COL_IS_UNDERWATER).count().alias(COL_RUN_LEN));

  if (underwaterRuns.height === 0) {
    return 0;
  }

  const maxLenRes = underwaterRuns.select(
    pl.col(COL_RUN_LEN).max().alias(COL_MAX_LEN),
  );
  return (maxLenRes.getColumn(COL_MAX_LEN).get(0) as number) ?? 0;
}

/**
 * 计算挂单因跌停或流动性枯竭处于 BLOCKED 状态顺延执行而带来的额外滑点惩罚总额。
 */
export function computeLiquidityDelayPenalty(
  trades: readonly LiquidityDelayTradeInput[],
): number {
  if (trades.length === 0) return 0;

  const delayedTrades = trades.filter((t) => t.isBlockedDelayed === true);
  if (delayedTrades.length === 0) return 0;

  const s = pl
    .Series(
      COL_SLIPPAGE,
      delayedTrades.map((t) => Math.max(0, t.slippageLoss ?? 0)),
    )
    .cast(pl.Float64);
  const df = pl.DataFrame({ [COL_SLIPPAGE]: s });

  const totalLoss =
    (df
      .select(pl.col(COL_SLIPPAGE).sum().alias(COL_TOTAL))
      .getColumn(COL_TOTAL)
      .get(0) as number) ?? 0;

  return Math.round(totalLoss * 100) / 100;
}

/**
 * 计算样本外夏普衰减比率 (Overfitting Ratio = OOS Sharpe / IS Sharpe)。
 * 大于等于 1.0 表明样本外表现稳定；衰减低于 0.5 提示过拟合风险。
 */
export function computeOverfittingRatio(
  trainSharpe: number,
  testSharpe: number,
): number {
  if (
    trainSharpe <= 0 ||
    Number.isNaN(trainSharpe) ||
    !Number.isFinite(trainSharpe)
  ) {
    return 0;
  }
  if (testSharpe <= 0 || Number.isNaN(testSharpe)) {
    return 0;
  }

  const ratio = testSharpe / trainSharpe;
  const clamped = Math.min(MAX_OVERFITTING_RATIO_CAP, Math.max(0, ratio));
  return Math.round(clamped * RATIO_ROUNDING_SCALE) / RATIO_ROUNDING_SCALE;
}

/**
 * 汇总计算常规绩效与极端压力风险全景指标报告（一条龙输出）。
 */
export function computeComprehensiveRiskPerformance(
  navSeries: readonly number[],
  closedTrades: readonly ClosedTradeInput[],
  options?: PerformanceSummaryOptions,
): ComprehensiveRiskPerformanceResult {
  const summary = computePerformanceSummary(navSeries, closedTrades, options);
  const { returns } = computeDailyReturns(navSeries);

  const var95 = computeValueAtRisk(returns, 0.95);
  const var99 = computeValueAtRisk(returns, 0.99);
  const cvar95 = computeConditionalVaR(returns, 0.95);
  const cvar99 = computeConditionalVaR(returns, 0.99);
  const maxUnderwaterDuration = computeUnderwaterDuration(navSeries);
  const totalLiquidityDelayPenalty = computeLiquidityDelayPenalty(closedTrades);

  return {
    ...summary,
    var95,
    var99,
    cvar95,
    cvar99,
    maxUnderwaterDuration,
    totalLiquidityDelayPenalty,
  };
}
