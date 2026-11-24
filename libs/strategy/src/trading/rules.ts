/**
 * 默认规则管线（REQ-ENGINE-03）。
 *
 * 信号裁决：entry 管线（holdingGate → regimeGate → priceGate → sizingRule）
 * 与 exit 管线（signalExitRule）——入场与出场同处一套管线体系，末位 fallback
 * 兜底显式拒绝（REQ-ENGINE-04），不存在第二条出单路径。
 * Bar 巡检：systemicCrunch → hardStop（per-bar 风控，优先级 = 数组顺序）。
 *
 * 裁决语义移植自 `ExecutionRiskArbiter`（类退役后由清理任务 9.1 删除）。
 */
import { MarketRiskRegime } from './domain.types';
import type {
  MacroRegimeSnapshot,
  Rule,
  RuleContext,
  SizingStrategy,
  TradingPositionState,
  Verdict,
} from './domain.types';
import type { KernelSignal } from '../kernel/kernel.types';
import { SIGNAL_KINDS } from '../strategy.constants';
import { liToYuan } from './money';

function isHolding(position: TradingPositionState | null): boolean {
  return position !== null && position.holdingQuantity > 0;
}

function intentOf(ctx: RuleContext): 'ENTRY' | 'EXIT' {
  return resolveIntent(ctx.signal.signal);
}

/** 信号意图归一：RISK_CUT 视作出场；无 intent 时按 signalKind 推导。 */
export function resolveIntent(signal: KernelSignal): 'ENTRY' | 'EXIT' {
  const raw = signal.intent;
  if (raw === 'EXIT' || raw === 'RISK_CUT') return 'EXIT';
  if (raw === 'ENTRY') return 'ENTRY';
  return signal.signalKind === SIGNAL_KINDS.EXIT ? 'EXIT' : 'ENTRY';
}

/* ───────────────────────── entry 管线 ───────────────────────── */

/** 持仓闸门：已持仓时入场信号一律显式拒绝（原 Arbiter 静默 null → 结构化拒绝）。 */
export const entryHoldingGate: Rule = (ctx) => {
  if (intentOf(ctx) !== 'ENTRY') return null;
  if (isHolding(ctx.position)) {
    return {
      action: 'REJECT',
      reason: 'ALREADY_HOLDING',
      detail: `虚拟账户已持仓 ${ctx.position?.holdingQuantity ?? 0} 股（成本 ${ctx.position?.costPriceLi ?? 0n} 厘）`,
    };
  }
  return null;
};

/** regime 闸门：系统性雪崩 / 流动性冻结期间一票否决开仓。 */
export const entryRegimeGate: Rule = (ctx) => {
  if (intentOf(ctx) !== 'ENTRY') return null;
  const regime = ctx.macroRegime?.regime ?? MarketRiskRegime.NORMAL;
  if (regime === MarketRiskRegime.SYSTEMIC_CRUNCH) {
    return {
      action: 'REJECT',
      reason: 'SYSTEMIC_CRUNCH',
      detail: '大盘系统性雪崩期，禁止开仓',
    };
  }
  if (ctx.macroRegime?.isLiquidityFrozen === true) {
    return {
      action: 'REJECT',
      reason: 'LIQUIDITY_FREEZE',
      detail: '流动性冻结（跌停潮），禁止开仓',
    };
  }
  return null;
};

/** 价格闸门：无有效价格不产生指令。 */
export const entryPriceGate: Rule = (ctx) => {
  if (intentOf(ctx) !== 'ENTRY') return null;
  if (ctx.priceLi <= 0n) {
    return {
      action: 'REJECT',
      reason: 'INVALID_PRICE',
      detail: 'triggerPrice ≤ 0',
    };
  }
  return null;
};

/** 仓位规则：SizingStrategy 产出整手股数；不足一手 → BELOW_LOT 显式拒绝。 */
export function createEntrySizingRule(sizing: SizingStrategy): Rule {
  return (ctx) => {
    if (intentOf(ctx) !== 'ENTRY') return null;
    const { quantity } = sizing({
      cashLi: ctx.cashLi,
      priceLi: ctx.priceLi,
      macroRegime: ctx.macroRegime,
      lotSize: ctx.lotSize,
    });
    if (quantity < ctx.lotSize) {
      return {
        action: 'REJECT',
        reason: 'BELOW_LOT',
        detail: `预算仅够 ${quantity} 股，不足一手（${ctx.lotSize}）`,
      };
    }
    return {
      action: 'INSTRUCT',
      side: 'BUY',
      quantity,
      reason: ctx.signal.signal.signalType,
    };
  };
}

