import type { StrategyBar } from '@app/market-data';
import type { OrderFilledEvent } from '../execution/execution.types';
import { ORDER_SIDES, POSITION_STATUSES } from '../strategy.constants';
import { PositionStateMachine } from './position-state-machine';

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

describe('PositionStateMachine（纯记账员）', () => {
  let psm: PositionStateMachine;

  beforeEach(() => {
    psm = new PositionStateMachine(1, '600519');
  });

  it('handles entry fills and computes weighted cost accurately', () => {
    expect(psm.getStatus()).toBe(POSITION_STATUSES.EMPTY);

    // 第一次买入：1000 股 @ 10.00，规费 10 元，净扣除 10010 元
    const t1 = new Date('2026-10-15T09:31:00.000Z');
    psm.onOrderFilled(createFillEvent(ORDER_SIDES.BUY, 10.0, 1000, 10, t1));

    expect(psm.getStatus()).toBe(POSITION_STATUSES.HOLDING);
    let snapshot = psm.getSnapshot();
    expect(snapshot.holdingQuantity).toBe(1000);
    expect(snapshot.costPrice).toBe(10.0);

    // 第二次买入加仓：1000 股 @ 11.00，规费 10 元，净扣除 11010 元
    const t2 = new Date('2026-10-15T10:00:00.000Z');
    psm.onOrderFilled(createFillEvent(ORDER_SIDES.BUY, 11.0, 1000, 10, t2));

    snapshot = psm.getSnapshot();
    expect(snapshot.holdingQuantity).toBe(2000);
    // 加权成本均价 = (1000*10 + 1000*11) / 2000 = 10.50
    expect(snapshot.costPrice).toBe(10.5);
    // 加仓买入应刷新 entryTime 至最新成交时刻（T+1 口径保护）
    expect(snapshot.entryTime).toEqual(t2);
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

  it('records complete closed trade on sell fill (平仓订单由交易层引擎下达，此处仅记账)', () => {
    const entryTime = new Date('2026-10-15T09:31:00.000Z');
    psm.onOrderFilled(
      createFillEvent(ORDER_SIDES.BUY, 10.0, 1000, 10, entryTime),
    );

    // 推进数根 K 线
    psm.onBar(createBar('2026-10-15T10:00:00.000Z', 10.5));
    psm.onBar(createBar('2026-10-15T11:00:00.000Z', 11.2));

    // 卖出撮合（成交事件由引擎产出的指令经撮合端回填）
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

  it('strictly adheres to pure accountant role: onBar never generates exit orders', () => {
    psm.onOrderFilled(
      createFillEvent(
        ORDER_SIDES.BUY,
        10.0,
        1000,
        10,
        new Date('2026-10-15T09:31:00.000Z'),
      ),
    );

    // 价格未到高位，保持持仓，onBar 返回 null
    expect(psm.onBar(createBar('2026-10-15T10:00:00.000Z', 12.5))).toBeNull();

    // 价格即使大幅上冲，onBar 亦纯粹记账（更新 holdingBars 和 currentPrice），绝不下单
    expect(psm.onBar(createBar('2026-10-15T10:30:00.000Z', 13.2))).toBeNull();
    expect(psm.getSnapshot().holdingBars).toBe(2);
    expect(psm.getSnapshot().currentPrice).toBe(13.2);
  });

  it('maintains pure full-accounting surface without retired partial exitRatio helpers', () => {
    expect(
      (psm as unknown as Record<string, unknown>).calculateExitQuantity,
    ).toBeUndefined();
    expect(
      (psm as unknown as Record<string, unknown>).getExitRatio,
    ).toBeUndefined();
  });

  it('resets entryTime and holdingBars on subsequent buys after position is CLOSED', () => {
    // 交易 1：买入并平仓
    const t1Entry = new Date('2026-10-01T09:31:00.000Z');
    psm.onOrderFilled(
      createFillEvent(ORDER_SIDES.BUY, 10.0, 1000, 10, t1Entry),
    );
    psm.onBar(createBar('2026-10-01T10:00:00.000Z', 10.5));
    psm.onBar(createBar('2026-10-01T11:00:00.000Z', 11.0));
    const t1Exit = new Date('2026-10-01T15:00:00.000Z');
    psm.onOrderFilled(
      createFillEvent(ORDER_SIDES.SELL, 11.0, 1000, 10, t1Exit),
    );

    expect(psm.getStatus()).toBe(POSITION_STATUSES.CLOSED);

    // 交易 2：再次买入
    const t2Entry = new Date('2026-10-08T09:31:00.000Z');
    psm.onOrderFilled(
      createFillEvent(ORDER_SIDES.BUY, 12.0, 1000, 10, t2Entry),
    );
    expect(psm.getStatus()).toBe(POSITION_STATUSES.HOLDING);
    psm.onBar(createBar('2026-10-08T10:00:00.000Z', 12.5));
    const t2Exit = new Date('2026-10-08T15:00:00.000Z');
    psm.onOrderFilled(
      createFillEvent(ORDER_SIDES.SELL, 12.5, 1000, 10, t2Exit),
    );

    const trades = psm.getClosedTrades();
    expect(trades).toHaveLength(2);
    expect(trades[0].entryTime).toEqual(t1Entry);
    expect(trades[0].holdingBars).toBe(2);
    expect(trades[1].entryTime).toEqual(t2Entry);
    expect(trades[1].holdingBars).toBe(1);
  });
});
