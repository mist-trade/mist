import type { StrategyBar } from '@app/market-data';
import type { OrderFilledEvent } from '../execution/execution.types';
import type { KernelSignal } from '../kernel/kernel.types';
import {
  ORDER_SIDES,
  ORDER_TYPES,
  POSITION_STATUSES,
  SIGNAL_KINDS,
} from '../strategy.constants';
import { PositionStateMachine } from './position-state-machine';
import type { ExitPolicyPort } from './position.types';

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

function createFillEvent(
  side: typeof ORDER_SIDES.BUY | typeof ORDER_SIDES.SELL,
  fillPrice: number,
  quantity: number,
  totalFees: number,
  fillTime: Date,
): OrderFilledEvent {
  const turnover = fillPrice * quantity;
  const netAmount =
    side === ORDER_SIDES.BUY ? -(turnover + totalFees) : turnover - totalFees;
  return {
    eventId: `evt-${Date.now()}`,
    orderId: `ord-${Date.now()}`,
    securityId: 1,
    securityCode: '600519',
    side,
    fillTime,
    fillPrice,
    filledQuantity: quantity,
    turnover,
    fees: {
      commission: totalFees > 5 ? 5 : totalFees,
      transferFee: 0.1,
      stampDuty: side === ORDER_SIDES.SELL ? 5 : 0,
      slippageCost: 10,
      totalFees,
    },
    netAmount,
  };
}

