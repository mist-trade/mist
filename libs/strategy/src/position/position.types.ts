import { POSITION_STATUSES } from '../strategy.constants';

export type PositionStatus =
  (typeof POSITION_STATUSES)[keyof typeof POSITION_STATUSES];

export interface PositionSnapshot {
  readonly status: PositionStatus;
  readonly securityId: number;
  readonly securityCode: string;
  readonly holdingQuantity: number;
  readonly costPrice: number;
  readonly entryTime?: Date;
  readonly holdingBars: number;
  readonly currentPrice: number;
  readonly marketValue: number;
  readonly unrealizedPnl: number;
  readonly unrealizedPnlRatio: number;
  readonly realizedPnl: number;
}

export interface DailyNavSnapshot {
  readonly date: string;
  readonly securityCode: string;
  readonly closePrice: number;
  readonly holdingQuantity: number;
  readonly marketValue: number;
  readonly cash: number;
  readonly totalEquity: number;
  readonly dailyReturn: number;
}

export interface PositionClosedRecord {
  readonly securityId: number;
  readonly securityCode: string;
  readonly entryTime: Date;
  readonly exitTime: Date;
  readonly holdingBars: number;
  readonly entryPrice: number;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly realizedPnl: number;
  readonly returnRatio: number;
  readonly exitReason: string;
  readonly entryReason?: string;
}
