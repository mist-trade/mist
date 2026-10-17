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
  readonly exitReason?: string;
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
  readonly exitReason?: string;
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
  readonly exitReason?: string;
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
  registerSecurity?(
    securityCode: string,
    metadata: { name?: string; preClose?: number },
  ): void;
}

export interface BrokerFeeConfig {
  /** 佣金费率，默认万分之 2.5 (0.00025) */
  readonly commissionRate?: number;
  /** 最低佣金，默认 5 元；若设置为 0 则支持大客户免五 */
  readonly minCommission?: number;
  /** 过户费率，默认万分之 0.1 (0.00001) */
  readonly transferFeeRate?: number;
  /** 印花税率，默认万分之 5 (0.0005)，仅卖出非 ETF 征收 */
  readonly stampDutyRate?: number;
}

export interface BrokerExecutionOptions {
  /** 账户初始资金，默认 1,000,000 */
  readonly initialCash?: number;
  /** 冲击滑点比例，默认 0.001（0.1%） */
  readonly slippageRatio?: number;
  /** 费率设置 */
  readonly feeConfig?: BrokerFeeConfig;
}
