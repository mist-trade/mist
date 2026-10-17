import type { StrategyBar } from '@app/market-data';
import { isOneWordLimitDown, isOneWordLimitUp } from '@app/market-data';
import { TRADING_RULES } from '@app/constants';
import { formatShanghaiDateString } from '@app/timezone';
import {
  DEFAULT_BROKER_INITIAL_CASH,
  EXECUTION_RULES,
  ORDER_REJECT_REASONS,
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
} from '../strategy.constants';

import type {
  BrokerAccountSnapshot,
  BrokerExecutionOptions,
  BrokerFeeConfig,
  CreateOrderDto,
  ExecutionBrokerPort,
  FeeDetails,
  Order,
  OrderFilledEvent,
  PositionSlot,
} from './execution.types';
import {
  applySlippage,
  calculateExecutionFees,
} from './slippage-fee-calculator';

interface MutablePositionSlot {
  totalQuantity: number;
  availableQuantity: number;
  frozenQuantity: number;
  avgCostPrice: number;
}

export class SimulatedBroker implements ExecutionBrokerPort {
  private availableCash: number;
  private readonly frozenCash = 0;
  private readonly pendingOrders = new Map<string, Order>();
  private readonly positionMap = new Map<string, MutablePositionSlot>();
  private readonly prevCloseMap = new Map<string, number>();
  private readonly lastBarDateMap = new Map<string, string>();
  private readonly lastBarCloseMap = new Map<string, number>();
  private readonly dailyPreCloseMap = new Map<string, number>();
  private readonly securityMetaMap = new Map<
    string,
    { name?: string; preClose?: number }
  >();
  private orderCounter = 0;
  private eventCounter = 0;
  private readonly slippageRatio: number;
  private readonly feeConfig?: BrokerFeeConfig;

  registerSecurity(
    securityCode: string,
    metadata: { name?: string; preClose?: number },
  ): void {
    this.securityMetaMap.set(securityCode, metadata);
    if (metadata.preClose !== undefined && metadata.preClose > 0) {
      this.dailyPreCloseMap.set(securityCode, metadata.preClose);
    }
  }

  constructor(options?: number | BrokerExecutionOptions) {
    if (typeof options === 'number') {
      this.availableCash = options;
      this.slippageRatio = EXECUTION_RULES.DEFAULT_SLIPPAGE_RATIO;
    } else {
      this.availableCash = options?.initialCash ?? DEFAULT_BROKER_INITIAL_CASH;
      this.slippageRatio =
        options?.slippageRatio ?? EXECUTION_RULES.DEFAULT_SLIPPAGE_RATIO;
      this.feeConfig = options?.feeConfig;
    }
  }

  submitOrder(dto: CreateOrderDto): Order {
    this.orderCounter += 1;
    const orderId = `ord-${Date.now()}-${this.orderCounter}`;

    if (dto.quantity <= 0) {
      return {
        orderId,
        securityId: dto.securityId,
        securityCode: dto.securityCode,
        side: dto.side,
        orderType: dto.orderType,
        quantity: dto.quantity,
        signalTime: dto.signalTime,
        limitPrice: dto.limitPrice,
        stopPrice: dto.stopPrice,
        status: ORDER_STATUSES.REJECTED,
        createdAt: new Date(),
        rejectReason: ORDER_REJECT_REASONS.CAUSALITY_VIOLATION,
      };
    }

    if (dto.side === ORDER_SIDES.BUY) {
      const isRoundLot = dto.quantity % TRADING_RULES.MAIN_BOARD_LOT_SIZE === 0;
      if (!isRoundLot) {
        return {
          orderId,
          securityId: dto.securityId,
          securityCode: dto.securityCode,
          side: dto.side,
          orderType: dto.orderType,
          quantity: dto.quantity,
          signalTime: dto.signalTime,
          limitPrice: dto.limitPrice,
          stopPrice: dto.stopPrice,
          status: ORDER_STATUSES.REJECTED,
          createdAt: new Date(),
          rejectReason: ORDER_REJECT_REASONS.INVALID_LOT_SIZE,
        };
      }
    } else {
      const pos = this.positionMap.get(dto.securityCode);
      const available = pos?.availableQuantity ?? 0;
      const frozen = pos?.frozenQuantity ?? 0;

      if (available < dto.quantity) {
        const isT1Locked = frozen >= dto.quantity;
        return {
          orderId,
          securityId: dto.securityId,
          securityCode: dto.securityCode,
          side: dto.side,
          orderType: dto.orderType,
          quantity: dto.quantity,
          signalTime: dto.signalTime,
          limitPrice: dto.limitPrice,
          stopPrice: dto.stopPrice,
          status: ORDER_STATUSES.REJECTED,
          createdAt: new Date(),
          rejectReason: isT1Locked
            ? ORDER_REJECT_REASONS.T1_LOCKED_SHARES
            : ORDER_REJECT_REASONS.INSUFFICIENT_SHARES,
        };
      }
    }

    const order: Order = {
      orderId,
      securityId: dto.securityId,
      securityCode: dto.securityCode,
      side: dto.side,
      orderType: dto.orderType,
      quantity: dto.quantity,
      signalTime: dto.signalTime,
      limitPrice: dto.limitPrice,
      stopPrice: dto.stopPrice,
      status: ORDER_STATUSES.PENDING,
      createdAt: new Date(),
      ...(dto.exitReason ? { exitReason: dto.exitReason } : {}),
    };

    this.pendingOrders.set(orderId, order);
    return order;
  }