/* ───────────────────────── exit 管线 ───────────────────────── */

/** 信号出场：反向卖出信号触发全仓平仓（平仓比例 1.0，沿用现状）。 */
export const exitSignalRule: Rule = (ctx) => {
  if (intentOf(ctx) !== 'EXIT') return null;
  if (!isHolding(ctx.position)) return null;
  return {
    action: 'INSTRUCT',
    side: 'SELL',
    quantity: ctx.position?.holdingQuantity ?? 0,
    reason: ctx.signal.signal.signalType || 'SIGNAL_EXIT',
  };
};

/** 兜底规则：管线末端必须产出终局 Verdict（REQ-ENGINE-04，防御性）。 */
export const fallbackRejectionRule: Rule = (ctx) => {
  if (intentOf(ctx) === 'EXIT') {
    return {
      action: 'REJECT',
      reason: 'NO_POSITION',
      detail: '空仓无票可卖（防御性兜底）',
    };
  }
  return {
    action: 'REJECT',
    reason: 'BELOW_LOT',
    detail: '入场管线未产出指令（防御性兜底）',
  };
};

export function createDefaultEntryRules(
  sizing: SizingStrategy,
): readonly Rule[] {
  return [
    entryHoldingGate,
    entryRegimeGate,
    entryPriceGate,
    createEntrySizingRule(sizing),
  ];
}

export function createDefaultExitRules(): readonly Rule[] {
  return [exitSignalRule, fallbackRejectionRule];
}

/* ───────────────────────── bar 巡检管线（per-bar 风控） ───────────────────────── */

export interface RiskRuleContext {
  readonly bar: {
    readonly timestamp: Date;
    readonly close: number;
    readonly securityCode: string;
    readonly securityId: number;
  };
  readonly position: TradingPositionState;
  readonly macroRegime?: MacroRegimeSnapshot;
  readonly lotSize: number;
}

export type RiskVerdict = {
  readonly ruleId: string;
  readonly quantity: number;
  readonly reason: string;
};

export type RiskRule = (ctx: RiskRuleContext) => RiskVerdict | null;

/** 系统性雪崩：无条件紧急清仓（优先级 1）。 */
export const riskSystemicCrunchRule: RiskRule = ({ position, macroRegime }) => {
  if (macroRegime?.regime !== MarketRiskRegime.SYSTEMIC_CRUNCH) return null;
  return {
    ruleId: 'systemic-crunch',
    quantity: position.holdingQuantity,
    reason: 'SYSTEMIC_RISK_MELTDOWN',
  };
};

/** 硬止损（可选配置）：浮亏跌破阈值斩仓（优先级 2）。 */
export function createRiskHardStopRule(hardStopLossRatio: number): RiskRule {
  return ({ position, bar }) => {
    const costYuan = liToYuan(position.costPriceLi);
    if (costYuan <= 0) return null;
    const currentPnlRatio = (bar.close - costYuan) / costYuan;
    const markedPnlRatio =
      liToYuan(position.currentPriceLi - position.costPriceLi) / costYuan;
    const effectivePnlRatio = Math.min(markedPnlRatio, currentPnlRatio);
    if (effectivePnlRatio > hardStopLossRatio) return null;
    return {
      ruleId: 'hard-stop-loss',
      quantity: position.holdingQuantity,
      reason: 'HARD_STOP_LOSS',
    };
  };
}

export function createDefaultRiskRules(
  hardStopLossRatio?: number | null,
): readonly RiskRule[] {
  const rules: RiskRule[] = [riskSystemicCrunchRule];
  if (typeof hardStopLossRatio === 'number') {
    rules.push(createRiskHardStopRule(hardStopLossRatio));
  }
  return rules;
}

/** 首条终局 Verdict 生效（管线求值原语）。 */
export function firstVerdict(
  rules: readonly Rule[],
  ctx: RuleContext,
): Verdict | null {
  for (const rule of rules) {
    const verdict = rule(ctx);
    if (verdict !== null) return verdict;
  }
  return null;
}

/** 首条风控 Verdict 生效（巡检求值原语）。 */
export function firstRiskVerdict(
  rules: readonly RiskRule[],
  ctx: RiskRuleContext,
): RiskVerdict | null {
  for (const rule of rules) {
    const verdict = rule(ctx);
    if (verdict !== null) return verdict;
  }
  return null;
}
