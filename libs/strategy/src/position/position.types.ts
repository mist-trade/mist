import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '../kernel/kernel.types';
import { EXIT_ACTIONS, POSITION_STATUSES } from '../strategy.constants';

export type PositionStatus =
  (typeof POSITION_STATUSES)[keyof typeof POSITION_STATUSES];
export type ExitAction = (typeof EXIT_ACTIONS)[keyof typeof EXIT_ACTIONS];

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
}

export interface ExitDecision {
  readonly action: ExitAction;
  readonly reason: string;
}

/**
 * 统一出场与风控插件抽象端口，与决策树插件标准同构，供私有仓扩展
 */
export interface ExitPolicyPort {
  readonly id: string;
  evaluate(
    bar: StrategyBar,
    position: Readonly<PositionSnapshot>,
  ): ExitDecision;
  onSignal?(
    signal: KernelSignal,
    position: Readonly<PositionSnapshot>,
  ): ExitDecision;
}
