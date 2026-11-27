/**
 * TradingEngine——交易层域核心（design.md 第二节）。
 *
 * 纯函数：快照进 → 决策出，不触 DB、不触撮合；同组同快照 → 逐字段相同输出
 * （REQ-ENGINE-01）。组内采用「先出后进 + 两阶段同向归并」（Phase 1 归并 EXIT →
 * 释放现金与持仓 → Phase 2 归并 ENTRY），禁止按置信度排序竞争（REQ-ENGINE-02），
 * 拒绝必须显式（REQ-ENGINE-04），合成 Bar 因果等价（REQ-ENGINE-05），整数厘算术
 * （REQ-ENGINE-07）。
 */
import type { StrategyBar } from '@app/market-data';
import { formatShanghaiDateString } from '@app/timezone';
import {
  ORDER_SIDES,
  POSITION_EXIT_REASONS,
  TRADING_LAYER_DEFAULTS,
} from '../strategy.constants';
import {
  consolidateGroupByDirection,
  toSignalContributor,
} from './consolidation';
import type {
  AccountSnapshot,
  AttributedSignal,
  MacroRegimeSnapshot,
  Rule,
  SignalContributor,
  SignalGroupInput,
  SizingStrategy,
  TradeInstruction,
  TradeRejection,
  TradingDecision,
  TradingPositionState,
} from './domain.types';
import { calculateExecutionFeesLi, type FeeConfigLi } from './fees';
import { yuanToLi, type Li } from './money';
import {
  createDefaultEntryRules,
  createDefaultExitRules,
  createDefaultRiskRules,
  firstRiskVerdict,
  firstVerdict,
  type RiskRule,
} from './rules';
import { createAllInWithBuffer } from './sizing';

const INTENT_ENTRY = 'ENTRY' as const;
const INTENT_EXIT = 'EXIT' as const;
const REJECT_INVALID_PRICE = 'INVALID_PRICE';
const REJECT_NO_POSITION = 'NO_POSITION';
const REJECT_T1_FROZEN = 'T1_FROZEN';
const REJECT_INSUFFICIENT_CASH = 'INSUFFICIENT_CASH';
const VERDICT_REJECT = 'REJECT';
const SYNTHETIC_SOURCE = 'synthetic';
const RESONANCE_REASON_SEPARATOR = ' + ';
const RISK_STRATEGY_NAME = 'RISK_SURVEILLANCE';
const RISK_PERIOD_LABEL = 'bar';

export interface TradingEngineDeps {
  /** 入场规则管线（首条终局 Verdict 生效） */
  readonly entryRules?: readonly Rule[];
  /** 出场规则管线（首条终局 Verdict 生效） */
  readonly exitRules?: readonly Rule[];
  /** Bar 巡检管线（per-bar 风控，优先级 = 数组顺序） */
  readonly riskRules?: readonly RiskRule[];
  /** 仓位策略（与裁决分离） */
  readonly sizing?: SizingStrategy;
  readonly lotSize?: number;
  readonly feeConfig?: FeeConfigLi;
}

export class TradingEngine {
  private readonly entryRules: readonly Rule[];
  private readonly exitRules: readonly Rule[];
  private readonly riskRules: readonly RiskRule[];
  private readonly sizing: SizingStrategy;
  private readonly lotSize: number;
  private readonly feeConfig?: FeeConfigLi;

  constructor(deps: TradingEngineDeps = {}) {
    this.sizing =
      deps.sizing ??
      createAllInWithBuffer(
        TRADING_LAYER_DEFAULTS.DEFAULT_CASH_ALLOCATION_RATIO,
      );
    this.entryRules = deps.entryRules ?? createDefaultEntryRules(this.sizing);
    this.exitRules = deps.exitRules ?? createDefaultExitRules();
    this.riskRules = deps.riskRules ?? createDefaultRiskRules();
    this.lotSize = deps.lotSize ?? TRADING_LAYER_DEFAULTS.DEFAULT_LOT_SIZE;
    this.feeConfig = deps.feeConfig;
  }