  cancelOrder(orderId: string): boolean {
    const order = this.pendingOrders.get(orderId);
    if (!order) return false;
    if (
      order.status === ORDER_STATUSES.PENDING ||
      order.status === ORDER_STATUSES.BLOCKED
    ) {
      this.pendingOrders.delete(orderId);
      return true;
    }
    return false;
  }

  onBar(bar: StrategyBar): readonly OrderFilledEvent[] {
    const fills: OrderFilledEvent[] = [];
    const secCode = bar.securityCode ?? '';
    const currentDateStr = formatShanghaiDateString(bar.timestamp);
    const lastDateStr = this.lastBarDateMap.get(secCode);

    if (lastDateStr !== undefined && lastDateStr !== currentDateStr) {
      const prevDayFinalClose = this.lastBarCloseMap.get(secCode);
      if (prevDayFinalClose !== undefined) {
        this.dailyPreCloseMap.set(secCode, prevDayFinalClose);
      }
    }
    this.lastBarDateMap.set(secCode, currentDateStr);

    const meta = this.securityMetaMap.get(secCode);
    const securityName = meta?.name;

    if (!this.dailyPreCloseMap.has(secCode)) {
      this.dailyPreCloseMap.set(secCode, meta?.preClose ?? bar.open);
    }
    const prevClose = this.dailyPreCloseMap.get(secCode) ?? bar.open;

    // 阶段 1：盘中触价止损单优先处理 (STOP 订单)
    for (const [orderId, order] of this.pendingOrders.entries()) {
      if (
        order.securityCode === secCode &&
        order.orderType === ORDER_TYPES.STOP &&
        order.stopPrice !== undefined &&
        bar.timestamp.getTime() > order.signalTime.getTime()
      ) {
        if (bar.open <= order.stopPrice) {
          // 跳空低开跌破止损价：以开盘价扣滑点成交
          const fillPrice = applySlippage(bar.open, ORDER_SIDES.SELL);
          const fill = this.executeFill(order, fillPrice, bar.timestamp);
          if (fill) {
            fills.push(fill);
            this.pendingOrders.delete(orderId);
          }
        } else if (bar.low <= order.stopPrice) {
          // 盘中下探刺破止损价：以止损价扣滑点成交
          const fillPrice = applySlippage(order.stopPrice, ORDER_SIDES.SELL);
          const fill = this.executeFill(order, fillPrice, bar.timestamp);
          if (fill) {
            fills.push(fill);
            this.pendingOrders.delete(orderId);
          }
        }
      }
    }

    // 阶段 2：Next-Bar Open 订单撮合 (MARKET 与 LIMIT 订单)
    for (const [orderId, order] of this.pendingOrders.entries()) {
      if (
        order.securityCode === secCode &&
        order.orderType !== ORDER_TYPES.STOP &&
        (order.status === ORDER_STATUSES.PENDING ||
          order.status === ORDER_STATUSES.BLOCKED)
      ) {
        // 因果律断言：必须满足 t_bar > t_signal
        if (bar.timestamp.getTime() <= order.signalTime.getTime()) {
          continue;
        }

        if (order.side === ORDER_SIDES.BUY) {
          if (isOneWordLimitUp(bar, prevClose, securityName)) {
            // 一字涨停无法买入，直接拒单
            this.pendingOrders.set(orderId, {
              ...order,
              status: ORDER_STATUSES.REJECTED,
              rejectReason: ORDER_REJECT_REASONS.BUY_REJECTED_LIMIT_UP,
            });
            this.pendingOrders.delete(orderId);
            continue;
          }

          if (
            order.orderType === ORDER_TYPES.LIMIT &&
            order.limitPrice !== undefined &&
            bar.open > order.limitPrice
          ) {
            // 限价买单高于开盘价暂不成交
            continue;
          }

          const basePrice =
            order.orderType === ORDER_TYPES.LIMIT &&
            order.limitPrice !== undefined
              ? Math.min(bar.open, order.limitPrice)
              : bar.open;
          const fillPrice = applySlippage(
            basePrice,
            ORDER_SIDES.BUY,
            this.slippageRatio,
          );
          const fill = this.executeFill(order, fillPrice, bar.timestamp);
          if (fill) {
            fills.push(fill);
            this.pendingOrders.delete(orderId);
          }
        } else if (order.side === ORDER_SIDES.SELL) {
          if (isOneWordLimitDown(bar, prevClose, securityName)) {
            // 一字跌停无法卖出，挂起顺延至下一周期
            this.pendingOrders.set(orderId, {
              ...order,
              status: ORDER_STATUSES.BLOCKED,
              rejectReason: ORDER_REJECT_REASONS.SELL_BLOCKED_LIMIT_DOWN,
            });
            continue;
          }

          const fillPrice = applySlippage(
            bar.open,
            ORDER_SIDES.SELL,
            this.slippageRatio,
          );
          const fill = this.executeFill(order, fillPrice, bar.timestamp);
          if (fill) {
            fills.push(fill);
            this.pendingOrders.delete(orderId);
          }
        }
      }
    }

    this.lastBarCloseMap.set(secCode, bar.close);
    this.prevCloseMap.set(secCode, bar.close);
    return fills;
  }

