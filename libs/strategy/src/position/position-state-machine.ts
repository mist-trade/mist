import { TRADING_RULES } from '@app/constants';
import type { StrategyBar } from '@app/market-data';
import { formatShanghaiDateString } from '@app/timezone';
import type {
  CreateOrderDto,
  OrderFilledEvent,
} from '../execution/execution.types';

import type { KernelSignal } from '../kernel/kernel.types';
import {
  DEFAULT_BROKER_INITIAL_CASH,
  EXIT_ACTIONS,
  ORDER_SIDES,
  ORDER_TYPES,
  POSITION_DECIMAL_PLACES,
  POSITION_EXIT_REASONS,
  POSITION_STATUSES,
  SIGNAL_KINDS,
} from '../strategy.constants';
import type {
  DailyNavSnapshot,
  ExitPolicyPort,
  PositionClosedRecord,
  PositionSnapshot,
  PositionStateMachineOptions,
  PositionStatus,
} from './position.types';

export class PositionStateMachine {
  private readonly securityId: number;
  private readonly securityCode: string;
  private status: PositionStatus = POSITION_STATUSES.EMPTY;
  private holdingQuantity = 0;
  private costPrice = 0;
  private entryTime?: Date;
  private holdingBars = 0;
  private currentPrice = 0;
  private realizedPnl = 0;
  private accumulatedBuyFees = 0;
  private cash: number;
  private readonly exitPolicy?: ExitPolicyPort;
  private readonly exitRatio: number;
  private readonly navHistory: DailyNavSnapshot[] = [];
  private readonly closedTrades: PositionClosedRecord[] = [];

  constructor(
    securityId: number,
    securityCode: string,
    initialCashOrOptions?: number | PositionStateMachineOptions,
    exitPolicy?: ExitPolicyPort,
    exitRatio = 1.0,
  ) {
    this.securityId = securityId;
    this.securityCode = securityCode;

    if (
      typeof initialCashOrOptions === 'object' &&
      initialCashOrOptions !== null
    ) {
      this.cash =
        initialCashOrOptions.initialCash ?? DEFAULT_BROKER_INITIAL_CASH;
      this.exitPolicy = initialCashOrOptions.exitPolicy;
      this.exitRatio = initialCashOrOptions.exitRatio ?? 1.0;
    } else {
      this.cash = initialCashOrOptions ?? DEFAULT_BROKER_INITIAL_CASH;
      this.exitPolicy = exitPolicy;
      this.exitRatio = exitRatio;
    }

    if (this.exitRatio <= 0 || this.exitRatio > 1.0) {
      throw new Error(
        `exitRatio must be in range (0, 1.0], got ${this.exitRatio}`,
      );
    }
  }

  onOrderFilled(event: OrderFilledEvent): void {
    if (event.side === ORDER_SIDES.BUY) {
      if (this.status === POSITION_STATUSES.EMPTY) {
        this.entryTime = event.fillTime;
        this.holdingBars = 0;
      }
      this.status = POSITION_STATUSES.HOLDING;

      const prevCostTotal = this.holdingQuantity * this.costPrice;
      this.holdingQuantity += event.filledQuantity;
      this.costPrice =
        this.holdingQuantity > 0
          ? Math.round(
              ((prevCostTotal + event.turnover) / this.holdingQuantity) * 100,
            ) / 100
          : 0;

      this.accumulatedBuyFees += event.fees.totalFees;
      this.cash = Math.round((this.cash + event.netAmount) * 100) / 100;
      this.currentPrice = event.fillPrice;
    } else if (event.side === ORDER_SIDES.SELL) {
      if (this.holdingQuantity <= 0) return;

      const fillQty = Math.min(this.holdingQuantity, event.filledQuantity);
      const costBasis = Math.round(fillQty * this.costPrice * 100) / 100;
      const allocatedBuyFees =
        this.holdingQuantity > 0
          ? Math.round(
              (fillQty / this.holdingQuantity) * this.accumulatedBuyFees * 100,
            ) / 100
          : 0;
      const netProceeds = event.turnover - event.fees.totalFees;
      const tradePnl =
        Math.round((netProceeds - costBasis - allocatedBuyFees) * 100) / 100;

      this.realizedPnl = Math.round((this.realizedPnl + tradePnl) * 100) / 100;
      this.cash = Math.round((this.cash + event.netAmount) * 100) / 100;
      this.accumulatedBuyFees = Math.max(
        0,
        this.accumulatedBuyFees - allocatedBuyFees,
      );

      const returnRatio =
        costBasis > 0
          ? Math.round(
              (tradePnl / costBasis) * POSITION_DECIMAL_PLACES.RATIO_SCALE,
            ) / POSITION_DECIMAL_PLACES.RATIO_SCALE
          : 0;

      this.closedTrades.push({
        securityId: this.securityId,
        securityCode: this.securityCode,
        entryTime: this.entryTime ?? event.fillTime,
        exitTime: event.fillTime,
        holdingBars: this.holdingBars,
        entryPrice: this.costPrice,
        exitPrice: event.fillPrice,
        quantity: fillQty,
        realizedPnl: tradePnl,
        returnRatio,
        exitReason: POSITION_EXIT_REASONS.SIGNAL_EXIT,
      });

      this.holdingQuantity -= fillQty;
      if (this.holdingQuantity <= 0) {
        this.status = POSITION_STATUSES.CLOSED;
        this.holdingQuantity = 0;
        this.costPrice = 0;
        this.accumulatedBuyFees = 0;
      }
    }
  }

