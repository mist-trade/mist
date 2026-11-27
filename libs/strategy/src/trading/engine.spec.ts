/**
 * TradingEngine 与 buildTradingManual 单测（两阶段同向归并 + 先出后进 + 确定性主锚点 + 无置信度渲染）。
 */
import { TradingEngine } from './engine';
import { buildTradingManual } from './manual';
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
    decisionTrace: {},
    contextSnapshot: {},
    ruleSnapshot: {},
    ...overrides,
  };
}

function attributed(
  key: string,
  signal: KernelSignal,
  overrides: Partial<AttributedSignal['attribution']> = {},
): AttributedSignal {
  return {
    idempotencyKey: key,
    signal,
    attribution: {
      strategyName: '全共振战术',
      periodLabel: '30m',
      traceChain: 'regime ✓ → chan ✓',
      ...overrides,
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

  describe('REQ-ENGINE-02 先出后进 + 两阶段同向归并', () => {
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

    it('同组多 EXIT + 多 ENTRY 归并为 1 SELL + 1 BUY，完整保留 contributors 且零假拒绝', () => {
      const held: TradingPositionState = {
        securityId: 1,
        securityCode: '000001',
        holdingQuantity: 8000,
        costPriceLi: yuanToLi(10),
        entryTime: new Date('2026-01-14T07:00:00Z'),
        currentPriceLi: yuanToLi(12),
        realizedPnlLi: 0n,
      };
      const exit30 = attributed(
        'offline-1-30-exit',
        makeSignal({
          definitionId: 1,
          triggerPeriod: 30,
          signalKind: 'exit',
          signalType: 'VIRTUAL_EXIT',
          triggerPrice: 12.1,
        }),
        { strategyName: '策略A', periodLabel: '30m', traceChain: '防守止盈 ✓' },
      );
      const exit1440 = attributed(
        'offline-2-1440-exit',
        makeSignal({
          definitionId: 2,
          triggerPeriod: 1440,
          signalKind: 'exit',
          signalType: 'CHAN_SECOND_SELL',
          triggerPrice: 12.2,
        }),
        {
          strategyName: '策略B',
          periodLabel: '日线',
          traceChain: '缠论二卖 ✓',
        },
      );
      const entry30 = attributed(
        'offline-3-30-entry',
        makeSignal({
          definitionId: 3,
          triggerPeriod: 30,
          signalKind: 'entry',
          signalType: 'CHAN_FIRST_BUY',
          triggerPrice: 12.3,
        }),
        { strategyName: '策略C', periodLabel: '30m', traceChain: '一买门禁 ✓' },
      );
      const entry1440 = attributed(
        'offline-4-1440-entry',
        makeSignal({
          definitionId: 4,
          triggerPeriod: 1440,
          signalKind: 'entry',
          signalType: 'GOLDEN_POCKET',
          triggerPrice: 12.4,
        }),
        {
          strategyName: '策略D',
          periodLabel: '日线',
          traceChain: '黄金口袋 ✓',
        },
      );

      const decision = engine.decide(
        groupOf([entry30, exit30, entry1440, exit1440]),
        snapshot(new Map([[1, held]]), yuanToLi(100_000)),
      );

      expect(decision.rejections).toHaveLength(0);
      expect(decision.instructions).toHaveLength(2);

      const sell = decision.instructions[0];
      expect(sell.action).toBe('SELL');
      expect(sell.quantity).toBe(8000);
      expect(sell.idempotencyKey).toBe('offline-2-1440-exit');
      expect(sell.instructionId).toBe('ti-offline-2-1440-exit');
      expect(sell.referencePrice).toBe(12.2);
      expect(sell.reason).toBe('CHAN_SECOND_SELL + VIRTUAL_EXIT');
      expect(sell.contributors?.map((c) => c.idempotencyKey)).toEqual([
        'offline-2-1440-exit',
        'offline-1-30-exit',
      ]);

      const buy = decision.instructions[1];
      expect(buy.action).toBe('BUY');
      expect(buy.idempotencyKey).toBe('offline-4-1440-entry');
      expect(buy.instructionId).toBe('ti-offline-4-1440-entry');
      expect(buy.referencePrice).toBe(12.4);
      expect(buy.reason).toBe('GOLDEN_POCKET + CHAN_FIRST_BUY');
      expect(buy.contributors?.map((c) => c.idempotencyKey)).toEqual([
        'offline-4-1440-entry',
        'offline-3-30-entry',
      ]);
    });

    it('同组有效 ENTRY + triggerPrice<=0 破坏性 ENTRY：无效价格单独拒单，有效 ENTRY 正常成单', () => {
      const badEntry = attributed(
        'evt-bad-entry',
        makeSignal({ signalKind: 'entry', triggerPrice: 0 }),
      );
      const validEntry = attributed(
        'evt-good-entry',
        makeSignal({ signalKind: 'entry', triggerPrice: 12.5 }),
      );

      const decision = engine.decide(
        groupOf([badEntry, validEntry]),
        snapshot(),
      );

      expect(decision.instructions).toHaveLength(1);
      expect(decision.instructions[0].idempotencyKey).toBe('evt-good-entry');
      expect(decision.rejections).toHaveLength(1);
      expect(decision.rejections[0].idempotencyKey).toBe('evt-bad-entry');
      expect(decision.rejections[0].reason).toBe('INVALID_PRICE');
    });

    it('同组有效 EXIT + triggerPrice<=0 破坏性 EXIT：无效价格单独拒单，有效 EXIT 正常平仓', () => {
      const held: TradingPositionState = {
        securityId: 1,
        securityCode: '000001',
        holdingQuantity: 4000,
        costPriceLi: yuanToLi(10),
        entryTime: new Date('2026-01-14T07:00:00Z'),
        currentPriceLi: yuanToLi(12),
        realizedPnlLi: 0n,
      };
      const badExit = attributed(
        'evt-bad-exit',
        makeSignal({
          signalKind: 'exit',
          signalType: 'CHAN_FIRST_SELL',
          triggerPrice: -2,
        }),
      );
      const validExit = attributed(
        'evt-good-exit',
        makeSignal({
          signalKind: 'exit',
          signalType: 'CHAN_SECOND_SELL',
          triggerPrice: 12.5,
        }),
      );

      const decision = engine.decide(
        groupOf([badExit, validExit]),
        snapshot(new Map([[1, held]])),
      );

      expect(decision.instructions).toHaveLength(1);
      expect(decision.instructions[0].action).toBe('SELL');
      expect(decision.instructions[0].idempotencyKey).toBe('evt-good-exit');
      expect(decision.instructions[0].quantity).toBe(4000);
      expect(decision.rejections).toHaveLength(1);
      expect(decision.rejections[0].idempotencyKey).toBe('evt-bad-exit');
      expect(decision.rejections[0].reason).toBe('INVALID_PRICE');
      expect(decision.accountAfter.positions.has(1)).toBe(false);
    });

    it('实时正整数 alertEventId 主锚点按数值升序（"2" 胜出 "10"）', () => {
      const sig10 = attributed(
        '10',
        makeSignal({ signalType: 'TYPE_10', triggerPrice: 12.0 }),
      );
      const sig2 = attributed(
        '2',
        makeSignal({ signalType: 'TYPE_2', triggerPrice: 12.5 }),
      );

      const decision = engine.decide(groupOf([sig10, sig2]), snapshot());

      expect(decision.instructions).toHaveLength(1);
      expect(decision.instructions[0].idempotencyKey).toBe('2');
      expect(decision.instructions[0].instructionId).toBe('ti-2');
      expect(decision.instructions[0].referencePrice).toBe(12.5);
      expect(
        decision.instructions[0].contributors?.map((c) => c.idempotencyKey),
      ).toEqual(['2', '10']);
    });

    it('全部同向有效 ENTRY 被持仓门禁拒绝时产 1 条归并拒绝并携带全员 contributors', () => {
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
        groupOf([
          attributed('10', makeSignal({ signalType: 'FIRST_BUY' })),
          attributed('2', makeSignal({ signalType: 'SECOND_BUY' })),
        ]),
        snapshot(new Map([[1, held]])),
      );

      expect(decision.instructions).toHaveLength(0);
      expect(decision.rejections).toHaveLength(1);
      expect(decision.rejections[0].idempotencyKey).toBe('2');
      expect(decision.rejections[0].reason).toBe('ALREADY_HOLDING');
      expect(
        decision.rejections[0].contributors?.map((c) => c.idempotencyKey),
      ).toEqual(['2', '10']);
    });

    it('全部同向有效 EXIT 被 T+1 冻结拒绝时产 1 条归并拒绝并携带全员 contributors', () => {
      const heldToday: TradingPositionState = {
        securityId: 1,
        securityCode: '000001',
        holdingQuantity: 1000,
        costPriceLi: yuanToLi(10),
        entryTime: SIGNAL_TIME,
        currentPriceLi: yuanToLi(12),
        realizedPnlLi: 0n,
      };
      const decision = engine.decide(
        groupOf([
          attributed(
            '20',
            makeSignal({ signalKind: 'exit', signalType: 'SELL_A' }),
          ),
          attributed(
            '3',
            makeSignal({ signalKind: 'exit', signalType: 'SELL_B' }),
          ),
        ]),
        snapshot(new Map([[1, heldToday]])),
      );

      expect(decision.instructions).toHaveLength(0);
      expect(decision.rejections).toHaveLength(1);
      expect(decision.rejections[0].idempotencyKey).toBe('3');
      expect(decision.rejections[0].reason).toBe('T1_FROZEN');
      expect(
        decision.rejections[0].contributors?.map((c) => c.idempotencyKey),
      ).toEqual(['3', '20']);
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
  });

  describe('buildTradingManual（无置信度徽标 + 多贡献者共振渲染）', () => {
    it('单贡献者指令无置信度徽标', () => {
      const decision = engine.decide(
        groupOf([
          attributed(
            'evt-1',
            makeSignal({ triggerPrice: 12.5, signalType: 'first_buy' }),
            {
              strategyName: '策略A',
              periodLabel: '30m',
              traceChain: '主门禁 ✓ → 买点因子 ✓',
            },
          ),
        ]),
        snapshot(new Map(), yuanToLi(105_264)), // 95% ≈ 100,000 → 8,000 股
      );
      const manual = buildTradingManual({
        securityCode: '000001',
        securityName: '平安银行',
        securityId: 1,
        effectiveTime: SIGNAL_TIME,
        decision,
      });

      expect(manual).toContain(
        '▶ 买入 8,000股 @ 12.50 ≈ 100,000 ｜ 策略A 30m first_buy\n    主门禁 ✓ → 买点因子 ✓',
      );
      expect(manual).not.toMatch(/\[(HIGH|MEDIUM|LOW|CONF)\s/);
      expect(manual).not.toContain('%');
    });

    it('多贡献者共振指令展示 共振(N) 与编号归因链，多贡献者拒绝展示 共振(N)', () => {
      const sigA = attributed(
        'offline-1-30-a',
        makeSignal({
          definitionId: 1,
          triggerPeriod: 30,
          triggerPrice: 12.5,
          signalType: 'first_buy',
        }),
        {
          strategyName: '策略A',
          periodLabel: '30m',
          traceChain: '主门禁 ✓ → 买点因子 ✓',
        },
      );
      const sigB = attributed(
        'offline-2-1440-b',
        makeSignal({
          definitionId: 2,
          triggerPeriod: 1440,
          triggerPrice: 12.5,
          signalType: 'golden_pocket',
        }),
        {
          strategyName: '策略B',
          periodLabel: '日线',
          traceChain: '趋势过滤 ✓ → 回撤因子 ✓',
        },
      );
      const buyDecision = engine.decide(
        groupOf([sigA, sigB]),
        snapshot(new Map(), yuanToLi(105_264)),
      );
      const buyManual = buildTradingManual({
        securityCode: '000001',
        securityName: '平安银行',
        securityId: 1,
        effectiveTime: SIGNAL_TIME,
        decision: buyDecision,
      });

      expect(buyManual).toContain(
        '▶ 买入 8,000股 @ 12.50 ≈ 100,000 ｜ 共振(2): 策略B 日线 golden_pocket + 策略A 30m first_buy',
      );
      expect(buyManual).toContain(
        '    [1] 策略B 日线: 趋势过滤 ✓ → 回撤因子 ✓',
      );
      expect(buyManual).toContain('    [2] 策略A 30m: 主门禁 ✓ → 买点因子 ✓');
      expect(buyManual).not.toContain('%');

      // 持仓状态下再收双入场信号 → 合并拒绝标注 共振(2)
      const rejectDecision = engine.decide(
        groupOf([sigA, sigB]),
        buyDecision.accountAfter,
      );
      const rejectManual = buildTradingManual({
        securityCode: '000001',
        securityName: '平安银行',
        securityId: 1,
        effectiveTime: SIGNAL_TIME,
        decision: rejectDecision,
      });
      expect(rejectManual).toContain(
        '✗ 买入已拒绝：ALREADY_HOLDING（虚拟账户已持仓 8000 股（成本 12500 厘））｜ 共振(2): 策略B 日线 golden_pocket + 策略A 30m first_buy',
      );
      expect(rejectManual).not.toContain('%');
    });

    it('多标持仓且未传 securityId 时头行回退空仓而不误取首标；传入 securityId 精准定位', () => {
      const snap = snapshot(
        new Map<number, TradingPositionState>([
          [
            1,
            {
              securityId: 1,
              securityCode: '000001',
              holdingQuantity: 1000,
              costPriceLi: yuanToLi(10),
              currentPriceLi: yuanToLi(10),
              realizedPnlLi: 0n,
            },
          ],
          [
            2,
            {
              securityId: 2,
              securityCode: '600519',
              holdingQuantity: 200,
              costPriceLi: yuanToLi(1500),
              currentPriceLi: yuanToLi(1500),
              realizedPnlLi: 0n,
            },
          ],
        ]),
      );
      const decision = {
        instructions: [],
        rejections: [],
        accountAfter: snap,
      };

      const withoutId = buildTradingManual({
        securityCode: '600519',
        securityName: '贵州茅台',
        effectiveTime: SIGNAL_TIME,
        decision,
      });
      expect(withoutId).toContain(' / 空仓');
      expect(withoutId).not.toContain('1,000股');

      const withId = buildTradingManual({
        securityId: 2,
        securityCode: '600519',
        securityName: '贵州茅台',
        effectiveTime: SIGNAL_TIME,
        decision,
      });
      expect(withId).toContain('持仓 200股 @ 1500.00');
    });

    it('RISK_CUT 拒单按卖出方向渲染，而非误判 signalKind', () => {
      const riskCutSignal = attributed(
        'evt-risk-cut',
        makeSignal({
          signalKind: 'entry',
          intent: 'RISK_CUT',
          signalType: 'SYSTEMIC_RISK',
          triggerPrice: 12.0,
        }),
      );
      const decision = engine.decide(groupOf([riskCutSignal]), snapshot());
      const manual = buildTradingManual({
        securityCode: '000001',
        securityName: '平安银行',
        securityId: 1,
        effectiveTime: SIGNAL_TIME,
        decision,
      });
      expect(manual).toContain('✗ 卖出已拒绝：NO_POSITION');
    });
  });

  describe('虚拟账本投影与 foldVirtualFills 口径一致（buy fees 分摊 + realizedPnl 跨回合累计）', () => {
    it('买入记录 accumulatedBuyFeesLi，部分卖出按比例扣减已分摊买费并保留剩余买费', () => {
      const partialSellEngine = new TradingEngine({
        exitRules: [
          (ctx) =>
            ctx.position
              ? {
                  action: 'INSTRUCT',
                  side: 'SELL',
                  quantity: Math.floor(ctx.position.holdingQuantity / 2),
                  reason: 'PARTIAL_EXIT',
                }
              : null,
        ],
      });

      const buyDecision = partialSellEngine.decide(
        groupOf([
          attributed(
            'evt-buy-partial',
            makeSignal({ triggerPrice: 10.0, signalType: 'BUY_A' }),
          ),
        ]),
        snapshot(new Map(), yuanToLi(21_100)), // 21,100 × 0.95 = 20,045 → 2000 股
      );
      const boughtPos = buyDecision.accountAfter.positions.get(1)!;
      expect(boughtPos.holdingQuantity).toBe(2000);
      // 成交额 20,000 元 = 20,000,000 厘；佣金 5000 厘 + 过户费 200 厘 = 5200 厘
      expect(boughtPos.accumulatedBuyFeesLi).toBe(5200n);

      // 次日半仓卖出 1000 股 @ 11.00
      const nextDayHeld: TradingPositionState = {
        ...boughtPos,
        entryTime: new Date('2026-01-14T07:00:00Z'),
      };
      const sellDecision = partialSellEngine.decide(
        groupOf([
          attributed(
            'evt-sell-partial',
            makeSignal({
              signalKind: 'exit',
              signalType: 'PARTIAL_EXIT',
              triggerPrice: 11.0,
            }),
          ),
        ]),
        {
          cashLi: buyDecision.accountAfter.cashLi,
          positions: new Map([[1, nextDayHeld]]),
          tradingDay: TRADING_DAY,
        },
      );
      const remPos = sellDecision.accountAfter.positions.get(1)!;
      expect(remPos.holdingQuantity).toBe(1000);
      // 卖出 1000 股 @ 11 = 11,000,000；卖费 = 保底5000 + 过户110 + 印花5500 = 10,610
      // 成本 10,000,000；分摊买费 5200 * 1000 / 2000 = 2600
      // realizedPnlLi = (11,000,000 - 10,610) - 10,000,000 - 2,600 = 986,790
      expect(remPos.realizedPnlLi).toBe(986790n);
      expect(remPos.accumulatedBuyFeesLi).toBe(2600n);
    });

    it('先出后进同组及已有 realizedPnl 状态重仓入场均累计 realizedPnlLi', () => {
      const buyFirst = engine.decide(
        groupOf([
          attributed(
            'evt-b1',
            makeSignal({ triggerPrice: 10.0, signalType: 'BUY_1' }),
          ),
        ]),
        snapshot(),
      );
      const nextDayHeld: TradingPositionState = {
        ...buyFirst.accountAfter.positions.get(1)!,
        entryTime: new Date('2026-01-14T07:00:00Z'),
      };
      const sellThenBuy = engine.decide(
        groupOf([
          attributed(
            'evt-s1',
            makeSignal({
              signalKind: 'exit',
              signalType: 'SELL_1',
              triggerPrice: 12.34,
            }),
          ),
          attributed(
            'evt-b2',
            makeSignal({
              signalKind: 'entry',
              signalType: 'BUY_2',
              triggerPrice: 12.34,
            }),
          ),
        ]),
        snapshot(new Map([[1, nextDayHeld]]), buyFirst.accountAfter.cashLi),
      );
      const reEntered = sellThenBuy.accountAfter.positions.get(1)!;
      expect(reEntered.holdingQuantity).toBe(94000);
      // 与 foldVirtualFills 一致：(1172300000 - 890948) - 950000000 - 247000 = 221,162,052
      expect(reEntered.realizedPnlLi).toBe(221_162_052n);

      // 若传入的已平仓快照位（holdingQuantity=0）携带累计 realizedPnlLi，再次入场不得硬重置为 0n
      const carriedClosed: TradingPositionState = {
        securityId: 1,
        securityCode: '000001',
        holdingQuantity: 0,
        costPriceLi: 0n,
        currentPriceLi: yuanToLi(12.0),
        realizedPnlLi: 500_000n,
      };
      const reEntryFromClosed = engine.decide(
        groupOf([attributed('evt-b3', makeSignal({ triggerPrice: 10.0 }))]),
        snapshot(new Map([[1, carriedClosed]])),
      );
      expect(
        reEntryFromClosed.accountAfter.positions.get(1)?.realizedPnlLi,
      ).toBe(500_000n);
    });

    it('隔离 NaN / <=0 坏价格信号，不污染同向有效共振伙伴', () => {
      const nanEntry = attributed(
        'evt-nan',
        makeSignal({ signalKind: 'entry', triggerPrice: Number.NaN }),
      );
      const zeroRiskCut = attributed(
        'evt-zero-risk',
        makeSignal({
          signalKind: 'entry',
          intent: 'RISK_CUT',
          triggerPrice: 0,
        }),
      );
      const validEntry = attributed(
        'evt-valid',
        makeSignal({ signalKind: 'entry', triggerPrice: 10.0 }),
      );

      const decision = engine.decide(
        groupOf([nanEntry, zeroRiskCut, validEntry]),
        snapshot(),
      );
      expect(decision.instructions).toHaveLength(1);
      expect(decision.instructions[0].idempotencyKey).toBe('evt-valid');
      expect(decision.rejections).toHaveLength(2);
      expect(decision.rejections.map((r) => r.idempotencyKey)).toEqual([
        'evt-zero-risk',
        'evt-nan',
      ]);
      expect(
        decision.rejections.every((r) => r.reason === 'INVALID_PRICE'),
      ).toBe(true);
    });
  });
});
