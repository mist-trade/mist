/**
 * 回测模拟经纪商（ExecutionBrokerPort 实现）。
 *
 * 组 1b 移植（REQ-ENGINE-07 / REQ-ISO-03）：
 * - 撮合语义零改动（Next-Bar Open / 一字板拒单顺延 / T+1 frozen / STOP 触价 /
 *   日结解锁），算术重写为整数厘——外部接口保持 float 元，边界一次转换；
 * - orderId/eventId 改业务键派生（`ord-{intentId}`；无 intentId 时由
 *   (code, side, signalTime, quantity) 复合派生），禁止 Date.now 与随机；
 * - createdAt = signalTime（因果一致，替代墙钟）。
 */
import type { StrategyBar } from '@app/market-data';
import { isOneWordLimitDown, isOneWordLimitUp } from '@app/market-data';
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
import { liToYuan, yuanToLi, type Li } from '../trading/money';

interface MutablePositionSlot {
  totalQuantity: number;
  availableQuantity: number;
  frozenQuantity: number;
  avgCostPriceLi: Li;
}

export class SimulatedBroker implements ExecutionBrokerPort {
  private availableCashLi: Li;
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

  private readonly slippageRatio: number;
  private readonly feeConfig?: BrokerExecutionOptions['feeConfig'];

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
      this.availableCashLi = yuanToLi(options);
      this.slippageRatio = EXECUTION_RULES.DEFAULT_SLIPPAGE_RATIO;
    } else {
      this.availableCashLi = yuanToLi(
        options?.initialCash ?? DEFAULT_BROKER_INITIAL_CASH,
      );
      this.slippageRatio =
        options?.slippageRatio ?? EXECUTION_RULES.DEFAULT_SLIPPAGE_RATIO;
      this.feeConfig = options?.feeConfig;
    }
  }

  /** 业务键派生订单号（REQ-ISO-03）：intentId 优先，缺失时复合键派生。 */
  private deriveOrderId(dto: CreateOrderDto): string {
    const base =
      dto.intentId ??
      `${dto.securityCode}-${dto.side}-${dto.signalTime.getTime()}-${dto.quantity}`;
    if (!this.pendingOrders.has(`ord-${base}`)) {
      return `ord-${base}`;
    }
    // 同复合键的极端重复提交：确定性序号消歧
    let n = 2;
    while (this.pendingOrders.has(`ord-${base}-${n}`)) n += 1;
    return `ord-${base}-${n}`;
  }

  submitOrder(dto: CreateOrderDto): Order {
    const orderId = this.deriveOrderId(dto);

    const rejected = (rejectReason: Order['rejectReason']): Order => ({
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
      createdAt: dto.signalTime,
      rejectReason,
    });

    if (dto.quantity <= 0) {
      return rejected(ORDER_REJECT_REASONS.CAUSALITY_VIOLATION);
    }

    if (dto.side === ORDER_SIDES.BUY) {
      const isRoundLot = dto.quantity % 100 === 0;
      if (!isRoundLot) {
        return rejected(ORDER_REJECT_REASONS.INVALID_LOT_SIZE);
      }
    } else {
      const pos = this.positionMap.get(dto.securityCode);
      const available = pos?.availableQuantity ?? 0;
      const frozen = pos?.frozenQuantity ?? 0;

      if (available < dto.quantity) {
        const isT1Locked = frozen >= dto.quantity;
        return rejected(
          isT1Locked
            ? ORDER_REJECT_REASONS.T1_LOCKED_SHARES
            : ORDER_REJECT_REASONS.INSUFFICIENT_SHARES,
        );
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
      createdAt: dto.signalTime,
      ...(dto.exitReason ? { exitReason: dto.exitReason } : {}),
      ...(dto.entryReason ? { entryReason: dto.entryReason } : {}),
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
            // 一字涨停无法买入，直接拒单（净移除，原语义）
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
          } else {
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
          } else {
            // 无法成交（如无持仓或可用份额不足），标记拒单并移除，防止悬挂死锁
            this.pendingOrders.set(orderId, {
              ...order,
              status: ORDER_STATUSES.REJECTED,
              rejectReason: ORDER_REJECT_REASONS.INSUFFICIENT_SHARES,
            });
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
        avgCostPrice: liToYuan(pos.avgCostPriceLi),
      });
    }

    return {
      availableCash: liToYuan(this.availableCashLi),
      frozenCash: 0,
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
    const fillPriceLi = yuanToLi(fillPrice);
    const fees: FeeDetails = calculateExecutionFees(
      order.side,
      fillPrice,
      order.quantity,
      order.securityCode,
      this.slippageRatio,
      this.feeConfig,
    );
    const turnoverLi = fillPriceLi * BigInt(order.quantity);
    const feesLi = yuanToLi(fees.totalFees);
    const turnover = liToYuan(turnoverLi);

    if (order.side === ORDER_SIDES.BUY) {
      const totalRequiredLi = turnoverLi + feesLi;
      if (this.availableCashLi < totalRequiredLi) {
        this.pendingOrders.set(order.orderId, {
          ...order,
          status: ORDER_STATUSES.REJECTED,
          rejectReason: ORDER_REJECT_REASONS.INSUFFICIENT_CASH,
        });
        return null;
      }

      this.availableCashLi -= totalRequiredLi;

      let pos = this.positionMap.get(order.securityCode);
      if (!pos) {
        pos = {
          totalQuantity: 0,
          availableQuantity: 0,
          frozenQuantity: 0,
          avgCostPriceLi: 0n,
        };
        this.positionMap.set(order.securityCode, pos);
      }

      const prevTotalCostLi = BigInt(pos.totalQuantity) * pos.avgCostPriceLi;
      pos.totalQuantity += order.quantity;
      // 当日买入股份全量记入 frozenQuantity (T+1 锁定)
      pos.frozenQuantity += order.quantity;
      pos.avgCostPriceLi =
        pos.totalQuantity > 0
          ? (prevTotalCostLi + turnoverLi) / BigInt(pos.totalQuantity)
          : 0n;

      return {
        eventId: `fill-${order.orderId}`,
        orderId: order.orderId,
        securityId: order.securityId,
        securityCode: order.securityCode,
        side: order.side,
        fillTime,
        fillPrice,
        filledQuantity: order.quantity,
        turnover,
        fees,
        netAmount: -liToYuan(totalRequiredLi),
        ...(order.entryReason ? { entryReason: order.entryReason } : {}),
        ...(order.exitReason ? { exitReason: order.exitReason } : {}),
      };
    }

    const pos = this.positionMap.get(order.securityCode);
    if (!pos || pos.availableQuantity < order.quantity) {
      return null;
    }

    pos.availableQuantity -= order.quantity;
    pos.totalQuantity -= order.quantity;
    if (pos.totalQuantity === 0) {
      pos.avgCostPriceLi = 0n;
    }

    const netIncomeLi = turnoverLi - feesLi;
    this.availableCashLi += netIncomeLi;

    return {
      eventId: `fill-${order.orderId}`,
      orderId: order.orderId,
      securityId: order.securityId,
      securityCode: order.securityCode,
      side: order.side,
      fillTime,
      fillPrice,
      filledQuantity: order.quantity,
      turnover,
      fees,
      netAmount: liToYuan(netIncomeLi),
      ...(order.entryReason ? { entryReason: order.entryReason } : {}),
      ...(order.exitReason ? { exitReason: order.exitReason } : {}),
    };
  }
}
