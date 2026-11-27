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
    // 9.20 - 0.1% 滑点 = 9.1908 → 厘级取整 9.191（REQ-ENGINE-07：分→厘，REQ-ISO-04 归类）
    expect(fills2[0].fillPrice).toBe(9.191);
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
    // 低开跳空按 open 减滑点强平 (9.30 × 0.999 = 9.2907 → 厘级 9.291，原分级 round2 为 9.29)
    expect(fills[0].fillPrice).toBe(9.291);
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
    // 佣金 10020 * 0.0002 = 2.004（厘级精确，免五；原分级 round2 为 2.00）(REQ-ENGINE-07)
    expect(fills[0].fees.commission).toBe(2.004);
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

  it('TC-10: T+1 盘中边界（30m 序列）——D 日盘中买入当日禁卖，结算后 D+1 可卖', () => {
    // D 日 10:30 30m bar 成交买入（signalTime 为其前一 30m bar）
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-16T02:00:00.000Z'),
    });
    const buyFills = broker.onBar(
      createBar('2026-10-16T02:30:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );
    expect(buyFills).toHaveLength(1);
    expect(broker.getAccount().positions.get('600519')?.frozenQuantity).toBe(
      1000,
    );

    // D 日 13:00 30m bar 报卖单：当日买入份额仍冻结，submitOrder 阶段直接拒绝
    const intradaySell = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-16T05:00:00.000Z'),
    });
    expect(intradaySell.status).toBe('REJECTED');
    expect(intradaySell.rejectReason).toBe('T1_LOCKED_SHARES');

    // D 日结算解锁
    broker.settleDayClose('2026-10-16');
    expect(broker.getAccount().positions.get('600519')?.availableQuantity).toBe(
      1000,
    );

    // D+1 首根 30m bar：卖单受理并成交
    const sell = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-17T01:30:00.000Z'),
    });
    expect(sell.status).toBe('PENDING');
    const sellFills = broker.onBar(
      createBar('2026-10-17T01:35:00.000Z', 10.2, 10.2, 10.2, 10.2, '600519'),
    );
    expect(sellFills).toHaveLength(1);
    expect(sellFills[0].fillTime.getTime()).toBe(
      new Date('2026-10-17T01:35:00.000Z').getTime(),
    );
  });

  it('TC-11: registerSecurity 注入 preClose 后，首日一字涨停买入被拒（昨收基准生效）', () => {
    broker.registerSecurity('600519', { name: '贵州茅台', preClose: 10.0 });
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-16T02:00:00.000Z'),
    });
    // 四价合一 11.00 = 10.00 × 1.10 → 一字涨停，流动性为 0，拒单
    const fills = broker.onBar(
      createBar('2026-10-16T02:30:00.000Z', 11.0, 11.0, 11.0, 11.0, '600519'),
    );
    expect(fills).toHaveLength(0);
    expect(broker.getAccount().positions.size).toBe(0);
  });

  it('TC-12: 无 preClose 注入时首日回退 bar.open 作昨收——同根一字板不判涨停（对照）', () => {
    // 未注册 security → meta 无 preClose → 昨收回退首根 bar.open（= 11.0）
    // → limitUp = 11.0 × 1.10 = 12.1 > 11.0 → 不判一字涨停 → 正常成交
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-16T02:00:00.000Z'),
    });
    const fills = broker.onBar(
      createBar('2026-10-16T02:30:00.000Z', 11.0, 11.0, 11.0, 11.0, '600519'),
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].fillPrice).toBeGreaterThan(11.0);
  });

  it('TC-13: 一字跌停卖单 BLOCKED 时，同标的配对 BUY 撤单为 PAIRED_SELL_BLOCKED_LIMIT_DOWN 且不消耗残留现金', () => {
    broker.registerSecurity('600519', { name: '贵州茅台', preClose: 10.0 });
    // Day 1: 建仓 1000 股（约消耗 10,015 元，保留大量残留现金）
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-14T01:30:00.000Z'),
      intentId: 'd1-buy',
    });
    broker.onBar(
      createBar('2026-10-14T02:00:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );
    broker.settleDayClose('2026-10-14');
    const cashAfterBuy = broker.getAccount().availableCash;

    // Day 2 盘前提交配对 SELL + BUY（无论提交顺序谁先谁后）
    const sellOrder = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-15T01:30:00.000Z'),
      intentId: 'd2-sell',
    });
    const buyOrder = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-15T01:30:00.000Z'),
      intentId: 'd2-buy',
    });

    // Day 2 开盘一字跌停（9.00 = 10.00 × 0.90）：SELL 进入 BLOCKED，配对 BUY 必须撤单
    const limitDownBar = createBar(
      '2026-10-15T02:00:00.000Z',
      9.0,
      9.0,
      9.0,
      9.0,
      '600519',
    );
    const fillsOnLimitDown = broker.onBar(limitDownBar);
    expect(fillsOnLimitDown).toHaveLength(0);
    expect(broker.getAccount().availableCash).toBe(cashAfterBuy);
    expect(broker.getAccount().positions.get('600519')?.totalQuantity).toBe(
      1000,
    );

    const openOrders = broker.getOpenOrders();
    expect(openOrders).toHaveLength(1);
    expect(openOrders[0].orderId).toBe(sellOrder.orderId);
    expect(openOrders[0].status).toBe('BLOCKED');

    const cancelledBuy = broker.getOrder(buyOrder.orderId);
    expect(cancelledBuy?.status).toBe('CANCELLED');
    expect(cancelledBuy?.rejectReason).toBe('PAIRED_SELL_BLOCKED_LIMIT_DOWN');

    // Day 3 仍在跌停时，新的同标的 BUY 同样受已存在 BLOCKED 卖单保护而撤单
    broker.settleDayClose('2026-10-15');
    const secondBuy = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-16T01:30:00.000Z'),
      intentId: 'd3-buy',
    });
    const stillLimitDown = createBar(
      '2026-10-16T02:00:00.000Z',
      8.1,
      8.1,
      8.1,
      8.1,
      '600519',
    );
    expect(broker.onBar(stillLimitDown)).toHaveLength(0);
    expect(broker.getOrder(secondBuy.orderId)?.status).toBe('CANCELLED');
    expect(broker.getOrder(secondBuy.orderId)?.rejectReason).toBe(
      'PAIRED_SELL_BLOCKED_LIMIT_DOWN',
    );
    expect(broker.getAccount().availableCash).toBe(cashAfterBuy);

    // Day 4 打开跌停后，滞留 BLOCKED 卖单正常成交，新买单可恢复成交
    broker.settleDayClose('2026-10-16');
    const openBar = createBar(
      '2026-10-17T02:00:00.000Z',
      8.2,
      8.4,
      8.1,
      8.3,
      '600519',
    );
    const sellFills = broker.onBar(openBar);
    expect(sellFills).toHaveLength(1);
    expect(sellFills[0].side).toBe('SELL');
    expect(broker.getOpenOrders()).toHaveLength(0);
  });

  it('TC-14: STOP order applies custom slippageRatio for gap-down and intraday trigger', () => {
    const customBroker = new SimulatedBroker({
      initialCash: 1_000_000,
      slippageRatio: 0.01,
    });
    customBroker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-14T09:30:00.000Z'),
      intentId: 'buy-1',
    });
    customBroker.onBar(
      createBar('2026-10-14T09:31:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );
    customBroker.settleDayClose('2026-10-14');

    customBroker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'STOP',
      quantity: 500,
      stopPrice: 9.5,
      signalTime: new Date('2026-10-15T09:30:00.000Z'),
      intentId: 'stop-gap',
    });
    const gapFills = customBroker.onBar(
      createBar('2026-10-15T09:31:00.000Z', 9.3, 9.4, 9.2, 9.35, '600519'),
    );
    expect(gapFills).toHaveLength(1);
    // 9.30 * (1 - 0.01) = 9.207
    expect(gapFills[0].fillPrice).toBe(9.207);

    customBroker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'STOP',
      quantity: 500,
      stopPrice: 9.2,
      signalTime: new Date('2026-10-15T09:31:00.000Z'),
      intentId: 'stop-intraday',
    });
    const intradayFills = customBroker.onBar(
      createBar('2026-10-15T09:32:00.000Z', 9.3, 9.35, 9.15, 9.25, '600519'),
    );
    expect(intradayFills).toHaveLength(1);
    // 9.20 * (1 - 0.01) = 9.108
    expect(intradayFills[0].fillPrice).toBe(9.108);
  });

  it('TC-15: non-SELL STOP order is not executed through sell-stop path', () => {
    const buyStop = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'STOP',
      quantity: 1000,
      stopPrice: 9.5,
      signalTime: new Date('2026-10-15T09:30:00.000Z'),
      intentId: 'buy-stop-invalid',
    });

    const fills = broker.onBar(
      createBar('2026-10-15T09:31:00.000Z', 9.3, 9.4, 9.2, 9.35, '600519'),
    );
    expect(fills).toHaveLength(0);
    expect(broker.getAccount().positions.size).toBe(0);
    expect(broker.getOrder(buyStop.orderId)?.status).not.toBe('FILLED');
  });

  it('TC-16: one-word limit-down blocks triggered STOP SELL and cancels paired BUY on same bar', () => {
    broker.registerSecurity('600519', { name: '贵州茅台', preClose: 10.0 });
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-14T01:30:00.000Z'),
      intentId: 'd1-buy-stop',
    });
    broker.onBar(
      createBar('2026-10-14T02:00:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );
    broker.settleDayClose('2026-10-14');
    const cashAfterBuy = broker.getAccount().availableCash;

    const stopOrder = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'STOP',
      quantity: 1000,
      stopPrice: 9.5,
      signalTime: new Date('2026-10-15T01:30:00.000Z'),
      intentId: 'd2-stop-sell',
    });
    const pairedBuy = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-15T01:30:00.000Z'),
      intentId: 'd2-paired-buy',
    });

    const limitDownBar = createBar(
      '2026-10-15T02:00:00.000Z',
      9.0,
      9.0,
      9.0,
      9.0,
      '600519',
    );
    const fills = broker.onBar(limitDownBar);
    expect(fills).toHaveLength(0);
    expect(broker.getAccount().availableCash).toBe(cashAfterBuy);
    expect(broker.getAccount().positions.get('600519')?.totalQuantity).toBe(
      1000,
    );

    expect(broker.getOrder(stopOrder.orderId)?.status).toBe('BLOCKED');
    expect(broker.getOrder(stopOrder.orderId)?.rejectReason).toBe(
      'SELL_BLOCKED_LIMIT_DOWN',
    );
    expect(broker.getOrder(pairedBuy.orderId)?.status).toBe('CANCELLED');
    expect(broker.getOrder(pairedBuy.orderId)?.rejectReason).toBe(
      'PAIRED_SELL_BLOCKED_LIMIT_DOWN',
    );

    // 流动性打开后止损单继续成交
    broker.settleDayClose('2026-10-15');
    const openBar = createBar(
      '2026-10-16T02:00:00.000Z',
      8.8,
      9.0,
      8.7,
      8.9,
      '600519',
    );
    const nextFills = broker.onBar(openBar);
    expect(nextFills).toHaveLength(1);
    expect(nextFills[0].orderId).toBe(stopOrder.orderId);
    expect(broker.getOpenOrders()).toHaveLength(0);
  });

  it('TC-17: unfillable triggered STOP SELL transitions to REJECTED and is deleted from pendingOrders', () => {
    broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-14T09:30:00.000Z'),
      intentId: 'buy-1',
    });
    broker.onBar(
      createBar('2026-10-14T09:31:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );
    broker.settleDayClose('2026-10-14');

    // 提交两笔各 1000 股的 STOP SELL（提交时 available=1000 均通过预检）
    const stop1 = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'STOP',
      quantity: 1000,
      stopPrice: 9.5,
      signalTime: new Date('2026-10-15T09:30:00.000Z'),
      intentId: 'stop-1',
    });
    const stop2 = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'STOP',
      quantity: 1000,
      stopPrice: 9.5,
      signalTime: new Date('2026-10-15T09:30:00.000Z'),
      intentId: 'stop-2',
    });

    const fills = broker.onBar(
      createBar('2026-10-15T09:31:00.000Z', 9.2, 9.3, 9.1, 9.25, '600519'),
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].orderId).toBe(stop1.orderId);
    expect(broker.getOrder(stop2.orderId)?.status).toBe('REJECTED');
    expect(broker.getOrder(stop2.orderId)?.rejectReason).toBe(
      'INSUFFICIENT_SHARES',
    );
    expect(broker.getOpenOrders()).toHaveLength(0);

    // T+1 冻结场景：持有 1000 股可卖 + 当日新买 1000 股冻结；两笔 STOP SELL 触发，第二笔因仅剩 T+1 冻结份额被 REJECTED(T1_LOCKED_SHARES)
    const t1Broker = new SimulatedBroker(1_000_000);
    t1Broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-14T09:30:00.000Z'),
      intentId: 'd0-buy',
    });
    t1Broker.onBar(
      createBar('2026-10-14T09:31:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );
    t1Broker.settleDayClose('2026-10-14');

    // Day 1 早盘新买 1000 股成交 -> 1000 可卖 + 1000 冻结
    t1Broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-15T09:30:00.000Z'),
      intentId: 'd1-buy',
    });
    t1Broker.onBar(
      createBar('2026-10-15T09:31:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );

    const t1Stop1 = t1Broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'STOP',
      quantity: 1000,
      stopPrice: 9.5,
      signalTime: new Date('2026-10-15T09:31:00.000Z'),
      intentId: 't1-stop-1',
    });
    const t1Stop2 = t1Broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'SELL',
      orderType: 'STOP',
      quantity: 1000,
      stopPrice: 9.5,
      signalTime: new Date('2026-10-15T09:31:00.000Z'),
      intentId: 't1-stop-2',
    });
    const t1Fills = t1Broker.onBar(
      createBar('2026-10-15T09:32:00.000Z', 9.2, 9.3, 9.1, 9.25, '600519'),
    );
    expect(t1Fills).toHaveLength(1);
    expect(t1Fills[0].orderId).toBe(t1Stop1.orderId);
    expect(t1Broker.getOrder(t1Stop2.orderId)?.status).toBe('REJECTED');
    expect(t1Broker.getOrder(t1Stop2.orderId)?.rejectReason).toBe(
      'T1_LOCKED_SHARES',
    );
    expect(t1Broker.getOpenOrders()).toHaveLength(0);
  });

  it('TC-18: deriveOrderId checks orderLog so duplicate intentId never overwrites finished order history', () => {
    const first = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-14T09:30:00.000Z'),
      intentId: 'dup-intent',
    });
    broker.onBar(
      createBar('2026-10-14T09:31:00.000Z', 10.0, 10.0, 10.0, 10.0, '600519'),
    );
    expect(broker.getOrder(first.orderId)?.status).toBe('FILLED');

    const second = broker.submitOrder({
      securityId: 1,
      securityCode: '600519',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 1000,
      signalTime: new Date('2026-10-14T09:32:00.000Z'),
      intentId: 'dup-intent',
    });
    expect(second.orderId).toBe(`${first.orderId}-2`);
    expect(broker.getOrder(first.orderId)?.status).toBe('FILLED');
    expect(broker.getOrder(second.orderId)?.status).toBe('PENDING');
  });
});
