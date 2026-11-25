/**
 * 黄金文件回放（REQ-ISO-04）。
 *
 * 场景输入 = (信号序列 + Bar 巡检序列)；输出 = 决策日志的规范化投影
 * （指令 / 拒绝 / 账户投影，bigint 转字符串、Date 转 ISO）。
 * 基线为版本化 fixture（trading/__fixtures__/*.json）：任何语义变化必须
 * 经 golden diff 显式审查；重生成基线必须显式 UPDATE_GOLDEN=1，禁止静默。
 */
import type { KernelSignal } from '../kernel/kernel.types';
import type {
  AccountSnapshot,
  AttributedSignal,
  MacroRegimeSnapshot,
  SignalGroupInput,
  TradeInstruction,
  TradingDecision,
  TradingPositionState,
} from './domain.types';
import { TradingEngine } from './engine';

/* ───────────────────────── 场景 DSL ───────────────────────── */

export interface GoldenSignalSpec {
  readonly key: string;
  readonly signalKind: 'entry' | 'exit';
  readonly signalType: string;
  readonly triggerPrice: number;
  readonly confidence?: number;
}

export interface GoldenGroupEvent {
  readonly kind: 'group';
  readonly tradingDay: string;
  readonly effectiveTime: string;
  readonly signals: readonly GoldenSignalSpec[];
  readonly macroRegime?: MacroRegimeSnapshot;
}

export interface GoldenSurveilEvent {
  readonly kind: 'surveil';
  readonly timestamp: string;
  readonly close: number;
  readonly macroRegime?: MacroRegimeSnapshot;
}

export type GoldenEvent = GoldenGroupEvent | GoldenSurveilEvent;

export interface GoldenScenario {
  readonly name: string;
  readonly securityId: number;
  readonly securityCode: string;
  /** 种子资金（整数厘，字符串序列化） */
  readonly seedCapitalLi: string;
  readonly events: readonly GoldenEvent[];
}

/* ───────────────────────── 序列化投影 ───────────────────────── */

export interface SerializedInstruction {
  readonly instructionId: string;
  readonly idempotencyKey: string;
  readonly action: string;
  readonly quantity: number;
  readonly referencePrice: number;
  readonly estimatedValueLi: string;
  readonly reason: string;
}

export interface SerializedRejection {
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly detail: string;
}

export interface SerializedAccount {
  readonly cashLi: string;
  readonly tradingDay: string;
  readonly positions: readonly {
    readonly securityId: number;
    readonly holdingQuantity: number;
    readonly costPriceLi: string;
    readonly currentPriceLi: string;
    readonly realizedPnlLi: string;
    readonly entryTime: string | null;
  }[];
}

export interface SerializedLogEntry {
  readonly event: string;
  readonly instructions: readonly SerializedInstruction[];
  readonly rejections: readonly SerializedRejection[];
  readonly accountAfter?: SerializedAccount;
}

function serializeInstruction(i: TradeInstruction): SerializedInstruction {
  return {
    instructionId: i.instructionId,
    idempotencyKey: i.idempotencyKey,
    action: i.action,
    quantity: i.quantity,
    referencePrice: i.referencePrice,
    estimatedValueLi: i.estimatedValueLi.toString(),
    reason: i.reason,
  };
}

export function serializeAccount(a: AccountSnapshot): SerializedAccount {
  return {
    cashLi: a.cashLi.toString(),
    tradingDay: a.tradingDay,
    positions: [...a.positions.values()].map((p) => ({
      securityId: p.securityId,
      holdingQuantity: p.holdingQuantity,
      costPriceLi: p.costPriceLi.toString(),
      currentPriceLi: p.currentPriceLi.toString(),
      realizedPnlLi: p.realizedPnlLi.toString(),
      entryTime: p.entryTime ? p.entryTime.toISOString() : null,
    })),
  };
}

/* ───────────────────────── 回放运行器 ───────────────────────── */

function buildSignal(spec: GoldenSignalSpec, signalTime: Date): KernelSignal {
  return {
    definitionId: 1,
    versionId: 1,
    signalKind: spec.signalKind,
    signalTime,
    triggerPrice: spec.triggerPrice,
    pivotTime: null,
    pivotPrice: null,
    signalType: spec.signalType,
    confidence: spec.confidence ?? 0.85,
    confidenceLevel: 'HIGH',
    decisionTrace: {},
    contextSnapshot: {},
    ruleSnapshot: {},
  };
}

function buildAttributed(
  spec: GoldenSignalSpec,
  signalTime: Date,
): AttributedSignal {
  return {
    idempotencyKey: spec.key,
    signal: buildSignal(spec, signalTime),
    attribution: {
      strategyName: 'golden',
      periodLabel: '30m',
      confidence: spec.confidence ?? 0.85,
      confidenceLevel: 'HIGH',
      traceChain: null,
    },
  };
}

function foldPositionFromAccount(
  account: AccountSnapshot,
  securityId: number,
): TradingPositionState | null {
  const p = account.positions.get(securityId);
  return p && p.holdingQuantity > 0 ? p : null;
}

/**
 * 回放场景：group 事件驱动 engine.decide（账户随假定成交推进，跨事件保持
 * T+1 语义）；surveil 事件驱动 engine.surveilBar（巡检指令不推进账本——
 * 回测中由撮合层真实成交，与执行端语义一致）。
 */
export function runGoldenScenario(
  scenario: GoldenScenario,
): readonly SerializedLogEntry[] {
  // 2026-11-25 拍板：引擎风控仅 systemicCrunch 常驻；硬止损走信号层
  // （PriceDefenseExitPlugin → PriceLevelExitPolicy → exit 信号），场景以
  // 显式 SELL 信号表达。
  const engine = new TradingEngine();

  let account: AccountSnapshot = {
    cashLi: BigInt(scenario.seedCapitalLi),
    positions: new Map(),
    tradingDay: '',
  };

  const log: SerializedLogEntry[] = [];
  for (const event of scenario.events) {
    if (event.kind === 'group') {
      const signals = event.signals.map((s) =>
        buildAttributed(s, new Date(event.effectiveTime)),
      );
      const group: SignalGroupInput = {
        securityId: scenario.securityId,
        securityCode: scenario.securityCode,
        effectiveTime: new Date(event.effectiveTime),
        tradingDay: event.tradingDay,
        signals,
      };
      // 账本交易日随事件推进（T+1 解冻依据）
      account = { ...account, tradingDay: event.tradingDay };
      const decision: TradingDecision = engine.decide(
        group,
        account,
        event.macroRegime,
      );
      account = decision.accountAfter;
      log.push({
        event: `group@${event.effectiveTime}`,
        instructions: decision.instructions.map(serializeInstruction),
        rejections: decision.rejections.map((r) => ({
          idempotencyKey: r.idempotencyKey,
          reason: r.reason,
          detail: r.detail,
        })),
        accountAfter: serializeAccount(account),
      });
    } else {
      const position = foldPositionFromAccount(account, scenario.securityId);
      const instructions = engine.surveilBar(
        {
          securityId: scenario.securityId,
          securityCode: scenario.securityCode,
          timestamp: new Date(event.timestamp),
          close: event.close,
        },
        position,
        event.macroRegime,
      );
      log.push({
        event: `surveil@${event.timestamp}@${event.close}`,
        instructions: instructions.map(serializeInstruction),
        rejections: [],
      });
    }
  }
  return log;
}
