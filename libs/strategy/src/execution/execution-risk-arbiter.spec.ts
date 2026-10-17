import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '../kernel/kernel.types';
import type { PositionSnapshot } from '../position/position.types';
import {
  ORDER_SIDES,
  ORDER_TYPES,
  POSITION_STATUSES,
  SIGNAL_KINDS,
} from '../strategy.constants';
import {
  ExecutionRiskArbiter,
  MarketRiskRegime,
} from './execution-risk-arbiter';

function createBar(
  timestamp: string,
  close: number,
  securityCode = '600519',
): StrategyBar {
  return {
    securityId: 1,
    securityCode,
    source: 'tdx',
    period: 1440,
    timestamp: new Date(timestamp),
    open: close,
    high: close,
    low: close,
    close,
    volume: '10000',
    amount: '100000',
    type: 'complete',
  };
}

function createEmptyPosition(securityCode = '600519'): PositionSnapshot {
  return {
    status: POSITION_STATUSES.EMPTY,
    securityId: 1,
    securityCode,
    holdingQuantity: 0,
    costPrice: 0,
    holdingBars: 0,
    currentPrice: 0,
    marketValue: 0,
    unrealizedPnl: 0,
    unrealizedPnlRatio: 0,
    realizedPnl: 0,
  };
}

function createHoldingPosition(
  holdingQuantity: number,
  costPrice: number,
  currentPrice: number,
  securityCode = '600519',
): PositionSnapshot {
  const marketValue = holdingQuantity * currentPrice;
  const costBasis = holdingQuantity * costPrice;
  const unrealizedPnl = marketValue - costBasis;
  const unrealizedPnlRatio = costBasis > 0 ? unrealizedPnl / costBasis : 0;
  return {
    status: POSITION_STATUSES.HOLDING,
    securityId: 1,
    securityCode,
    holdingQuantity,
    costPrice,
    entryTime: new Date('2026-10-15T09:30:00.000Z'),
    holdingBars: 5,
    currentPrice,
    marketValue,
    unrealizedPnl,
    unrealizedPnlRatio,
    realizedPnl: 0,
  };
}

function createSignal(
  kind: typeof SIGNAL_KINDS.ENTRY | typeof SIGNAL_KINDS.EXIT,
  time = '2026-10-15T09:30:00.000Z',
  type = kind === SIGNAL_KINDS.ENTRY ? 'first_buy' : 'first_sell',
): KernelSignal {
  return {
    definitionId: 1,
    versionId: 1,
    signalKind: kind,
    signalTime: new Date(time),
    triggerTime: time,
    triggerPrice: 10.0,
    pivotTime: null,
    pivotPrice: null,
    signalType: type,
    confidence: 0.9,
    confidenceLevel: 'HIGH',
    decisionTrace: {},
    contextSnapshot: {},
    ruleSnapshot: {},
  };
}