  /**
   * 计算平仓股数。
   * 支持通过 overrideRatio 临时覆盖平仓比例。
   * 按照 A 股规则按百股（手）向下取整；若计算结果不足一手且持有股数大于零，则平剩余最小单位。
   */
  public calculateExitQuantity(overrideRatio?: number): number {
    const ratio = overrideRatio ?? this.exitRatio;
    if (ratio >= 1.0) {
      return this.holdingQuantity;
    }
    const targetQty = Math.floor(this.holdingQuantity * ratio);
    const lotSize = TRADING_RULES.MAIN_BOARD_LOT_SIZE;
    const roundedQty = Math.floor(targetQty / lotSize) * lotSize;
    if (roundedQty <= 0) {
      return Math.min(this.holdingQuantity, lotSize);
    }
    return Math.min(this.holdingQuantity, roundedQty);
  }

  onBar(bar: StrategyBar): CreateOrderDto | null {
    if (this.status !== POSITION_STATUSES.HOLDING) {
      return null;
    }

    this.holdingBars += 1;
    this.currentPrice = bar.close;

    if (this.exitPolicy) {
      const decision = this.exitPolicy.evaluate(bar, this.getSnapshot());
      if (decision.action === EXIT_ACTIONS.EXIT) {
        return {
          securityId: this.securityId,
          securityCode: this.securityCode,
          side: ORDER_SIDES.SELL,
          orderType: ORDER_TYPES.MARKET,
          quantity: this.calculateExitQuantity(),
          signalTime: bar.timestamp,
        };
      }
    }

    return null;
  }

  onSignal(
    signal: KernelSignal,
    options?: { readonly exitRatio?: number },
  ): CreateOrderDto | null {
    if (this.status !== POSITION_STATUSES.HOLDING) {
      return null;
    }

    if (this.exitPolicy?.onSignal) {
      const decision = this.exitPolicy.onSignal(signal, this.getSnapshot());
      if (decision.action === EXIT_ACTIONS.EXIT) {
        return {
          securityId: this.securityId,
          securityCode: this.securityCode,
          side: ORDER_SIDES.SELL,
          orderType: ORDER_TYPES.MARKET,
          quantity: this.calculateExitQuantity(options?.exitRatio),
          signalTime: signal.signalTime,
        };
      }
    }

    // 主仓核心默认准则：反向卖出信号触发平仓（默认全平，支持配置 exitRatio），不设死板止损以防洗盘割肉
    if (signal.signalKind === SIGNAL_KINDS.EXIT) {
      return {
        securityId: this.securityId,
        securityCode: this.securityCode,
        side: ORDER_SIDES.SELL,
        orderType: ORDER_TYPES.MARKET,
        quantity: this.calculateExitQuantity(options?.exitRatio),
        signalTime: signal.signalTime,
      };
    }

    return null;
  }

  onDayClose(bar: StrategyBar): DailyNavSnapshot {
    this.currentPrice = bar.close;
    const marketValue =
      Math.round(this.holdingQuantity * bar.close * 100) / 100;
    const totalEquity = Math.round((this.cash + marketValue) * 100) / 100;

    const prevEquity =
      this.navHistory.length > 0
        ? this.navHistory[this.navHistory.length - 1].totalEquity
        : totalEquity;

    const dailyReturn =
      prevEquity > 0
        ? Math.round(
            ((totalEquity - prevEquity) / prevEquity) *
              POSITION_DECIMAL_PLACES.RATIO_SCALE,
          ) / POSITION_DECIMAL_PLACES.RATIO_SCALE
        : 0;

    const date = formatShanghaiDateString(bar.timestamp);
    const snapshot: DailyNavSnapshot = {
      date,
      securityCode: this.securityCode,
      closePrice: bar.close,
      holdingQuantity: this.holdingQuantity,
      marketValue,
      cash: this.cash,
      totalEquity,
      dailyReturn,
    };

    this.navHistory.push(snapshot);
    return snapshot;
  }

  getSnapshot(): PositionSnapshot {
    const marketValue =
      Math.round(this.holdingQuantity * this.currentPrice * 100) / 100;
    const costBasis =
      Math.round(this.holdingQuantity * this.costPrice * 100) / 100;
    const unrealizedPnl =
      this.holdingQuantity > 0
        ? Math.round((marketValue - costBasis) * 100) / 100
        : 0;
    const unrealizedPnlRatio =
      costBasis > 0
        ? Math.round(
            (unrealizedPnl / costBasis) * POSITION_DECIMAL_PLACES.RATIO_SCALE,
          ) / POSITION_DECIMAL_PLACES.RATIO_SCALE
        : 0;

    return {
      status: this.status,
      securityId: this.securityId,
      securityCode: this.securityCode,
      holdingQuantity: this.holdingQuantity,
      costPrice: this.costPrice,
      entryTime: this.entryTime,
      holdingBars: this.holdingBars,
      currentPrice: this.currentPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPnlRatio,
      realizedPnl: this.realizedPnl,
    };
  }

  getNavHistory(): readonly DailyNavSnapshot[] {
    return this.navHistory;
  }

  getClosedTrades(): readonly PositionClosedRecord[] {
    return this.closedTrades;
  }

  getCash(): number {
    return this.cash;
  }

  getStatus(): PositionStatus {
    return this.status;
  }

  getExitRatio(): number {
    return this.exitRatio;
  }
}
