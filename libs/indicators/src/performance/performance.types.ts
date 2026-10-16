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

export interface DrawdownSeriesResult {
  readonly maxDrawdown: number;
  readonly peakSeries: number[];
  readonly drawdownSeries: number[];
}

export interface ClosedTradeInput {
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