  /**
   * 信号组裁决：价格隔离 → Phase 1 归并出场 → Phase 2 归并入场 → 假定成交账户投影。
   */
  decide(
    group: SignalGroupInput,
    snapshot: AccountSnapshot,
    macroRegime?: MacroRegimeSnapshot,
  ): TradingDecision {
    const cash = { li: snapshot.cashLi };
    const positions = new Map<number, TradingPositionState>(snapshot.positions);
    const closedRealizedPnl = new Map<number, Li>();
    const instructions: TradeInstruction[] = [];
    const rejections: TradeRejection[] = [];

    const { invalidPriceSignals, validExits, validEntries } =
      consolidateGroupByDirection(group.signals);

    // 隔离无效价格信号：单条受损信号绝不毒害同向共振伙伴
    for (const invalidSig of invalidPriceSignals) {
      rejections.push({
        idempotencyKey: invalidSig.idempotencyKey,
        signal: invalidSig,
        reason: REJECT_INVALID_PRICE,
        detail: 'triggerPrice ≤ 0',
      });
    }

    // Phase 1：归并同向有效 EXIT 桶（最多产出 1 条全平 SELL 指令或 1 条归并拒绝）
    if (validExits.length > 0) {
      this.evaluateExitBucket({
        validExits,
        group,
        tradingDay: snapshot.tradingDay,
        macroRegime,
        cash,
        positions,
        closedRealizedPnl,
        instructions,
        rejections,
      });
    }

    // Phase 2：在 Phase 1 释放资金与持仓后的快照上归并同向有效 ENTRY 桶
    if (validEntries.length > 0) {
      this.evaluateEntryBucket({
        validEntries,
        group,
        macroRegime,
        cash,
        positions,
        closedRealizedPnl,
        instructions,
        rejections,
      });
    }

    return {
      instructions,
      rejections,
      accountAfter: {
        cashLi: cash.li,
        positions,
        tradingDay: snapshot.tradingDay,
      },
    };
  }

  /**
   * Bar 巡检（per-bar 风控，回测/dev 共用）：systemicCrunch → 保护性清仓指令
   * （不推进账本——成交仍由各执行端撮合层承担）。
   */
  surveilBar(
    bar: Pick<
      StrategyBar,
      'securityId' | 'securityCode' | 'timestamp' | 'close'
    >,
    position: TradingPositionState | null,
    macroRegime?: MacroRegimeSnapshot,
  ): readonly TradeInstruction[] {
    if (position === null || position.holdingQuantity <= 0) return [];
    const verdict = firstRiskVerdict(this.riskRules, {
      bar: {
        timestamp: bar.timestamp,
        close: bar.close,
        securityCode: bar.securityCode ?? '',
        securityId: bar.securityId,
      },
      position,
      macroRegime,
      lotSize: this.lotSize,
    });
    if (verdict === null) return [];
    const priceLi = yuanToLi(bar.close);
    const idempotencyKey = `risk-${bar.securityCode}-${bar.timestamp.getTime()}-${verdict.ruleId}`;
    return [
      {
        instructionId: `ti-${idempotencyKey}`,
        idempotencyKey,
        action: ORDER_SIDES.SELL,
        quantity: Math.min(verdict.quantity, position.holdingQuantity),
        referencePrice: bar.close,
        estimatedValueLi:
          priceLi *
          BigInt(Math.min(verdict.quantity, position.holdingQuantity)),
        reason: verdict.reason,
        attribution: {
          strategyName: RISK_STRATEGY_NAME,
          periodLabel: RISK_PERIOD_LABEL,
          traceChain: null,
        },
      },
    ];
  }