describe('PositionStateMachine', () => {
  let psm: PositionStateMachine;

  beforeEach(() => {
    psm = new PositionStateMachine(1, '600519', 1_000_000);
  });

  it('handles entry fills, computes weighted cost and tracks cash accurately', () => {
    expect(psm.getStatus()).toBe(POSITION_STATUSES.EMPTY);
    expect(psm.getCash()).toBe(1_000_000);

    // 第一次买入：1000 股 @ 10.00，规费 10 元，净扣除 10010 元
    const t1 = new Date('2026-10-15T09:31:00.000Z');
    psm.onOrderFilled(createFillEvent(ORDER_SIDES.BUY, 10.0, 1000, 10, t1));

    expect(psm.getStatus()).toBe(POSITION_STATUSES.HOLDING);
    let snapshot = psm.getSnapshot();
    expect(snapshot.holdingQuantity).toBe(1000);
    expect(snapshot.costPrice).toBe(10.0);
    expect(psm.getCash()).toBe(989_990);

    // 第二次买入加仓：1000 股 @ 11.00，规费 10 元，净扣除 11010 元
    const t2 = new Date('2026-10-15T10:00:00.000Z');
    psm.onOrderFilled(createFillEvent(ORDER_SIDES.BUY, 11.0, 1000, 10, t2));

    snapshot = psm.getSnapshot();
    expect(snapshot.holdingQuantity).toBe(2000);
    // 加权成本均价 = (1000*10 + 1000*11) / 2000 = 10.50
    expect(snapshot.costPrice).toBe(10.5);
    expect(psm.getCash()).toBe(978_980);
  });

  it('protects against whipsaw by not triggering hardcoded stop losses during market dips', () => {
    // 买入持仓 1000 股 @ 10.00
    psm.onOrderFilled(
      createFillEvent(
        ORDER_SIDES.BUY,
        10.0,
        1000,
        10,
        new Date('2026-10-15T09:31:00.000Z'),
      ),
    );

    // 盘中行情大幅假摔深跌至 8.50 元（-15% 跌幅）
    const dipBar = createBar('2026-10-15T10:30:00.000Z', 8.5);
    const orderDraft = psm.onBar(dipBar);

    // 断言：主仓库不设硬止损，绝不触发割肉平仓订单，保持 HOLDING 状态
    expect(orderDraft).toBeNull();
    expect(psm.getStatus()).toBe(POSITION_STATUSES.HOLDING);

    const snapshot = psm.getSnapshot();
    // 浮动亏损为 -1500 元
    expect(snapshot.unrealizedPnl).toBe(-1500);
    expect(snapshot.unrealizedPnlRatio).toBe(-0.15);

    // 后续行情暴力拉升回 12.00 元 (+20% 涨幅)
    const rallyBar = createBar('2026-10-15T14:30:00.000Z', 12.0);
    psm.onBar(rallyBar);
    const rallySnapshot = psm.getSnapshot();
    // 成功避免被假摔洗出局，浮盈转正为 +2000 元
    expect(rallySnapshot.unrealizedPnl).toBe(2000);
    expect(rallySnapshot.unrealizedPnlRatio).toBe(0.2);
  });

  it('exits position on decision flow reverse exit signal and records complete closed trade', () => {
    const entryTime = new Date('2026-10-15T09:31:00.000Z');
    psm.onOrderFilled(
      createFillEvent(ORDER_SIDES.BUY, 10.0, 1000, 10, entryTime),
    );

    // 推进数根 K 线
    psm.onBar(createBar('2026-10-15T10:00:00.000Z', 10.5));
    psm.onBar(createBar('2026-10-15T11:00:00.000Z', 11.2));

    // 策略树发出反向顶背驰卖出信号
    const exitSignal: KernelSignal = {
      definitionId: 1,
      versionId: 1,
      signalKind: SIGNAL_KINDS.EXIT,
      signalTime: new Date('2026-10-15T14:55:00.000Z'),
      triggerTime: '2026-10-15T14:55:00.000Z',
      triggerPrice: 11.5,
      pivotTime: null,
      pivotPrice: null,
      signalType: 'first_sell',
      confidence: 0.9,
      confidenceLevel: 'HIGH',
      decisionTrace: {},
      contextSnapshot: {},
      ruleSnapshot: {},
    };

    const exitOrderDraft = psm.onSignal(exitSignal);
    expect(exitOrderDraft).not.toBeNull();
    expect(exitOrderDraft?.side).toBe(ORDER_SIDES.SELL);
    expect(exitOrderDraft?.orderType).toBe(ORDER_TYPES.MARKET);
    expect(exitOrderDraft?.quantity).toBe(1000);

    // 随后撮合引擎在次一周期成交卖单：卖出价 11.50，规费 15 元，净收入 11485 元
    const exitTime = new Date('2026-10-15T15:00:00.000Z');
    psm.onOrderFilled(
      createFillEvent(ORDER_SIDES.SELL, 11.5, 1000, 15, exitTime),
    );

    expect(psm.getStatus()).toBe(POSITION_STATUSES.CLOSED);
    expect(psm.getSnapshot().holdingQuantity).toBe(0);
    // 净利润 = 11485 - 10010 = 1475 元
    expect(psm.getSnapshot().realizedPnl).toBe(1475);

    // 检查闭环交易事实记录
    const trades = psm.getClosedTrades();
    expect(trades).toHaveLength(1);
    const trade = trades[0];
    expect(trade.entryPrice).toBe(10.0);
    expect(trade.exitPrice).toBe(11.5);
    expect(trade.quantity).toBe(1000);
    expect(trade.realizedPnl).toBe(1475);
    expect(trade.returnRatio).toBe(0.1475);
    expect(trade.holdingBars).toBe(2);
  });

  it('generates accurate daily mark-to-market NAV curve over successive trading days', () => {
    // 初始买入 1000 股 @ 10.00 元，现金剩余 989,990 元
    psm.onOrderFilled(
      createFillEvent(
        ORDER_SIDES.BUY,
        10.0,
        1000,
        10,
        new Date('2026-10-12T09:31:00.000Z'),
      ),
    );

    // Day 1 收盘价 10.20 元 (市值 10,200 元，总权益 1,000,190 元)
    const barDay1 = createBar('2026-10-12T15:00:00.000Z', 10.2);
    const nav1 = psm.onDayClose(barDay1);
    expect(nav1.date).toBe('2026-10-12');
    expect(nav1.marketValue).toBe(10_200);
    expect(nav1.totalEquity).toBe(1_000_190);

    // Day 2 收盘价 10.50 元 (市值 10,500 元，总权益 1,000,490 元)
    const barDay2 = createBar('2026-10-13T15:00:00.000Z', 10.5);
    const nav2 = psm.onDayClose(barDay2);
    expect(nav2.date).toBe('2026-10-13');
    expect(nav2.marketValue).toBe(10_500);
    expect(nav2.totalEquity).toBe(1_000_490);
    // Day 2 收益 = (1000490 - 1000190) / 1000190 = 0.0003
    expect(nav2.dailyReturn).toBe(0.0003);

    // Day 3 收盘价 10.10 元 (市值 10,100 元，总权益 1,000,090 元)
    const barDay3 = createBar('2026-10-14T15:00:00.000Z', 10.1);
    const nav3 = psm.onDayClose(barDay3);
    expect(nav3.date).toBe('2026-10-14');
    expect(nav3.totalEquity).toBe(1_000_090);

    const history = psm.getNavHistory();
    expect(history).toHaveLength(3);
  });

  it('strictly adheres to pure accountant role: onBar never generates exit orders and returns null', () => {
    // 模拟外部出场插件
    const mockPrivateExitPolicy: ExitPolicyPort = {
      id: 'plugin.exit.private_custom',
      evaluate: (bar) => {
        if (bar.close >= 13.0) {
          return { action: 'EXIT', reason: 'TAKE_PROFIT' };
        }
        return { action: 'HOLD', reason: 'CONTINUE' };
      },
      onSignal: (signal) => {
        if (signal.signalKind === SIGNAL_KINDS.EXIT) {
          return { action: 'EXIT', reason: 'TAKE_PROFIT_SIGNAL' };
        }
        return { action: 'HOLD', reason: 'CONTINUE' };
      },
    };

    const customPsm = new PositionStateMachine(
      1,
      '600519',
      1_000_000,
      mockPrivateExitPolicy,
    );
    customPsm.onOrderFilled(
      createFillEvent(
        ORDER_SIDES.BUY,
        10.0,
        1000,
        10,
        new Date('2026-10-15T09:31:00.000Z'),
      ),
    );

    // 价格未到 13.00，保持持仓，onBar 返回 null
    expect(
      customPsm.onBar(createBar('2026-10-15T10:00:00.000Z', 12.5)),
    ).toBeNull();

    // 价格即使突破 13.00，onBar 亦纯粹记账（更新 holdingBars 和 currentPrice），绝不下单
    const exitDraft = customPsm.onBar(
      createBar('2026-10-15T10:30:00.000Z', 13.2),
    );
    expect(exitDraft).toBeNull();
    expect(customPsm.getSnapshot().holdingBars).toBe(2);
    expect(customPsm.getSnapshot().currentPrice).toBe(13.2);

    // 显式信号到达时，通过 onSignal 正常生成订单
    const exitSignal: KernelSignal = {
      definitionId: 1,
      versionId: 1,
      signalKind: SIGNAL_KINDS.EXIT,
      signalTime: new Date('2026-10-15T10:30:00.000Z'),
      triggerTime: '2026-10-15T10:30:00.000Z',
      triggerPrice: 13.2,
      pivotTime: null,
      pivotPrice: null,
      signalType: 'take_profit',
      confidence: 0.9,
      confidenceLevel: 'HIGH',
      decisionTrace: {},
      contextSnapshot: {},
      ruleSnapshot: {},
    };
    const signalOrder = customPsm.onSignal(exitSignal);
    expect(signalOrder).not.toBeNull();
    expect(signalOrder?.side).toBe(ORDER_SIDES.SELL);
  });

  it('supports custom exitRatio via options and generates partial exit orders', () => {
    const partialPsm = new PositionStateMachine(1, '600519', {
      initialCash: 1_000_000,
      exitRatio: 0.5,
    });
    expect(partialPsm.getExitRatio()).toBe(0.5);

    partialPsm.onOrderFilled(
      createFillEvent(
        ORDER_SIDES.BUY,
        10.0,
        1000,
        10,
        new Date('2026-10-15T09:31:00.000Z'),
      ),
    );

    const exitSignal: KernelSignal = {
      definitionId: 1,
      versionId: 1,
      signalKind: SIGNAL_KINDS.EXIT,
      signalTime: new Date('2026-10-15T14:30:00.000Z'),
      triggerTime: '2026-10-15T14:30:00.000Z',
      triggerPrice: 12.0,
      pivotTime: '2026-10-15T14:00:00.000Z',
      pivotPrice: 12.2,
      signalType: 'first_sell',
      confidence: 0.9,
      confidenceLevel: 'HIGH',
      decisionTrace: {},
      contextSnapshot: {},
      ruleSnapshot: {},
    };

    const draft = partialPsm.onSignal(exitSignal);
    expect(draft).not.toBeNull();
    expect(draft?.side).toBe(ORDER_SIDES.SELL);
    expect(draft?.quantity).toBe(500); // 50% of 1000
  });

  it('supports per-call exitRatio override in onSignal', () => {
    psm.onOrderFilled(
      createFillEvent(
        ORDER_SIDES.BUY,
        10.0,
        1000,
        10,
        new Date('2026-10-15T09:31:00.000Z'),
      ),
    );

    const exitSignal: KernelSignal = {
      definitionId: 1,
      versionId: 1,
      signalKind: SIGNAL_KINDS.EXIT,
      signalTime: new Date('2026-10-15T14:30:00.000Z'),
      triggerTime: '2026-10-15T14:30:00.000Z',
      triggerPrice: 12.0,
      pivotTime: '2026-10-15T14:00:00.000Z',
      pivotPrice: 12.2,
      signalType: 'first_sell',
      confidence: 0.9,
      confidenceLevel: 'HIGH',
      decisionTrace: {},
      contextSnapshot: {},
      ruleSnapshot: {},
    };

    // 覆盖默认 exitRatio (1.0) 为 0.3 (30%)
    const draft = psm.onSignal(exitSignal, { exitRatio: 0.3 });
    expect(draft).not.toBeNull();
    expect(draft?.quantity).toBe(300); // 30% of 1000
  });

  it('validates exitRatio range (must be (0, 1.0])', () => {
    expect(
      () =>
        new PositionStateMachine(1, '600519', {
          exitRatio: 0,
        }),
    ).toThrow('exitRatio must be in range (0, 1.0]');

    expect(
      () =>
        new PositionStateMachine(1, '600519', {
          exitRatio: 1.5,
        }),
    ).toThrow('exitRatio must be in range (0, 1.0]');
  });
});
