import type { StrategyBar } from '@app/market-data';
import {
  ORDER_REJECT_REASONS,
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
} from '../strategy.constants';

export type OrderSide = (typeof ORDER_SIDES)[keyof typeof ORDER_SIDES];
export type OrderType = (typeof ORDER_TYPES)[keyof typeof ORDER_TYPES];
export type OrderStatus = (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES];

export type OrderRejectReason =
  (typeof ORDER_REJECT_REASONS)[keyof typeof ORDER_REJECT_REASONS];

export interface Order {
  readonly orderId: string;
  readonly securityId: number;
  readonly securityCode: string;
  readonly side: OrderSide;
  readonly orderType: OrderType;
  readonly quantity: number;
  readonly signalTime: Date;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
  readonly status: OrderStatus;
  readonly createdAt: Date;
  readonly rejectReason?: OrderRejectReason;
}

export interface FeeDetails {
  readonly commission: number;
  readonly transferFee: number;
  readonly stampDuty: number;
  readonly slippageCost: number;
  readonly totalFees: number;
}

export interface OrderFilledEvent {
  readonly eventId: string;
  readonly orderId: string;
  readonly securityId: number;
  readonly securityCode: string;
  readonly side: OrderSide;
  readonly fillTime: Date;
  readonly fillPrice: number;
  readonly filledQuantity: number;
  readonly turnover: number;
  readonly fees: FeeDetails;
  readonly netAmount: number;
}

export interface PositionSlot {
  readonly totalQuantity: number;
  readonly availableQuantity: number;
  readonly frozenQuantity: number;
  readonly avgCostPrice: number;
}

export interface BrokerAccountSnapshot {
  readonly availableCash: number;
  readonly frozenCash: number;
  readonly positions: ReadonlyMap<string, PositionSlot>;
}

export interface CreateOrderDto {
  readonly securityId: number;
  readonly securityCode: string;
  readonly side: OrderSide;
  readonly orderType: OrderType;
  readonly quantity: number;
  readonly signalTime: Date;
  readonly limitPrice?: number;
  readonly stopPrice?: number;
}

/**
 * 统一执行与撮合端口，回测模拟器与实盘 Broker 遵循同一抽象
 */
export interface ExecutionBrokerPort {
  submitOrder(dto: CreateOrderDto): Order;
  cancelOrder(orderId: string): boolean;
  onBar(bar: StrategyBar): readonly OrderFilledEvent[];
  settleDayClose(currentDateStr: string): void;
  getAccount(): BrokerAccountSnapshot;
  getOpenOrders(): readonly Order[];
}
