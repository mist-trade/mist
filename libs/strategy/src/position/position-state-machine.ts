/**
 * 持仓状态机（float 边界接口，整数厘内部算术）。
 *
 * 组 1b 移植（REQ-ENGINE-07）：纯记账员定位——数量 / 成本 / 已实现盈亏
 * 记账与平仓股数计算，内部整数厘运算；平仓决策权 100% 归交易层规则管线
 * （TradingEngine），本类不产生任何订单（组5/任务5.3 已根除 onSignal 旁路）。
 *
 * rehydrate（REQ-LEDGER-01）：`fromFillEvents` 由 fill 事件流 fold 重建持仓。
 */
import { TRADING_RULES } from '@app/constants';
import type { StrategyBar } from '@app/market-data';
import type {
  CreateOrderDto,
  OrderFilledEvent,
} from '../execution/execution.types';

import { liToYuan, yuanToLi, type Li } from '../trading/money';
import {
  ORDER_SIDES,
  POSITION_DECIMAL_PLACES,
  POSITION_EXIT_REASONS,
  POSITION_STATUSES,
} from '../strategy.constants';
import type {
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
  private costPriceLi: Li = 0n;
  private entryTime?: Date;
  private holdingBars = 0;
  private currentPriceLi: Li = 0n;
  private realizedPnlLi: Li = 0n;
  private accumulatedBuyFeesLi: Li = 0n;
  private readonly exitRatio: number;
  private readonly closedTrades: PositionClosedRecord[] = [];
  private entryReason?: string;

  constructor(
    securityId: number,
    securityCode: string,
    options?: PositionStateMachineOptions,
  ) {
    this.securityId = securityId;
    this.securityCode = securityCode;
    this.exitRatio = options?.exitRatio ?? 1.0;

    if (this.exitRatio <= 0 || this.exitRatio > 1.0) {
      throw new Error(
        `exitRatio must be in range (0, 1.0], got ${this.exitRatio}`,
      );
    }
  }

  /** 事件流重建（REQ-LEDGER-01）：依序 fold fill 事件。 */
  static fromFillEvents(
    securityId: number,
    securityCode: string,
    events: readonly OrderFilledEvent[],
    options?: PositionStateMachineOptions,
  ): PositionStateMachine {
    const machine = new PositionStateMachine(securityId, securityCode, options);
    for (const event of events) {
      machine.onOrderFilled(event);
    }
    return machine;
  }

  onOrderFilled(event: OrderFilledEvent): void {
    if (event.side === ORDER_SIDES.BUY) {
      if (
        this.status === POSITION_STATUSES.EMPTY ||
        this.status === POSITION_STATUSES.CLOSED
      ) {
        this.entryReason = event.entryReason;
        this.holdingBars = 0;
      }
      this.entryTime = event.fillTime;
      this.status = POSITION_STATUSES.HOLDING;

      const prevCostTotalLi = BigInt(this.holdingQuantity) * this.costPriceLi;
      const turnoverLi = yuanToLi(event.turnover);
      this.holdingQuantity += event.filledQuantity;
      this.costPriceLi =
        this.holdingQuantity > 0
          ? (prevCostTotalLi + turnoverLi) / BigInt(this.holdingQuantity)
          : 0n;

      this.accumulatedBuyFeesLi += yuanToLi(event.fees.totalFees);
      this.currentPriceLi = yuanToLi(event.fillPrice);
    } else if (event.side === ORDER_SIDES.SELL) {
      if (this.holdingQuantity <= 0) return;

      const fillQty = Math.min(this.holdingQuantity, event.filledQuantity);
      const costBasisLi = this.costPriceLi * BigInt(fillQty);
      const allocatedBuyFeesLi =
        this.holdingQuantity > 0
          ? (this.accumulatedBuyFeesLi * BigInt(fillQty)) /
            BigInt(this.holdingQuantity)
          : 0n;
      const netProceedsLi =
        yuanToLi(event.turnover) - yuanToLi(event.fees.totalFees);
      const tradePnlLi = netProceedsLi - costBasisLi - allocatedBuyFeesLi;

      this.realizedPnlLi += tradePnlLi;
      this.accumulatedBuyFeesLi -= allocatedBuyFeesLi;
      if (this.accumulatedBuyFeesLi < 0n) this.accumulatedBuyFeesLi = 0n;

      const costBasis = liToYuan(costBasisLi);
      const returnRatio =
        costBasis > 0
          ? Math.round(
              (liToYuan(tradePnlLi) / costBasis) *
                POSITION_DECIMAL_PLACES.RATIO_SCALE,
            ) / POSITION_DECIMAL_PLACES.RATIO_SCALE
          : 0;

      this.closedTrades.push({
        securityId: this.securityId,
        securityCode: this.securityCode,
        entryTime: this.entryTime ?? event.fillTime,
        exitTime: event.fillTime,
        holdingBars: this.holdingBars,
        entryPrice: liToYuan(this.costPriceLi),
        exitPrice: event.fillPrice,
        quantity: fillQty,
        realizedPnl: liToYuan(tradePnlLi),
        returnRatio,
        entryReason: this.entryReason ?? 'BUY_SIGNAL',
        exitReason: event.exitReason ?? POSITION_EXIT_REASONS.SIGNAL_EXIT,
      });

      this.holdingQuantity -= fillQty;
      if (this.holdingQuantity <= 0) {
        this.status = POSITION_STATUSES.CLOSED;
        this.holdingQuantity = 0;
        this.costPriceLi = 0n;
        this.accumulatedBuyFeesLi = 0n;
        this.entryTime = undefined;
        this.entryReason = undefined;
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
    this.currentPriceLi = yuanToLi(bar.close);

    // 纯记账员定位：严禁在 onBar 内私自生成平仓订单，平仓决策权 100% 移交上层交易层规则管线
    return null;
  }

  getSnapshot(): PositionSnapshot {
    const marketValue =
      Math.round(this.holdingQuantity * liToYuan(this.currentPriceLi) * 100) /
      100;
    const costBasis =
      Math.round(this.holdingQuantity * liToYuan(this.costPriceLi) * 100) / 100;
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
      costPrice: liToYuan(this.costPriceLi),
      entryTime: this.entryTime,
      holdingBars: this.holdingBars,
      currentPrice: liToYuan(this.currentPriceLi),
      marketValue,
      unrealizedPnl,
      unrealizedPnlRatio,
      realizedPnl: liToYuan(this.realizedPnlLi),
    };
  }

  getClosedTrades(): readonly PositionClosedRecord[] {
    return this.closedTrades;
  }

  getStatus(): PositionStatus {
    return this.status;
  }

  getExitRatio(): number {
    return this.exitRatio;
  }
}
