import type { StrategyBar } from '@app/market-data';
import { SimulatedBroker } from './simulated-broker';
import { calculateExecutionFees } from './slippage-fee-calculator';

function createBar(
  timestamp: string,
  open: number,
  high: number,
  low: number,
  close: number,
  securityCode = '600519',
): StrategyBar {
  return {
    securityId: 1,
    securityCode,
    source: 'tdx',
    period: 1,
    timestamp: new Date(timestamp),
    open,
    high,
    low,
    close,
    volume: '10000',
    amount: '100000',
    type: 'complete',
  };
}

describe('SimulatedBroker', () => {
  let broker: SimulatedBroker;

  beforeEach(() => {
    broker = new SimulatedBroker(1_000_000);
  });

  it('TC-1: enforces Next-Bar Open causality (t_fill >= t+1 > t_signal)', () => {
    const tSignal = new Date('2026-10-16T09:30:00.000Z');
    const order = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: tSignal,
    });

    expect(order.status).toBe('PENDING');
    // 当根 Bar 绝不成交
    expect(broker.getAccount().positions.size).toBe(0);

    // 推进到达第 t+1 根 Bar
    const barNext = createBar(
      '2026-10-16T09:31:00.000Z',
      10.0,
      10.2,
      9.95,
      10.15,
      '600519',
    );
    const fills = broker.onBar(barNext);

    expect(fills).toHaveLength(1);
    const fill = fills[0];
    expect(fill.fillTime.getTime()).toBe(barNext.timestamp.getTime());
    expect(fill.fillTime.getTime()).toBeGreaterThan(tSignal.getTime());
    // 10.00 + 0.1% 滑点 = 10.01
    expect(fill.fillPrice).toBe(10.01);
    expect(fill.filledQuantity).toBe(1000);

    const pos = broker.getAccount().positions.get('600519');
    expect(pos?.totalQuantity).toBe(1000);
    // T+1 锁定，当日可用数量为 0
    expect(pos?.availableQuantity).toBe(0);
    expect(pos?.frozenQuantity).toBe(1000);
  });

  it('TC-2: enforces A-share T+1 locking and allows selling after day close settlement', () => {
    const t0 = new Date('2026-10-16T09:30:00.000Z');
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: t0,
    });

    const barT1 = createBar(
      '2026-10-16T09:31:00.000Z',
      10.0,
      10.0,
      10.0,
      10.0,
      '600519',
    );
    broker.onBar(barT1);

    // 同日立即报卖单，应被 T+1 规则直接拒绝
    const rejectedSell = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-16T14:55:00.000Z'),
    });
    expect(rejectedSell.status).toBe('REJECTED');
    expect(rejectedSell.rejectReason).toBe('T1_LOCKED_SHARES');

    // 跨日结算，T+1 解冻
    broker.settleDayClose('2026-10-16');
    const posAfterSettle = broker.getAccount().positions.get('600519');
    expect(posAfterSettle?.availableQuantity).toBe(1000);
    expect(posAfterSettle?.frozenQuantity).toBe(0);

    // 次日发起卖单
    const tNextDay = new Date('2026-10-17T09:30:00.000Z');
    const acceptedSell = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: tNextDay,
    });
    expect(acceptedSell.status).toBe('PENDING');

    // 次日开盘撮合成交
    const barNextDay = createBar(
      '2026-10-17T09:31:00.000Z',
      10.5,
      10.6,
      10.4,
      10.55,
      '600519',
    );
    const fills = broker.onBar(barNextDay);
    expect(fills).toHaveLength(1);
    expect(fills[0].side).toBe('SELL');
    expect(broker.getAccount().positions.get('600519')?.totalQuantity).toBe(0);
  });

  it('TC-3: rejects BUY orders on one-word limit up bars across consecutive intraday minute bars', () => {
    // 预设前一日收盘价为 10.00
    const prevBar = createBar(
      '2026-10-15T15:00:00.000Z',
      10.0,
      10.0,
      10.0,
      10.0,
      '600519',
    );
    broker.onBar(prevBar);

    const tSignal = new Date('2026-10-15T15:00:00.000Z');
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: tSignal,
    });

    // 次日 09:30 一字涨停（开高低收均为 11.00，+10%）
    const limitUpBar1 = createBar(
      '2026-10-16T09:30:00.000Z',
      11.0,
      11.0,
      11.0,
      11.0,
      '600519',
    );
    const fills1 = broker.onBar(limitUpBar1);
    expect(fills1).toHaveLength(0);
    expect(broker.getOpenOrders()).toHaveLength(0);
    expect(broker.getAccount().positions.size).toBe(0);

    // 同一交易日后续连续分钟 Bar (09:31, 09:32) 再次报买单，仍应基于前日昨收 10.00 计算涨停价 11.00 并拒绝
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-16T09:30:00.000Z'),
    });
    const limitUpBar2 = createBar(
      '2026-10-16T09:31:00.000Z',
      11.0,
      11.0,
      11.0,
      11.0,
      '600519',
    );
    const fills2 = broker.onBar(limitUpBar2);
    expect(fills2).toHaveLength(0);
    expect(broker.getOpenOrders()).toHaveLength(0);

    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-16T09:31:00.000Z'),
    });
    const limitUpBar3 = createBar(
      '2026-10-16T09:32:00.000Z',
      11.0,
      11.0,
      11.0,
      11.0,
      '600519',
    );
    const fills3 = broker.onBar(limitUpBar3);
    expect(fills3).toHaveLength(0);
    expect(broker.getOpenOrders()).toHaveLength(0);
  });

  it('TC-4: blocks and postpones SELL orders on one-word limit down bars until liquidity opens', () => {
    // 先买入持仓并解冻
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-14T09:30:00.000Z'),
    });
    broker.onBar(
      createBar('2026-10-14T09:31:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );
    broker.settleDayClose('2026-10-14');

    // 报出卖单
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-15T09:30:00.000Z'),
    });

    // 第 1 根：一字跌停（9.00，-10%），卖单挂起顺延
    const limitDownBar = createBar(
      '2026-10-15T09:31:00.000Z',
      9.0,
      9.0,
      9.0,
      9.0,
      '600519',
    );
    const fills1 = broker.onBar(limitDownBar);
    expect(fills1).toHaveLength(0);
    const openOrders = broker.getOpenOrders();
    expect(openOrders).toHaveLength(1);
    expect(openOrders[0].status).toBe('BLOCKED');
    expect(openOrders[0].rejectReason).toBe('SELL_BLOCKED_LIMIT_DOWN');

    // 第 2 根：打开跌停，正常撮合成交
    const normalBar = createBar(
      '2026-10-15T09:32:00.000Z',
      9.2,
      9.3,
      8.95,
      9.25,
      '600519',
    );
    const fills2 = broker.onBar(normalBar);
    expect(fills2).toHaveLength(1);
    expect(fills2[0].side).toBe('SELL');
    // 9.20 - 0.1% 滑点 = 9.19
    expect(fills2[0].fillPrice).toBe(9.19);
    expect(broker.getOpenOrders()).toHaveLength(0);
  });

  it('TC-5: handles gap-down and intraday stop-loss execution accurately', () => {
    // 建立持仓并解冻
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-14T09:30:00.000Z'),
    });
    broker.onBar(
      createBar('2026-10-14T09:31:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );
    broker.settleDayClose('2026-10-14');

    // 挂止损单：stopPrice = 9.50
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'STOP',
      quantity: 1000,
      stopPrice: 9.5,
      signalTime: new Date('2026-10-15T09:30:00.000Z'),
    });

    // 跳空低开：open = 9.30 (已跌破 9.50 止损价)
    const gapDownBar = createBar(
      '2026-10-15T09:31:00.000Z',
      9.3,
      9.4,
      9.2,
      9.35,
      '600519',
    );
    const fills = broker.onBar(gapDownBar);
    expect(fills).toHaveLength(1);
    // 低开跳空按 open 减滑点强平 (9.30 - 0.1% = 9.29)
    expect(fills[0].fillPrice).toBe(9.29);
  });

  it('TC-6: verifies precise fees and stamp duty exemption for ETFs', () => {
    // 股票卖出万 5 印花税
    const stockFees = calculateExecutionFees('SELL', 10.0, 1000, '600519');
    expect(stockFees.commission).toBe(5.0); // 10000 * 0.00025 = 2.5 < 5 (保底 5 元)
    expect(stockFees.transferFee).toBe(0.1); // 10000 * 0.00001 = 0.1
    expect(stockFees.stampDuty).toBe(5.0); // 10000 * 0.0005 = 5.0
    expect(stockFees.totalFees).toBe(10.1);

    // ETF 卖出免征印花税
    const etfFees = calculateExecutionFees('SELL', 10.0, 1000, '510300');
    expect(etfFees.commission).toBe(5.0);
    expect(etfFees.transferFee).toBe(0.1);
    expect(etfFees.stampDuty).toBe(0); // ETF 严格免税
    expect(etfFees.totalFees).toBe(5.1);
  });

  it('TC-7: verifies configurable fee options and zero minimum commission (免五)', () => {
    // 免五账户测试：minCommission = 0
    const mianWuFees = calculateExecutionFees(
      'BUY',
      10.0,
      1000,
      '600519',
      0.001,
      { commissionRate: 0.0003, minCommission: 0 },
    );
    // 10000 * 0.0003 = 3.0 元，无需保底 5 元
    expect(mianWuFees.commission).toBe(3.0);

    // 自定义 Broker 初始资金与费率
    const customBroker = new SimulatedBroker({
      initialCash: 500_000,
      slippageRatio: 0.002,
      feeConfig: { commissionRate: 0.0002, minCommission: 0 },
    });
    expect(customBroker.getAccount().availableCash).toBe(500_000);

    customBroker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-15T09:30:00.000Z'),
    });

    const bar = createBar(
      '2026-10-15T09:31:00.000Z',
      10.0,
      10.1,
      9.9,
      10.0,
      '600519',
    );
    const fills = customBroker.onBar(bar);
    expect(fills).toHaveLength(1);
    // 10.0 * (1 + 0.002) = 10.02 (滑点 0.2%)
    expect(fills[0].fillPrice).toBe(10.02);
    // 佣金 10020 * 0.0002 = 2.004 -> 2.00 (免五)
    expect(fills[0].fees.commission).toBe(2.0);
  });

  it('TC-8: recognizes ST stock 5% price limits when registered via registerSecurity', () => {
    // 注册 ST 股票元数据
    broker.registerSecurity('600000', { name: '*ST某某', preClose: 10.0 });

    // 09:30 报买单
    const buyOrder = broker.submitOrder({
      securityId: 2,
      securityCode: '600000',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-15T09:30:00.000Z'),
    });
    expect(buyOrder.status).toBe('PENDING');

    // 09:31 触及 5% 涨停板（10.50 四价合一），因 ST 限制比例为 5%，应被一字涨停拒单！
    const stLimitUpBar = createBar(
      '2026-10-15T09:31:00.000Z',
      10.5,
      10.5,
      10.5,
      10.5,
      '600000',
    );
    const fills = broker.onBar(stLimitUpBar);
    expect(fills).toHaveLength(0);
    expect(broker.getOpenOrders()).toHaveLength(0);
  });

  it('TC-9: propagates order.exitReason into OrderFilledEvent upon fill execution', () => {
    // 1. 买入建仓
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-15T09:30:00.000Z'),
    });
    broker.onBar(
      createBar('2026-10-15T09:31:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );
    broker.settleDayClose('2026-10-15');

    // 2. 报出带有 exitReason 的卖单（如硬止损 HARD_STOP_LOSS）
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-16T09:30:00.000Z'),
      exitReason: 'HARD_STOP_LOSS',
    });

    // 3. 次日成交
    const fills = broker.onBar(
      createBar('2026-10-16T09:31:00.000Z', 9.1, 9.2, 9.0, 9.15, '600519'),
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].side).toBe('SELL');
    expect(fills[0].exitReason).toBe('HARD_STOP_LOSS');
  });
});
