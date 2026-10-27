export interface DailyReturnsSeriesResult {
  readonly begIndex: number;
  readonly returns: number[];
}

export interface SharpeRatioOptions {
  /** 年化无风险收益率，默认 0.02 (2.0%) */
  readonly annualRiskFreeRate?: number;
  /** 一年的基准交易日数量，A 股通常为 250 天 */
  readonly tradingDaysPerYear?: number;
}

/** 多品种等权组合夏普的输入序列（调用方保证已按同一日期轴对齐、缺失日 0 填充） */
export interface PortfolioSharpeInput {
  readonly securityCode: string;
  readonly returns: readonly number[];
}

export interface DrawdownSeriesResult {
  readonly maxDrawdown: number;
  readonly peakSeries: number[];
  readonly drawdownSeries: number[];
}

export interface LiquidityDelayTradeInput {
  readonly isBlockedDelayed?: boolean;
  readonly slippageLoss?: number;
  readonly realizedPnl?: number;
  readonly returnRatio?: number;
}

export interface ClosedTradeInput extends LiquidityDelayTradeInput {
  readonly realizedPnl: number;
  readonly returnRatio: number;
}

export interface PerformanceSummaryOptions extends SharpeRatioOptions {
  readonly initialCash?: number;
}

export interface PerformanceSummaryResult {
  readonly totalReturn: number;
  readonly annualizedReturn: number;
  readonly maxDrawdown: number;
  readonly sharpeRatio: number;
  readonly calmarRatio: number;
  readonly winRate: number;
  readonly profitLossRatio: number;
  readonly tradeCount: number;
}

export interface ComprehensiveRiskPerformanceResult
  extends PerformanceSummaryResult {
  /** 95% 置信度日度在险价值 (VaR) */
  readonly var95: number;
  /** 99% 置信度日度在险价值 (VaR) */
  readonly var99: number;
  /** 95% 置信度超额期望损失 (CVaR) */
  readonly cvar95: number;
  /** 99% 置信度超额期望损失 (CVaR) */
  readonly cvar99: number;
  /** 最长连续回撤潜伏期交易日数 */
  readonly maxUnderwaterDuration: number;
  /** 一字跌停顺延导致的额外滑点亏损总额 */
  readonly totalLiquidityDelayPenalty: number;
}