  private lastSettledDate?: string;

  settleDayClose(currentDateStr?: string): void {
    if (currentDateStr) {
      this.lastSettledDate = currentDateStr;
    }
    for (const pos of this.positionMap.values()) {
      pos.availableQuantity += pos.frozenQuantity;
      pos.frozenQuantity = 0;
    }
    for (const [code, close] of this.lastBarCloseMap.entries()) {
      this.dailyPreCloseMap.set(code, close);
    }
  }

  getAccount(): BrokerAccountSnapshot {
    const readonlyPositions = new Map<string, PositionSlot>();
    for (const [code, pos] of this.positionMap.entries()) {
      readonlyPositions.set(code, {
        totalQuantity: pos.totalQuantity,
        availableQuantity: pos.availableQuantity,
        frozenQuantity: pos.frozenQuantity,
        avgCostPrice: pos.avgCostPrice,
      });
    }

    return {
      availableCash: this.availableCash,
      frozenCash: this.frozenCash,
      positions: readonlyPositions,
    };
  }

  getLastSettledDate(): string | undefined {
    return this.lastSettledDate;
  }

  getOpenOrders(): readonly Order[] {
    return Array.from(this.pendingOrders.values()).filter(
      (o) =>
        o.status === ORDER_STATUSES.PENDING ||
        o.status === ORDER_STATUSES.BLOCKED,
    );
  }

  private executeFill(
    order: Order,
    fillPrice: number,
    fillTime: Date,
  ): OrderFilledEvent | null {
    const fees: FeeDetails = calculateExecutionFees(
      order.side,
      fillPrice,
      order.quantity,
      order.securityCode,
      this.slippageRatio,
      this.feeConfig,
    );
    const turnover = Math.round(fillPrice * order.quantity * 100) / 100;

    if (order.side === ORDER_SIDES.BUY) {
      const totalRequired = turnover + fees.totalFees;
      if (this.availableCash < totalRequired) {
        this.pendingOrders.set(order.orderId, {
          ...order,
          status: ORDER_STATUSES.REJECTED,
          rejectReason: ORDER_REJECT_REASONS.INSUFFICIENT_CASH,
        });
        return null;
      }

      this.availableCash =
        Math.round((this.availableCash - totalRequired) * 100) / 100;

      let pos = this.positionMap.get(order.securityCode);
      if (!pos) {
        pos = {
          totalQuantity: 0,
          availableQuantity: 0,
          frozenQuantity: 0,
          avgCostPrice: 0,
        };
        this.positionMap.set(order.securityCode, pos);
      }

      const prevTotalCost = pos.totalQuantity * pos.avgCostPrice;
      pos.totalQuantity += order.quantity;
      // 当日买入股份全量记入 frozenQuantity (T+1 锁定)
      pos.frozenQuantity += order.quantity;
      pos.avgCostPrice =
        pos.totalQuantity > 0
          ? Math.round(((prevTotalCost + turnover) / pos.totalQuantity) * 100) /
            100
          : 0;

      this.eventCounter += 1;
      return {
        eventId: `fill-${Date.now()}-${this.eventCounter}`,
        orderId: order.orderId,
        securityId: order.securityId,
        securityCode: order.securityCode,
        side: order.side,
        fillTime,
        fillPrice,
        filledQuantity: order.quantity,
        turnover,
        fees,
        netAmount: -totalRequired,
        ...(order.exitReason ? { exitReason: order.exitReason } : {}),
      };
    } else {
      const pos = this.positionMap.get(order.securityCode);
      if (!pos || pos.availableQuantity < order.quantity) {
        return null;
      }

      pos.availableQuantity -= order.quantity;
      pos.totalQuantity -= order.quantity;
      if (pos.totalQuantity === 0) {
        pos.avgCostPrice = 0;
      }

      const netIncome = turnover - fees.totalFees;
      this.availableCash =
        Math.round((this.availableCash + netIncome) * 100) / 100;

      this.eventCounter += 1;
      return {
        eventId: `fill-${Date.now()}-${this.eventCounter}`,
        orderId: order.orderId,
        securityId: order.securityId,
        securityCode: order.securityCode,
        side: order.side,
        fillTime,
        fillPrice,
        filledQuantity: order.quantity,
        turnover,
        fees,
        netAmount: netIncome,
        ...(order.exitReason ? { exitReason: order.exitReason } : {}),
      };
    }
  }
}