describe('ExecutionRiskArbiter (统一动作与风控裁决器)', () => {
  let arbiter: ExecutionRiskArbiter;

  beforeEach(() => {
    arbiter = new ExecutionRiskArbiter({
      hardStopLossRatio: -0.08,
      defaultCooldownBars: 3,
      cashAllocationRatio: 0.995,
      lotSize: 100,
    });
  });

  describe('1. 开仓管卡裁决 (Entry Risk Gates)', () => {
    it('正常体制下 (NORMAL)，无持仓收到 ENTRY 信号按一手百股整手计算生成 BUY ORDER', () => {
      const bar = createBar('2026-10-15T09:30:00.000Z', 10.0);
      const signal = createSignal(SIGNAL_KINDS.ENTRY);
      const pos = createEmptyPosition();

      // 可用资金 100,000 元，按 0.995 分配为 99,500 元，股价 10 元，可买 9900 股
      const order = arbiter.arbitrate({
        bar,
        signal,
        position: pos,
        availableCash: 100_000,
        macroRegime: {
          regime: MarketRiskRegime.NORMAL,
          marketAtrPercentile: 0.3,
          isLiquidityFrozen: false,
        },
      });

      expect(order).not.toBeNull();
      expect(order?.side).toBe(ORDER_SIDES.BUY);
      expect(order?.orderType).toBe(ORDER_TYPES.MARKET);
      expect(order?.quantity).toBe(9900);
      expect(order?.signalTime).toEqual(signal.signalTime);
      expect(order?.securityCode).toBe('600519');
    });

    it('大盘突发雪崩体制 (SYSTEMIC_CRUNCH) 时，行使一票否决权 (Veto) 坚决拒单', () => {
      const bar = createBar('2026-10-15T09:30:00.000Z', 10.0);
      const signal = createSignal(SIGNAL_KINDS.ENTRY);
      const pos = createEmptyPosition();

      const order = arbiter.arbitrate({
        bar,
        signal,
        position: pos,
        availableCash: 100_000,
        macroRegime: {
          regime: MarketRiskRegime.SYSTEMIC_CRUNCH,
          marketAtrPercentile: 0.95,
          isLiquidityFrozen: false,
        },
      });

      expect(order).toBeNull();
    });

    it('市场流动性冻结 (isLiquidityFrozen = true) 时，直接拒绝开仓', () => {
      const bar = createBar('2026-10-15T09:30:00.000Z', 10.0);
      const signal = createSignal(SIGNAL_KINDS.ENTRY);
      const pos = createEmptyPosition();

      const order = arbiter.arbitrate({
        bar,
        signal,
        position: pos,
        availableCash: 100_000,
        macroRegime: {
          regime: MarketRiskRegime.NORMAL,
          marketAtrPercentile: 0.5,
          isLiquidityFrozen: true,
        },
      });

      expect(order).toBeNull();
    });

    it('高波动预警体制 (ELEVATED_RISK) 下，开仓预算减半防范回撤', () => {
      const bar = createBar('2026-10-15T09:30:00.000Z', 10.0);
      const signal = createSignal(SIGNAL_KINDS.ENTRY);
      const pos = createEmptyPosition();

      // 预算减半：100,000 * 0.995 * 0.5 = 49,750 元，股价 10 元，可买 4900 股
      const order = arbiter.arbitrate({
        bar,
        signal,
        position: pos,
        availableCash: 100_000,
        macroRegime: {
          regime: MarketRiskRegime.ELEVATED_RISK,
          marketAtrPercentile: 0.85,
          isLiquidityFrozen: false,
        },
      });

      expect(order).not.toBeNull();
      expect(order?.quantity).toBe(4900);
    });

    it('资金不足一手（100股）时拒单返回 null', () => {
      const bar = createBar('2026-10-15T09:30:00.000Z', 100.0);
      const signal = createSignal(SIGNAL_KINDS.ENTRY);
      const pos = createEmptyPosition();

      // 可用资金仅 500 元，股价 100 元，不足一手
      const order = arbiter.arbitrate({
        bar,
        signal,
        position: pos,
        availableCash: 500,
      });

      expect(order).toBeNull();
    });

    it('处于持仓状态时收到 ENTRY 信号不重复开仓', () => {
      const bar = createBar('2026-10-15T09:30:00.000Z', 10.0);
      const signal = createSignal(SIGNAL_KINDS.ENTRY);
      const pos = createHoldingPosition(1000, 10.0, 10.0);

      const order = arbiter.arbitrate({
        bar,
        signal,
        position: pos,
        availableCash: 100_000,
      });

      expect(order).toBeNull();
    });
  });

  describe('2. 平仓管卡三级单一出口裁决 (Exit Risk Hierarchies)', () => {
    it('优先级 1 (系统生存级)：大盘突发雪崩 SYSTEMIC_CRUNCH，无条件紧急清仓', () => {
      const bar = createBar('2026-10-15T10:00:00.000Z', 12.0);
      // 哪怕当前浮盈 +20% 且收到买点形态，依然最高优先级清仓
      const signal = createSignal(SIGNAL_KINDS.ENTRY);
      const pos = createHoldingPosition(1000, 10.0, 12.0);

      const order = arbiter.arbitrate({
        bar,
        signal,
        position: pos,
        availableCash: 50_000,
        macroRegime: {
          regime: MarketRiskRegime.SYSTEMIC_CRUNCH,
          marketAtrPercentile: 0.99,
          isLiquidityFrozen: false,
        },
      });

      expect(order).not.toBeNull();
      expect(order?.side).toBe(ORDER_SIDES.SELL);
      expect(order?.quantity).toBe(1000);
      expect(order?.exitReason).toBe('SYSTEMIC_RISK_MELTDOWN');
      expect(order?.signalTime).toEqual(bar.timestamp);
    });

    it('优先级 2 (持仓风控级)：个股浮亏跌破硬止损阈值 (-8%)，执行止损斩仓并激活冷静期', () => {
      // 成本 10.0，跌至 9.10 元 (-9% 浮亏)
      const bar = createBar('2026-10-15T10:00:00.000Z', 9.1);
      const pos = createHoldingPosition(1000, 10.0, 9.1);

      expect(arbiter.getCooldownRemainingBars()).toBe(0);

      const order = arbiter.arbitrate({
        bar,
        position: pos,
        availableCash: 50_000,
        macroRegime: {
          regime: MarketRiskRegime.NORMAL,
          marketAtrPercentile: 0.4,
          isLiquidityFrozen: false,
        },
      });

      expect(order).not.toBeNull();
      expect(order?.side).toBe(ORDER_SIDES.SELL);
      expect(order?.quantity).toBe(1000);
      expect(order?.exitReason).toBe('HARD_STOP_LOSS');
      // 成功触发 3 根 Bar 冷静期
      expect(arbiter.getCooldownRemainingBars()).toBe(3);
    });

    it('优先级 3 (策略逻辑级)：在正常大盘且未触及止损时，收到反向 EXIT 信号正常平仓', () => {
      // 成本 10.0，市价 11.0 (+10% 浮盈)，收到顶背驰卖点
      const bar = createBar('2026-10-15T14:30:00.000Z', 11.0);
      const signal = createSignal(
        SIGNAL_KINDS.EXIT,
        '2026-10-15T14:30:00.000Z',
        'second_sell',
      );
      const pos = createHoldingPosition(1000, 10.0, 11.0);

      const order = arbiter.arbitrate({
        bar,
        signal,
        position: pos,
        availableCash: 50_000,
        macroRegime: {
          regime: MarketRiskRegime.NORMAL,
          marketAtrPercentile: 0.3,
          isLiquidityFrozen: false,
        },
      });

      expect(order).not.toBeNull();
      expect(order?.side).toBe(ORDER_SIDES.SELL);
      expect(order?.quantity).toBe(1000);
      expect(order?.exitReason).toBe('second_sell');
      expect(order?.signalTime).toEqual(signal.signalTime);
    });

    it('优先级冲突裁决：大盘雪崩 (优先级1) 绝对压制个股止损 (优先级2) 与策略卖点 (优先级3)', () => {
      // 此时既触及止损 (-10%)，又发出了策略卖点，但大盘暴跌 SYSTEMIC_CRUNCH
      const bar = createBar('2026-10-15T10:00:00.000Z', 9.0);
      const signal = createSignal(SIGNAL_KINDS.EXIT);
      const pos = createHoldingPosition(1000, 10.0, 9.0);

      const order = arbiter.arbitrate({
        bar,
        signal,
        position: pos,
        availableCash: 50_000,
        macroRegime: {
          regime: MarketRiskRegime.SYSTEMIC_CRUNCH,
          marketAtrPercentile: 0.99,
          isLiquidityFrozen: false,
        },
      });

      expect(order).not.toBeNull();
      expect(order?.exitReason).toBe('SYSTEMIC_RISK_MELTDOWN');
    });

    it('优先级冲突裁决：个股止损 (优先级2) 压制策略卖点 (优先级3)', () => {
      // 成本 10.0，跌至 9.0 (-10%)，同时收到 EXIT 信号
      const bar = createBar('2026-10-15T10:00:00.000Z', 9.0);
      const signal = createSignal(
        SIGNAL_KINDS.EXIT,
        '2026-10-15T10:00:00.000Z',
        'first_sell',
      );
      const pos = createHoldingPosition(1000, 10.0, 9.0);

      const order = arbiter.arbitrate({
        bar,
        signal,
        position: pos,
        availableCash: 50_000,
        macroRegime: {
          regime: MarketRiskRegime.NORMAL,
          marketAtrPercentile: 0.4,
          isLiquidityFrozen: false,
        },
      });

      expect(order).not.toBeNull();
      expect(order?.exitReason).toBe('HARD_STOP_LOSS');
    });

    it('正常持仓无卖点且未触及风控时，返回 null 坚定持股', () => {
      const bar = createBar('2026-10-15T10:00:00.000Z', 10.2);
      const pos = createHoldingPosition(1000, 10.0, 10.2);

      const order = arbiter.arbitrate({
        bar,
        position: pos,
        availableCash: 50_000,
      });

      expect(order).toBeNull();
    });
  });

  describe('3. 冷静期衰减与时序因果 (Cooldown Dynamics)', () => {
    it('触发硬止损后进入冷静期，期间即使收到合法 ENTRY 信号亦被拦截，直到冷却归零', () => {
      // 1. 触发硬止损斩仓
      const stopBar = createBar('2026-10-15T10:00:00.000Z', 9.0);
      const pos = createHoldingPosition(1000, 10.0, 9.0);
      const sellOrder = arbiter.arbitrate({
        bar: stopBar,
        position: pos,
        availableCash: 10_000,
      });
      expect(sellOrder?.exitReason).toBe('HARD_STOP_LOSS');
      expect(arbiter.getCooldownRemainingBars()).toBe(3);

      const emptyPos = createEmptyPosition();
      const buySignal = createSignal(SIGNAL_KINDS.ENTRY);

      // 2. Bar 1 进入（时戳推进），冷静期衰减至 2 根，BUY 被拒
      const bar1 = createBar('2026-10-15T10:30:00.000Z', 9.2);
      const orderBar1 = arbiter.arbitrate({
        bar: bar1,
        signal: buySignal,
        position: emptyPos,
        availableCash: 100_000,
      });
      expect(orderBar1).toBeNull();
      expect(arbiter.getCooldownRemainingBars()).toBe(2);

      // 3. Bar 2 进入，冷静期衰减至 1 根，BUY 仍被拒
      const bar2 = createBar('2026-10-15T11:00:00.000Z', 9.5);
      const orderBar2 = arbiter.arbitrate({
        bar: bar2,
        signal: buySignal,
        position: emptyPos,
        availableCash: 100_000,
      });
      expect(orderBar2).toBeNull();
      expect(arbiter.getCooldownRemainingBars()).toBe(1);

      // 4. Bar 3 进入，冷静期衰减至 0 根，BUY 依然拦截（刚归零该周期）
      const bar3 = createBar('2026-10-15T11:30:00.000Z', 9.8);
      const orderBar3 = arbiter.arbitrate({
        bar: bar3,
        signal: buySignal,
        position: emptyPos,
        availableCash: 100_000,
      });
      expect(orderBar3).toBeNull();
      expect(arbiter.getCooldownRemainingBars()).toBe(0);

      // 5. Bar 4 进入，完全脱离冷静期，BUY 信号恢复放行并下单
      const bar4 = createBar('2026-10-15T13:00:00.000Z', 10.0);
      const orderBar4 = arbiter.arbitrate({
        bar: bar4,
        signal: buySignal,
        position: emptyPos,
        availableCash: 100_000,
      });
      expect(orderBar4).not.toBeNull();
      expect(orderBar4?.side).toBe(ORDER_SIDES.BUY);
    });

    it('同根 Bar 多次调用不会多扣冷静期', () => {
      arbiter.triggerCooldown(3);
      expect(arbiter.getCooldownRemainingBars()).toBe(3);

      const bar = createBar('2026-10-15T10:00:00.000Z', 10.0);
      const pos = createEmptyPosition();

      // 第一次调用（推进到该 Bar，从 3 扣到 2）
      arbiter.arbitrate({ bar, position: pos, availableCash: 100_000 });
      expect(arbiter.getCooldownRemainingBars()).toBe(2);

      // 同一时间戳第二次调用（如 onSignal 随后到达）
      arbiter.arbitrate({ bar, position: pos, availableCash: 100_000 });
      expect(arbiter.getCooldownRemainingBars()).toBe(2);
    });

    it('reset() 清空内部全部状态', () => {
      arbiter.triggerCooldown(5);
      expect(arbiter.getCooldownRemainingBars()).toBe(5);
      arbiter.reset();
      expect(arbiter.getCooldownRemainingBars()).toBe(0);
    });
  });
});
