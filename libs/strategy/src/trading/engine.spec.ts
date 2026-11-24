/**
 * TradingEngine 单测（REQ-ENGINE-01/02/03/04/05/07 + REQ-ISO-02）。
 */
import { TradingEngine } from './engine';
import { createDefaultRiskRules } from './rules';
import { sellFirstByConfidence } from './ordering';
import { createAllInWithBuffer } from './sizing';
import { MarketRiskRegime } from './domain.types';
import type {
  AccountSnapshot,
  AttributedSignal,
  SignalGroupInput,
  TradingPositionState,
} from './domain.types';
import type { KernelSignal } from '../kernel/kernel.types';
import { yuanToLi } from './money';

const SEED_LI = 1_000_000_000n; // 100 万元
const TRADING_DAY = '2026-01-15';
const SIGNAL_TIME = new Date('2026-01-15T07:35:00Z'); // 15:35 CST

function makeSignal(overrides: Partial<KernelSignal> = {}): KernelSignal {
  return {
    definitionId: 1,
    versionId: 1,
    signalKind: 'entry',
    signalTime: SIGNAL_TIME,
    triggerPrice: 12.34,
    pivotTime: null,
    pivotPrice: null,
    signalType: 'CHAN_SECOND_BUY',
    confidence: 0.88,
    confidenceLevel: 'HIGH',
    decisionTrace: {},
    contextSnapshot: {},
    ruleSnapshot: {},
    ...overrides,
  };
}

function attributed(
  key: string,
  signal: KernelSignal,
  confidence = signal.confidence,
): AttributedSignal {
  return {
    idempotencyKey: key,
    signal,
    attribution: {
      strategyName: '全共振战术',
      periodLabel: '30m',
      confidence,
      confidenceLevel: 'HIGH',
      traceChain: 'regime ✓ → chan ✓',
    },
  };
}

function groupOf(
  signals: readonly AttributedSignal[],
  securityCode = '000001',
): SignalGroupInput {
  return {
    securityId: 1,
    securityCode,
    effectiveTime: SIGNAL_TIME,
    tradingDay: TRADING_DAY,
    signals,
  };
}

function snapshot(
  positions: ReadonlyMap<number, TradingPositionState> = new Map(),
  cashLi = SEED_LI,
): AccountSnapshot {
  return { cashLi, positions, tradingDay: TRADING_DAY };
}