  private evaluateExitBucket(params: {
    readonly validExits: readonly AttributedSignal[];
    readonly group: SignalGroupInput;
    readonly tradingDay: string;
    readonly macroRegime?: MacroRegimeSnapshot;
    readonly cash: { li: Li };
    readonly positions: Map<number, TradingPositionState>;
    readonly closedRealizedPnl: Map<number, Li>;
    readonly instructions: TradeInstruction[];
    readonly rejections: TradeRejection[];
  }): void {
    const {
      validExits,
      group,
      tradingDay,
      macroRegime,
      cash,
      positions,
      closedRealizedPnl,
      instructions,
      rejections,
    } = params;
    const primary = validExits[0];
    const contributors = validExits.map(toSignalContributor);
    const raw = positions.get(group.securityId);
    const position = raw && raw.holdingQuantity > 0 ? raw : null;

    if (position === null) {
      rejections.push({
        idempotencyKey: primary.idempotencyKey,
        signal: primary,
        contributors,
        reason: REJECT_NO_POSITION,
        detail: '虚拟账户空仓',
      });
      return;
    }

    if (isEnteredToday(position, tradingDay)) {
      rejections.push({
        idempotencyKey: primary.idempotencyKey,
        signal: primary,
        contributors,
        reason: REJECT_T1_FROZEN,
        detail: '当日买入股份 T+1 冻结，不可卖出',
      });
      return;
    }

    const priceLi = yuanToLi(primary.signal.triggerPrice);
    const ctx = {
      signal: primary,
      intent: INTENT_EXIT,
      syntheticBar: buildSyntheticBar(
        group,
        primary.signal.signalTime,
        primary.signal.triggerPrice,
      ),
      priceLi,
      position,
      cashLi: cash.li,
      macroRegime,
      lotSize: this.lotSize,
    };

    const verdict = firstVerdict(this.exitRules, ctx);
    if (verdict === null) {
      rejections.push({
        idempotencyKey: primary.idempotencyKey,
        signal: primary,
        contributors,
        reason: REJECT_INVALID_PRICE,
        detail: '规则管线未产出终局裁决（防御性兜底）',
      });
      return;
    }

    if (verdict.action === VERDICT_REJECT) {
      rejections.push({
        idempotencyKey: primary.idempotencyKey,
        signal: primary,
        contributors,
        reason: verdict.reason,
        detail: verdict.detail,
      });
      return;
    }

    const sellQty = Math.min(verdict.quantity, position.holdingQuantity);
    const fees = calculateExecutionFeesLi(
      ORDER_SIDES.SELL,
      priceLi,
      sellQty,
      group.securityCode,
      this.feeConfig,
    );
    const turnoverLi = priceLi * BigInt(sellQty);
    const proceedsLi = turnoverLi - fees.totalFeesLi;
    const costBasisLi = position.costPriceLi * BigInt(sellQty);
    const priorBuyFeesLi = position.accumulatedBuyFeesLi ?? 0n;
    const allocatedBuyFeesLi =
      position.holdingQuantity > 0
        ? (priorBuyFeesLi * BigInt(sellQty)) / BigInt(position.holdingQuantity)
        : 0n;
    const remainingBuyFeesLi =
      priorBuyFeesLi > allocatedBuyFeesLi
        ? priorBuyFeesLi - allocatedBuyFeesLi
        : 0n;
    const nextRealizedPnlLi =
      position.realizedPnlLi + (proceedsLi - costBasisLi - allocatedBuyFeesLi);
    cash.li += proceedsLi;
    const remaining = position.holdingQuantity - sellQty;
    if (remaining <= 0) {
      closedRealizedPnl.set(group.securityId, nextRealizedPnlLi);
      positions.delete(group.securityId);
    } else {
      positions.set(group.securityId, {
        ...position,
        holdingQuantity: remaining,
        currentPriceLi: priceLi,
        realizedPnlLi: nextRealizedPnlLi,
        accumulatedBuyFeesLi: remainingBuyFeesLi,
      });
    }

    const reason =
      validExits.length > 1
        ? [
            ...new Set(
              validExits.map(
                (e) => e.signal.signalType || POSITION_EXIT_REASONS.SIGNAL_EXIT,
              ),
            ),
          ].join(RESONANCE_REASON_SEPARATOR)
        : verdict.reason;

    instructions.push(
      buildInstruction(
        primary,
        ORDER_SIDES.SELL,
        sellQty,
        priceLi,
        reason,
        contributors,
      ),
    );
  }

