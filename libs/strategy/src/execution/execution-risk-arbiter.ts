import { TRADING_RULES } from '@app/constants';
import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '../kernel/kernel.types';
import type { PositionSnapshot } from '../position/position.types';
import {
  ORDER_SIDES,
  ORDER_TYPES,
  POSITION_STATUSES,
  SIGNAL_KINDS,
} from '../strategy.constants';
import type { CreateOrderDto } from './execution.types';

/**
 * 宏观大盘体温与体制规范
 */
export enum MarketRiskRegime {
  NORMAL = 'NORMAL', // 正常交易状态：Alpha 信号自由驱动开平仓
  ELEVATED_RISK = 'ELEVATED_RISK', // 高波动预警：开仓预算减半，紧缩追踪止损
  SYSTEMIC_CRUNCH = 'SYSTEMIC_CRUNCH', // 系统性雪崩：全面禁止开仓，执行保护性清仓
  LIQUIDITY_FREEZE = 'LIQUIDITY_FREEZE', // 流动性枯竭：挂单顺延，记录流动性惩罚
}

/**
 * 宏观体制快照
 */
export interface MacroRegimeSnapshot {
  readonly regime: MarketRiskRegime;
  readonly marketAtrPercentile: number; // 大盘真实波幅历史分位数 (0.0 ~ 1.0)
  readonly marketBreadthRatio?: number; // 全市场上涨标的占比
  readonly isLiquidityFrozen: boolean; // 是否处于跌停潮/千股跌停状态
}

export interface ExecutionRiskArbiterOptions {
  /** 硬止损阈值（负数，如 -0.08 代表亏损 8% 斩仓），默认 -0.08 */
  readonly hardStopLossRatio?: number;
  /** 开仓可用资金分配比例（预留滑点及手续费），默认 0.995 */
  readonly cashAllocationRatio?: number;
  /** 单笔开仓最小一手股数，默认 100 股 */
  readonly lotSize?: number;
}

export interface ArbitrateContext {
  readonly bar: StrategyBar;
  readonly signal?: KernelSignal;
  readonly position: Readonly<PositionSnapshot>;
  readonly macroRegime?: MacroRegimeSnapshot;
  readonly availableCash: number;
}

/**
 * 统一动作与风控裁决器（ExecutionRiskArbiter）
 *
 * 核心架构准则（模型 B 对齐）：
 * 1. 上游决策树（StrategyEvaluationKernel）保持纯形态雷达，不挂大盘门禁，不感知持仓；
 * 2. 下游统一动作与风控裁决器独揽所有的交易订单生成（Order Action）与风控否决；
 * 3. 持仓状态机（PositionStateMachine）彻底回归纯记账员，平仓动作 100% 由裁决器下达。
 */
export class ExecutionRiskArbiter {
  private readonly hardStopLossRatio: number;
  private readonly cashAllocationRatio: number;
  private readonly lotSize: number;

  constructor(options?: ExecutionRiskArbiterOptions) {
    this.hardStopLossRatio = options?.hardStopLossRatio ?? -0.08;
    this.cashAllocationRatio = options?.cashAllocationRatio ?? 0.995;
    this.lotSize = options?.lotSize ?? TRADING_RULES.MAIN_BOARD_LOT_SIZE;
  }

  /**
   * 综合裁决入口：输入客观信号、当前持仓与大盘环境，输出唯一的交易订单动作
   */
  public arbitrate(context: ArbitrateContext): CreateOrderDto | null {
    const { bar, signal, position, macroRegime, availableCash } = context;

    const regime = macroRegime?.regime ?? MarketRiskRegime.NORMAL;
    const isHolding =
      position.status === POSITION_STATUSES.HOLDING &&
      position.holdingQuantity > 0;

    // ─────────────────────────────────────────────────────────────
    // 【平仓管卡】：持有仓位 (HOLDING) 时，统一三级优先级单一裁决
    // ─────────────────────────────────────────────────────────────
    if (isHolding) {
      // 优先级 1 (系统生存级)：大盘突发系统性雪崩，无条件紧急清仓
      if (regime === MarketRiskRegime.SYSTEMIC_CRUNCH) {
        return {
          securityId: position.securityId,
          securityCode: position.securityCode,
          side: ORDER_SIDES.SELL,
          orderType: ORDER_TYPES.MARKET,
          quantity: position.holdingQuantity,
          signalTime: bar.timestamp,
          exitReason: 'SYSTEMIC_RISK_MELTDOWN',
        };
      }

      // 优先级 2 (持仓风控级)：个股浮亏跌破硬止损线 (默认成本价 -8%)
      const currentPnlRatio =
        position.costPrice > 0
          ? (bar.close - position.costPrice) / position.costPrice
          : position.unrealizedPnlRatio;
      const effectivePnlRatio = Math.min(
        position.unrealizedPnlRatio,
        currentPnlRatio,
      );

      if (effectivePnlRatio <= this.hardStopLossRatio) {
        return {
          securityId: position.securityId,
          securityCode: position.securityCode,
          side: ORDER_SIDES.SELL,
          orderType: ORDER_TYPES.MARKET,
          quantity: position.holdingQuantity,
          signalTime: bar.timestamp,
          exitReason: 'HARD_STOP_LOSS',
        };
      }

      // 优先级 3 (策略逻辑级)：收到决策树客观发出的反向 SELL 信号 (如缠论二卖)
      if (signal && signal.signalKind === SIGNAL_KINDS.EXIT) {
        return {
          securityId: position.securityId,
          securityCode: position.securityCode,
          side: ORDER_SIDES.SELL,
          orderType: ORDER_TYPES.MARKET,
          quantity: position.holdingQuantity,
          signalTime: signal.signalTime,
          exitReason: signal.signalType ?? 'SIGNAL_EXIT',
        };
      }

      return null;
    }

    // ─────────────────────────────────────────────────────────────
    // 【买入管卡】：无持仓 (EMPTY) 且收到 BUY 候选信号时
    // ─────────────────────────────────────────────────────────────
    const isAvailableForEntry =
      position.status === POSITION_STATUSES.EMPTY ||
      position.holdingQuantity === 0;

    if (isAvailableForEntry && signal?.signalKind === SIGNAL_KINDS.ENTRY) {
      // 开仓风控检查：大盘处于高危雪崩期或流动性冻结，直接 Veto 否决
      if (
        regime === MarketRiskRegime.SYSTEMIC_CRUNCH ||
        macroRegime?.isLiquidityFrozen === true
      ) {
        return null;
      }

      if (bar.close <= 0) {
        return null;
      }

      // 高波动预警下开仓预算减半
      const allocRatio =
        regime === MarketRiskRegime.ELEVATED_RISK
          ? this.cashAllocationRatio * 0.5
          : this.cashAllocationRatio;

      const allocatableCash = availableCash * allocRatio;
      const targetQty =
        Math.floor(allocatableCash / bar.close / this.lotSize) * this.lotSize;

      if (targetQty >= this.lotSize) {
        return {
          securityId: position.securityId,
          securityCode: position.securityCode,
          side: ORDER_SIDES.BUY,
          orderType: ORDER_TYPES.MARKET,
          quantity: targetQty,
          signalTime: signal.signalTime,
        };
      }

      return null;
    }

    return null;
  }
}
