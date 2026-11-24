/**
 * TradingEngine——交易层域核心（design.md 2.4）。
 *
 * 纯函数：快照进 → 决策出，不触 DB、不触撮合；同组同快照 → 逐字段相同输出
 * （REQ-ENGINE-01）。入场与出场同走规则管线（REQ-ENGINE-03），先出后进
 * （REQ-ENGINE-02），拒绝必须显式（REQ-ENGINE-04），合成 Bar 因果等价
 * （REQ-ENGINE-05），整数厘算术（REQ-ENGINE-07）。
 */
import type { StrategyBar } from '@app/market-data';
import { formatShanghaiDateString } from '@app/timezone';
import { ORDER_SIDES } from '../strategy.constants';
import type {
  AccountSnapshot,
  AttributedSignal,
  MacroRegimeSnapshot,
  Rule,
  SignalGroupInput,
  SizingStrategy,
  TradeInstruction,
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
  resolveIntent,
  type RiskRule,
} from './rules';
import { sellFirstByConfidence, type GroupOrderingStrategy } from './ordering';
import { createAllInWithBuffer } from './sizing';

export interface TradingEngineDeps {
  /** 入场规则管线（首条终局 Verdict 生效） */
  readonly entryRules?: readonly Rule[];
  /** 出场规则管线（首条终局 Verdict 生效） */
  readonly exitRules?: readonly Rule[];
  /** Bar 巡检管线（per-bar 风控，优先级 = 数组顺序） */
  readonly riskRules?: readonly RiskRule[];
  /** 仓位策略（与裁决分离） */
  readonly sizing?: SizingStrategy;
  /** 组内排序策略（interim 先出后进） */
  readonly groupOrdering?: GroupOrderingStrategy;
  readonly lotSize?: number;
  readonly feeConfig?: FeeConfigLi;
}

export class TradingEngine {
  private readonly entryRules: readonly Rule[];
  private readonly exitRules: readonly Rule[];
  private readonly riskRules: readonly RiskRule[];
  private readonly sizing: SizingStrategy;
  private readonly groupOrdering: GroupOrderingStrategy;
  private readonly lotSize: number;
  private readonly feeConfig?: FeeConfigLi;

  constructor(deps: TradingEngineDeps = {}) {
    this.sizing = deps.sizing ?? createAllInWithBuffer(0.95);
    this.entryRules = deps.entryRules ?? createDefaultEntryRules(this.sizing);
    this.exitRules = deps.exitRules ?? createDefaultExitRules();
    this.riskRules = deps.riskRules ?? createDefaultRiskRules();
    this.groupOrdering = deps.groupOrdering ?? sellFirstByConfidence;
    this.lotSize = deps.lotSize ?? 100;
    this.feeConfig = deps.feeConfig;
  }

