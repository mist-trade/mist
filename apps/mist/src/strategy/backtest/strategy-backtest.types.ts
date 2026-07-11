import {
  BacktestOrderSide,
  BacktestOrderStatus,
  BacktestTradeStatus,
  DataSource,
  Period,
  StrategySignalKind,
} from '@app/shared-data';

export type StrategyBacktestBar = {
  securityCode: string;
  securityType: string;
  source: DataSource;
  period: Period;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
};

export type StrategyBacktestConfig = {
  initialCash: number;
  maxPositions: number;
  slippageBps: number;
  commissionRate: number;
  minCommission: number;
  stampDutyRate: number;
  transferFeeRate: number;
  benchmarkCode: string;
};

export type StrategyBacktestInput = {
  strategyDefinitionId: number;
  strategyVersionId: number;
  entryRule: Record<string, unknown>;
  exitRule: Record<string, unknown> | null;
  lookbackBars: number;
  startDate: Date;
  endDate: Date;
  bars: StrategyBacktestBar[];
  benchmarkBars: StrategyBacktestBar[];
  config: StrategyBacktestConfig;
};

export type StrategyBacktestSignal = {
  signalIndex: number;
  securityCode: string;
  signalKind: StrategySignalKind;
  signalTime: Date;
  contextSnapshot: Record<string, unknown>;
  ruleSnapshot: Record<string, unknown>;
};

export type StrategyBacktestOrder = {
  orderIndex: number;
  signalIndex: number;
  securityCode: string;
  side: BacktestOrderSide;
  status: BacktestOrderStatus;
  reason: string | null;
  scheduledTime: Date;
  executionTime: Date | null;
  expiredAt: Date | null;
  quantity: number;
  fillPrice: number | null;
  grossAmount: number | null;
  commission: number;
  stampDuty: number;
  transferFee: number;
  totalFee: number;
};

export type StrategyBacktestTrade = {
  tradeIndex: number;
  securityCode: string;
  status: BacktestTradeStatus;
  entryOrderIndex: number;
  exitOrderIndex: number | null;
  entryTime: Date;
  exitTime: Date | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryFee: number;
  exitFee: number;
  realizedPnl: number | null;
  holdingDays: number | null;
};

export type StrategyBacktestEquityPoint = {
  pointTime: Date;
  cash: number;
  marketValue: number;
  equity: number;
  benchmarkValue: number | null;
  drawdown: number;
  exposure: number;
};

export type StrategyBacktestMetrics = {
  totalReturn: number | null;
  annualizedReturn: number | null;
  annualizedVolatility: number | null;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  maxDrawdownDuration: number | null;
  calmarRatio: number | null;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  winRate: number | null;
  profitFactor: number | null;
  tradeCount: number;
  averageHoldingDays: number | null;
  turnover: number | null;
  averageExposure: number | null;
};

export type StrategyBacktestOutput = {
  signals: StrategyBacktestSignal[];
  orders: StrategyBacktestOrder[];
  trades: StrategyBacktestTrade[];
  equityPoints: StrategyBacktestEquityPoint[];
  metrics: StrategyBacktestMetrics;
};
