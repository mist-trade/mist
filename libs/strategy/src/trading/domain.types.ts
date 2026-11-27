/**
 * 交易层域模型（REQ-ENGINE-01..07 / design.md 第二节）。
 *
 * 全部为值对象；金额一律整数厘（`Li`，REQ-ENGINE-07）。引擎纯函数：
 * 快照进 → 决策出，不触 DB、不触撮合。
 */
import type { StrategyBar } from '@app/market-data';
import type { KernelSignal, SignalIntent } from '../kernel/kernel.types';
import type { OrderSide } from '../execution/execution.types';
import type { Li } from './money';

/* ───────────────────────── 宏观体制（自 execution 侧迁入的域语义） ───────────────────────── */

export enum MarketRiskRegime {
  NORMAL = 'NORMAL',
  ELEVATED_RISK = 'ELEVATED_RISK',
  SYSTEMIC_CRUNCH = 'SYSTEMIC_CRUNCH',
  LIQUIDITY_FREEZE = 'LIQUIDITY_FREEZE',
}

export interface MacroRegimeSnapshot {
  readonly regime: MarketRiskRegime;
  readonly marketAtrPercentile: number;
  readonly marketBreadthRatio?: number;
  readonly isLiquidityFrozen: boolean;
}

/* ───────────────────────── 输入 ───────────────────────── */

export interface SignalAttribution {
  readonly strategyName: string;
  readonly periodLabel: string;
  readonly traceChain: string | null;
}

export interface SignalContributor {
  readonly idempotencyKey: string;
  readonly signalType: string;
  readonly attribution: SignalAttribution;
  readonly pivotPrice?: number | null;
  readonly originPluginId?: string | null;
  readonly ruleSnapshot?: Readonly<Record<string, unknown>>;
}

/** 组内单条归因信号。幂等锚点为字符串（实时 = alertEventId 字符串化；离线 = 合成幂等串）。 */
export interface AttributedSignal {
  readonly idempotencyKey: string;
  readonly signal: KernelSignal;
  readonly attribution: SignalAttribution;
}

/** 聚合层产出的一个信号组——交易层的裁决单元。 */
export interface SignalGroupInput {
  readonly securityId: number;
  readonly securityCode: string;
  readonly effectiveTime: Date;
  readonly tradingDay: string;
  readonly signals: readonly AttributedSignal[];
}

/** 交易层整数持仓状态（聚合层/适配器由 fold 或 broker 快照构造）。 */
export interface TradingPositionState {
  readonly securityId: number;
  readonly securityCode: string;
  readonly holdingQuantity: number;
  /** 平均价成本（厘） */
  readonly costPriceLi: Li;
  /** 建仓时刻（T+1 判定依据：entryTime 落在 tradingDay 当日 → 全量冻结） */
  readonly entryTime?: Date;
  readonly currentPriceLi: Li;
  readonly realizedPnlLi: Li;
  /** 尚未分摊的累计买入规费（厘），供部分卖出时按比例扣减已实现盈亏 */
  readonly accumulatedBuyFeesLi?: Li;
}

/** 交易层账本只读快照（现金组合级、持仓按票）。 */
export interface AccountSnapshot {
  /** 组合级现金（整数厘） */
  readonly cashLi: Li;
  readonly positions: ReadonlyMap<number, TradingPositionState>;
  /** 账本已推进到的交易日（T+1 结算依据，YYYY-MM-DD） */
  readonly tradingDay: string;
}

/* ───────────────────────── 输出 ───────────────────────── */

export type TradeAction = 'BUY' | 'SELL';

export interface TradeInstruction {
  /** 业务键派生：`ti-{idempotencyKey}`（REQ-ISO-03） */
  readonly instructionId: string;
  readonly idempotencyKey: string;
  readonly action: TradeAction;
  /** 整手股数（lotSize 100） */
  readonly quantity: number;
  /** 信号 triggerPrice（元，float——渲染与旧撮合接口边界用） */
  readonly referencePrice: number;
  /** quantity × referencePrice（整数厘，BUY 另计手续费预算） */
  readonly estimatedValueLi: Li;
  /** signalType / exitReason */
  readonly reason: string;
  readonly attribution: SignalAttribution;
  /** 同向归并后的全量触发贡献者（信号驱动时 >= 1；风控巡检为 undefined） */
  readonly contributors?: readonly SignalContributor[];
  /** 归因信号回链；Bar 巡检产出的风控指令无信号锚，为 undefined */
  readonly signal?: KernelSignal;
}

export type TradeRejectionReason =
  | 'ALREADY_HOLDING'
  | 'NO_POSITION'
  | 'INSUFFICIENT_CASH'
  | 'T1_FROZEN'
  | 'SYSTEMIC_CRUNCH'
  | 'LIQUIDITY_FREEZE'
  | 'BELOW_LOT'
  | 'INVALID_PRICE';

export interface TradeRejection {
  readonly idempotencyKey: string;
  readonly signal: AttributedSignal;
  /** 同向有效信号共同被账户/体制/仓位门禁拒绝时附带全量贡献者 */
  readonly contributors?: readonly SignalContributor[];
  readonly reason: TradeRejectionReason;
  readonly detail: string;
}

/** 假定成交后的账户投影（实时回填依据）。 */
export interface TradingDecision {
  readonly instructions: readonly TradeInstruction[];
  readonly rejections: readonly TradeRejection[];
  readonly accountAfter: AccountSnapshot;
}

/* ───────────────────────── 规则管线（REQ-ENGINE-03） ───────────────────────── */

export type Verdict =
  | { action: 'INSTRUCT'; side: OrderSide; quantity: number; reason: string }
  | { action: 'REJECT'; reason: TradeRejectionReason; detail: string };

/** 裁决规则上下文（纯值；价格已转厘）。 */
export interface RuleContext {
  readonly signal: AttributedSignal;
  /** 信号意图（entry / exit） */
  readonly intent: SignalIntent;
  /** 合成 bar（signalTime/triggerPrice 构造，float 边界形态） */
  readonly syntheticBar: StrategyBar;
  /** triggerPrice（厘） */
  readonly priceLi: Li;
  /** 当前票持仓（无持仓为 null） */
  readonly position: TradingPositionState | null;
  /** 组合级现金（厘） */
  readonly cashLi: Li;
  readonly macroRegime?: MacroRegimeSnapshot;
  readonly lotSize: number;
}

/**
 * 纯函数裁决规则：管线内首条终局 Verdict 生效，末位 fallback 规则兜底显式拒绝
 * （REQ-ENGINE-04）。
 */
export type Rule = (ctx: RuleContext) => Verdict | null;

/** 仓位策略：与裁决分离——输入快照/regime，输出整手股数。 */
export interface SizingContext {
  readonly cashLi: Li;
  readonly priceLi: Li;
  readonly macroRegime?: MacroRegimeSnapshot;
  readonly lotSize: number;
}

export interface SizingResult {
  readonly quantity: number;
  readonly allocRatioUsed: number;
}

export type SizingStrategy = (ctx: SizingContext) => SizingResult;