  /**
   * 信号组裁决：合成 Bar → 规则管线 → 指令/拒绝 + 假定成交账户投影。
   */
  decide(
    group: SignalGroupInput,
    snapshot: AccountSnapshot,
    macroRegime?: MacroRegimeSnapshot,
  ): TradingDecision {
    const cash = { li: snapshot.cashLi };
    const positions = new Map<number, TradingPositionState>(snapshot.positions);
    const instructions: TradeInstruction[] = [];
    const rejections: Array<TradingDecision['rejections'][number]> = [];

    const ordered = this.groupOrdering.order(group.signals);

    for (const attributed of ordered) {
      const signal = attributed.signal;
      const intent = resolveIntent(signal);
      const priceLi = yuanToLi(signal.triggerPrice);
      const raw = positions.get(group.securityId);
      const position = raw && raw.holdingQuantity > 0 ? raw : null;

      // 结构性预检（账户状态，非信号裁决——REQ-ENGINE-03）：出场侧
      if (intent === 'EXIT') {
        if (position === null) {
          rejections.push({
            idempotencyKey: attributed.idempotencyKey,
            signal: attributed,
            reason: 'NO_POSITION',
            detail: '虚拟账户空仓',
          });
          continue;
        }
        if (isEnteredToday(position, snapshot.tradingDay)) {
          rejections.push({
            idempotencyKey: attributed.idempotencyKey,
            signal: attributed,
            reason: 'T1_FROZEN',
            detail: '当日买入股份 T+1 冻结，不可卖出',
          });
          continue;
        }
      }

      const ctx = {
        signal: attributed,
        intent,
        syntheticBar: buildSyntheticBar(
          group,
          signal.signalTime,
          signal.triggerPrice,
        ),
        priceLi,
        position,
        cashLi: cash.li,
        macroRegime,
        lotSize: this.lotSize,
      };

      const verdict = firstVerdict(
        intent === 'EXIT' ? this.exitRules : this.entryRules,
        ctx,
      );
      if (verdict === null) {
        // 管线含 fallback，不应到达；防御性兜底满足 REQ-ENGINE-04
        rejections.push({
          idempotencyKey: attributed.idempotencyKey,
          signal: attributed,
          reason: 'INVALID_PRICE',
          detail: '规则管线未产出终局裁决（防御性兜底）',
        });
        continue;
      }

      if (verdict.action === 'REJECT') {
        rejections.push({
          idempotencyKey: attributed.idempotencyKey,
          signal: attributed,
          reason: verdict.reason,
          detail: verdict.detail,
        });
        continue;
      }

      // 指令装配 + 假定成交
      if (verdict.side === ORDER_SIDES.BUY) {
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
            idempotencyKey: attributed.idempotencyKey,
            signal: attributed,
            reason: 'INSUFFICIENT_CASH',
            detail: `现金 ${cash.li} 厘不足以覆盖含费总额 ${totalLi} 厘`,
          });
          continue;
        }
        cash.li -= totalLi;
        positions.set(group.securityId, {
          securityId: group.securityId,
          securityCode: group.securityCode,
          holdingQuantity: verdict.quantity,
          costPriceLi: turnoverLi / BigInt(verdict.quantity),
          entryTime: signal.signalTime,
          currentPriceLi: priceLi,
          realizedPnlLi: 0n,
        });
        instructions.push(
          buildInstruction(
            attributed,
            'BUY',
            verdict.quantity,
            priceLi,
            verdict.reason,
          ),
        );
      } else {
        if (position === null) {
          // 防御性：预检已覆盖，类型收窄用
          rejections.push({
            idempotencyKey: attributed.idempotencyKey,
            signal: attributed,
            reason: 'NO_POSITION',
            detail: '虚拟账户空仓',
          });
          continue;
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
        cash.li += proceedsLi;
        const remaining = position.holdingQuantity - sellQty;
        if (remaining <= 0) {
          positions.delete(group.securityId);
        } else {
          positions.set(group.securityId, {
            ...position,
            holdingQuantity: remaining,
            currentPriceLi: priceLi,
            realizedPnlLi: position.realizedPnlLi + (proceedsLi - costBasisLi),
          });
        }
        instructions.push(
          buildInstruction(
            attributed,
            'SELL',
            sellQty,
            priceLi,
            verdict.reason,
          ),
        );
      }
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
   * Bar 巡检（per-bar 风控，回测/dev 共用）：systemicCrunch → hardStop，
   * 首条风控 Verdict 生效；产出保护性清仓指令（不推进账本——成交仍由
   * 各执行端撮合层承担）。
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
        action: 'SELL',
        quantity: Math.min(verdict.quantity, position.holdingQuantity),
        referencePrice: bar.close,
        estimatedValueLi:
          priceLi *
          BigInt(Math.min(verdict.quantity, position.holdingQuantity)),
        reason: verdict.reason,
        attribution: {
          strategyName: 'RISK_SURVEILLANCE',
          periodLabel: 'bar',
          traceChain: null,
        },
      },
    ];
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
    source: 'synthetic',
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
    signal: attributed.signal,
  };
}