describe('TradingEngine', () => {
  const engine = new TradingEngine();

  describe('REQ-ENGINE-01 纯函数确定性', () => {
    it('同输入重放 N 次，决策深比较恒等且不改入参快照', () => {
      const group = groupOf([attributed('evt-1', makeSignal())]);
      const snap = snapshot();
      const snapClone = new Map(snap.positions);
      const d1 = engine.decide(group, snap);
      const d2 = engine.decide(group, snap);
      expect(d1).toEqual(d2);
      expect(d1).not.toBe(d2);
      expect(snap.positions).toEqual(snapClone); // 入参不可变
      expect(snap.cashLi).toBe(SEED_LI);
    });
  });

  describe('REQ-ENGINE-02 先出后进 + 资金当刻可用', () => {
    it('同组 EXIT 先于 ENTRY，卖出释放资金可供后续买入', () => {
      const held: TradingPositionState = {
        securityId: 1,
        securityCode: '000001',
        holdingQuantity: 5000,
        costPriceLi: yuanToLi(10),
        entryTime: new Date('2026-01-14T07:00:00Z'), // 昨日建仓，非冻结
        currentPriceLi: yuanToLi(12.34),
        realizedPnlLi: 0n,
      };
      // 现金紧张：不足直接买入一手以上，必须先卖才够
      const poorCash = yuanToLi(50_000); // 5 万元
      const group = groupOf([
        attributed('evt-buy', makeSignal({ signalKind: 'entry' })),
        attributed(
          'evt-sell',
          makeSignal({ signalKind: 'exit', signalType: 'CHAN_SECOND_SELL' }),
        ),
      ]);
      const decision = engine.decide(
        group,
        snapshot(new Map([[1, held]]), poorCash),
      );

      // 卖出行必须先于买入行
      expect(decision.instructions).toHaveLength(2);
      expect(decision.instructions[0].action).toBe('SELL');
      expect(decision.instructions[1].action).toBe('BUY');
      expect(decision.rejections).toHaveLength(0);

      // 卖出净额回补现金后买入成功，且终态现金为正
      expect(decision.accountAfter.cashLi).toBeGreaterThan(0n);
      const buy = decision.instructions[1];
      expect(buy.quantity).toBeGreaterThan(0);
    });

    it('平局规则：同 kind 按置信度降序、同置信度按幂等键字典序', () => {
      const a = attributed('evt-b', makeSignal({ signalType: 'A' }), 0.9);
      const b = attributed('evt-a', makeSignal({ signalType: 'B' }), 0.9);
      const ordered = sellFirstByConfidence.order([a, b]);
      expect(ordered.map((s) => s.idempotencyKey)).toEqual(['evt-a', 'evt-b']);
    });
  });

  describe('REQ-ENGINE-04 拒绝必须显式', () => {
    it('已持仓时入场 → ALREADY_HOLDING', () => {
      const held: TradingPositionState = {
        securityId: 1,
        securityCode: '000001',
        holdingQuantity: 1000,
        costPriceLi: yuanToLi(10),
        entryTime: new Date('2026-01-10T07:00:00Z'),
        currentPriceLi: yuanToLi(12),
        realizedPnlLi: 0n,
      };
      const decision = engine.decide(
        groupOf([attributed('evt-1', makeSignal())]),
        snapshot(new Map([[1, held]])),
      );
      expect(decision.instructions).toHaveLength(0);
      expect(decision.rejections[0].reason).toBe('ALREADY_HOLDING');
    });

    it('空仓时出场 → NO_POSITION', () => {
      const decision = engine.decide(
        groupOf([
          attributed(
            'evt-1',
            makeSignal({ signalKind: 'exit', signalType: 'CHAN_SECOND_SELL' }),
          ),
        ]),
        snapshot(),
      );
      expect(decision.instructions).toHaveLength(0);
      expect(decision.rejections[0].reason).toBe('NO_POSITION');
    });

    it('资金不足一手 → BELOW_LOT', () => {
      const poorCash = yuanToLi(1_000); // 1000 元，12.34 元/股不足一手
      const decision = engine.decide(
        groupOf([attributed('evt-1', makeSignal())]),
        snapshot(new Map(), poorCash),
      );
      expect(decision.rejections[0].reason).toBe('BELOW_LOT');
    });
  });

  describe('REQ-LEDGER-04 指令即成交（整数厘含费推进）', () => {
    it('买入按 referencePrice 全额成交，现金扣减含手续费，instructionId 业务键派生', () => {
      const decision = engine.decide(
        groupOf([attributed('evt-42', makeSignal())]),
        snapshot(),
      );
      const inst = decision.instructions[0];
      expect(inst.instructionId).toBe('ti-evt-42');
      expect(inst.action).toBe('BUY');
      expect(inst.quantity).toBe(76900); // 950000 元 / 12.34 / 100 → 769 手
      expect(inst.estimatedValueLi).toBe(yuanToLi(12.34) * 76900n);

      // 现金扣减 = 成交额 + 佣金 + 过户费
      const turnoverLi = inst.estimatedValueLi;
      const commissionLi = 237237n; // 948946 元 × 0.00025 = 237.2365 元 → 237237 厘
      const transferLi = 9489n; // × 0.00001 = 9.48946 元 → 9489 厘
      expect(decision.accountAfter.cashLi).toBe(
        SEED_LI - turnoverLi - commissionLi - transferLi,
      );

      // 持仓推进：数量/成本/入场时间
      const pos = decision.accountAfter.positions.get(1);
      expect(pos?.holdingQuantity).toBe(76900);
      expect(pos?.costPriceLi).toBe(yuanToLi(12.34));
      expect(pos?.entryTime).toEqual(SIGNAL_TIME);
    });

    it('同日买入后同日卖出 → T1_FROZEN（REQ-LEDGER-04 / T+1）', () => {
      // 第一次 decide 建仓
      const first = engine.decide(
        groupOf([attributed('evt-buy', makeSignal())]),
        snapshot(),
      );
      // 同一交易日第二次 decide 收到出场信号
      const second = engine.decide(
        groupOf([
          attributed(
            'evt-sell',
            makeSignal({ signalKind: 'exit', signalType: 'CHAN_SECOND_SELL' }),
          ),
        ]),
        first.accountAfter,
      );
      expect(second.instructions).toHaveLength(0);
      expect(second.rejections[0].reason).toBe('T1_FROZEN');
    });

    it('次日卖出：全平、实现盈亏入账、现金回补', () => {
      const first = engine.decide(
        groupOf([attributed('evt-buy', makeSignal())]),
        snapshot(),
      );
      const nextDay = first.accountAfter.tradingDay;
      void nextDay;
      const held = first.accountAfter.positions.get(1)!;
      // 构造次日快照：entryTime 已是昨日（T+1 解冻），现价上涨
      const sold: TradingPositionState = {
        ...held,
        entryTime: new Date('2026-01-14T07:00:00Z'),
      };
      const decision = engine.decide(
        groupOf([
          attributed(
            'evt-sell',
            makeSignal({
              signalKind: 'exit',
              signalType: 'CHAN_SECOND_SELL',
              triggerPrice: 13.0,
            }),
          ),
        ]),
        snapshot(new Map([[1, sold]]), first.accountAfter.cashLi),
      );
      const sell = decision.instructions[0];
      expect(sell.action).toBe('SELL');
      expect(sell.quantity).toBe(76900);
      expect(sell.reason).toBe('CHAN_SECOND_SELL');
      // 全平后持仓清空
      expect(decision.accountAfter.positions.has(1)).toBe(false);
      // 现金回补 = 卖出净额（成交额 - 印花税 - 佣金 - 过户费），必然高于卖出前
      expect(decision.accountAfter.cashLi).toBeGreaterThan(
        first.accountAfter.cashLi,
      );
    });
  });

  describe('仓位策略（REQ-ENGINE-03 与裁决分离）', () => {
    it('ELEVATED_RISK 开仓预算减半', () => {
      const sizing = createAllInWithBuffer(0.95);
      const normal = sizing({
        cashLi: SEED_LI,
        priceLi: yuanToLi(12.34),
        lotSize: 100,
      });
      const elevated = sizing({
        cashLi: SEED_LI,
        priceLi: yuanToLi(12.34),
        lotSize: 100,
        macroRegime: {
          regime: MarketRiskRegime.ELEVATED_RISK,
          marketAtrPercentile: 0.9,
          isLiquidityFrozen: false,
        },
      });
      expect(normal.quantity).toBe(76900);
      expect(elevated.quantity).toBe(38400); // 475000/12.34 → 384.9 → 384 手
    });
  });

  describe('surveilBar（per-bar 风控巡检）', () => {
    const held: TradingPositionState = {
      securityId: 1,
      securityCode: '000001',
      holdingQuantity: 5000,
      costPriceLi: yuanToLi(10),
      entryTime: new Date('2026-01-10T07:00:00Z'),
      currentPriceLi: yuanToLi(10),
      realizedPnlLi: 0n,
    };

    it('无引擎硬止损默认零巡检产出（零死板止损准则）', () => {
      const out = engine.surveilBar(
        {
          securityId: 1,
          securityCode: '000001',
          timestamp: SIGNAL_TIME,
          close: 9.0,
        },
        held,
      );
      expect(out).toEqual([]);
    });

    it('SYSTEMIC_CRUNCH → 保护性清仓指令', () => {
      const crunch = new TradingEngine();
      const out = crunch.surveilBar(
        {
          securityId: 1,
          securityCode: '000001',
          timestamp: SIGNAL_TIME,
          close: 9.0,
        },
        held,
        {
          regime: MarketRiskRegime.SYSTEMIC_CRUNCH,
          marketAtrPercentile: 1,
          isLiquidityFrozen: false,
        },
      );
      expect(out).toHaveLength(1);
      expect(out[0].action).toBe('SELL');
      expect(out[0].quantity).toBe(5000);
      expect(out[0].reason).toBe('SYSTEMIC_RISK_MELTDOWN');
      expect(out[0].instructionId).toBe(
        `ti-risk-000001-${SIGNAL_TIME.getTime()}-systemic-crunch`,
      );
    });

    it('配置硬止损 -8% 且浮亏破线 → HARD_STOP_LOSS', () => {
      const stopEngine = new TradingEngine({
        riskRules: createDefaultRiskRules(-0.08),
      });
      const out = stopEngine.surveilBar(
        {
          securityId: 1,
          securityCode: '000001',
          timestamp: SIGNAL_TIME,
          close: 9.19,
        }, // -8.1%
        held,
      );
      expect(out).toHaveLength(1);
      expect(out[0].action).toBe('SELL');
      expect(out[0].quantity).toBe(5000);
      expect(out[0].reason).toBe('HARD_STOP_LOSS');

      // 未破线（-7.9%）→ 不产出
      const outAbove = stopEngine.surveilBar(
        {
          securityId: 1,
          securityCode: '000001',
          timestamp: SIGNAL_TIME,
          close: 9.21,
        },
        held,
      );
      expect(outAbove).toEqual([]);
    });
  });
});