  private evaluateEntryBucket(params: {
    readonly validEntries: readonly AttributedSignal[];
    readonly group: SignalGroupInput;
    readonly macroRegime?: MacroRegimeSnapshot;
    readonly cash: { li: Li };
    readonly positions: Map<number, TradingPositionState>;
    readonly closedRealizedPnl: Map<number, Li>;
    readonly instructions: TradeInstruction[];
    readonly rejections: TradeRejection[];
  }): void {
    const {
      validEntries,
      group,
      macroRegime,
      cash,
      positions,
      closedRealizedPnl,
      instructions,
      rejections,
    } = params;
    const primary = validEntries[0];
    const contributors = validEntries.map(toSignalContributor);
    const raw = positions.get(group.securityId);
    const position = raw && raw.holdingQuantity > 0 ? raw : null;
    const priceLi = yuanToLi(primary.signal.triggerPrice);

    const ctx = {
      signal: primary,
      intent: INTENT_ENTRY,
      syntheticBar: buildSyntheticBar(
        group,
        primary.signal.signalTime,
        primary.signal.triggerPrice,
      ),
      priceLi,
      position,
      cashLi: cash.li,
      macroRegime,
      lotSize: this.lotSize,
    };

    const verdict = firstVerdict(this.entryRules, ctx);
    if (verdict === null) {
      rejections.push({
        idempotencyKey: primary.idempotencyKey,
        signal: primary,
        contributors,
        reason: REJECT_INVALID_PRICE,
        detail: '规则管线未产出终局裁决（防御性兜底）',
      });
      return;
    }

    if (verdict.action === VERDICT_REJECT) {
      rejections.push({
        idempotencyKey: primary.idempotencyKey,
        signal: primary,
        contributors,
        reason: verdict.reason,
        detail: verdict.detail,
      });
      return;
    }

    const fees = calculateExecutionFeesLi(
      ORDER_SIDES.BUY,
      priceLi,
      verdict.quantity,
      group.securityCode,
      this.feeConfig,
    );
    const turnoverLi = priceLi * BigInt(verdict.quantity);
    const totalLi = turnoverLi + fees.totalFeesLi;
    if (cash.li < totalLi) {
      rejections.push({
        idempotencyKey: primary.idempotencyKey,
        signal: primary,
        contributors,
        reason: REJECT_INSUFFICIENT_CASH,
        detail: `现金 ${cash.li} 厘不足以覆盖含费总额 ${totalLi} 厘`,
      });
      return;
    }

    const priorRealizedPnlLi =
      position?.realizedPnlLi ??
      raw?.realizedPnlLi ??
      closedRealizedPnl.get(group.securityId) ??
      0n;
    const prevQty = position?.holdingQuantity ?? 0;
    const prevCostTotalLi =
      position !== null ? BigInt(prevQty) * position.costPriceLi : 0n;
    const nextQty = prevQty + verdict.quantity;
    const nextCostPriceLi =
      nextQty > 0 ? (prevCostTotalLi + turnoverLi) / BigInt(nextQty) : 0n;
    const nextBuyFeesLi =
      (position?.accumulatedBuyFeesLi ?? 0n) + fees.totalFeesLi;

    cash.li -= totalLi;
    positions.set(group.securityId, {
      securityId: group.securityId,
      securityCode: group.securityCode,
      holdingQuantity: nextQty,
      costPriceLi: nextCostPriceLi,
      entryTime: primary.signal.signalTime,
      currentPriceLi: priceLi,
      realizedPnlLi: priorRealizedPnlLi,
      accumulatedBuyFeesLi: nextBuyFeesLi,
    });

    const reason =
      validEntries.length > 1
        ? [
            ...new Set(
              validEntries.map((e) => e.signal.signalType || verdict.reason),
            ),
          ].join(RESONANCE_REASON_SEPARATOR)
        : verdict.reason;

    instructions.push(
      buildInstruction(
        primary,
        ORDER_SIDES.BUY,
        verdict.quantity,
        priceLi,
        reason,
        contributors,
      ),
    );
  }
}

function isEnteredToday(
  position: TradingPositionState,
  tradingDay: string,
): boolean {
  return (
    position.entryTime !== undefined &&
    formatShanghaiDateString(position.entryTime) === tradingDay
  );
}

/** 合成 Bar（REQ-ENGINE-05）：timestamp/价格与信号确认 Bar 严格一致。 */
function buildSyntheticBar(
  group: SignalGroupInput,
  signalTime: Date,
  triggerPrice: number,
): StrategyBar {
  return {
    securityId: group.securityId,
    securityCode: group.securityCode,
    source: SYNTHETIC_SOURCE,
    period: 0,
    timestamp: signalTime,
    open: triggerPrice,
    high: triggerPrice,
    low: triggerPrice,
    close: triggerPrice,
    volume: null,
    amount: null,
    type: 'complete',
  };
}

function buildInstruction(
  attributed: AttributedSignal,
  action: 'BUY' | 'SELL',
  quantity: number,
  priceLi: Li,
  reason: string,
  contributors: readonly SignalContributor[],
): TradeInstruction {
  return {
    instructionId: `ti-${attributed.idempotencyKey}`,
    idempotencyKey: attributed.idempotencyKey,
    action,
    quantity,
    referencePrice: attributed.signal.triggerPrice,
    estimatedValueLi: priceLi * BigInt(quantity),
    reason,
    attribution: attributed.attribution,
    contributors,
    signal: attributed.signal,
  };
}
