import { createVirtualFillAccumulator, foldVirtualFills } from './account-fold';
import { ORDER_SIDES } from '../strategy.constants';
import type { VirtualFillEvent } from './fill-log.port';

const SEED = 1_000_000_000n; // 100 万元

function fill(
  overrides: Partial<VirtualFillEvent> &
    Pick<
      VirtualFillEvent,
      'side' | 'quantity' | 'priceLi' | 'feesLi' | 'netAmountLi' | 'tradingDay'
    >,
): VirtualFillEvent {
  return {
    idempotencyKey: 'evt-x',
    securityId: 1,
    securityCode: '000001',
    ...overrides,
  };
}

describe('foldVirtualFills（REQ-LEDGER-01 账本 fold）', () => {
  it('空事件 → 种子资金空仓快照', () => {
    const snap = foldVirtualFills([], SEED, '2026-01-05');
    expect(snap.cashLi).toBe(SEED);
    expect(snap.positions.size).toBe(0);
    expect(snap.tradingDay).toBe('2026-01-05');
  });

  it('买入 → 现金净扣、持仓/成本推进、entryTime=交易日', () => {
    // 12.34 元 × 76900 股 = 948,946,000 厘；费 246,727 厘；净额含费为负
    const events = [
      fill({
        idempotencyKey: 'evt-1',
        side: ORDER_SIDES.BUY,
        quantity: 76900,
        priceLi: 12340n,
        feesLi: 246727n,
        netAmountLi: -(948946000n + 246727n),
        tradingDay: '2026-01-05',
      }),
    ];
    const snap = foldVirtualFills(events, SEED, '2026-01-05');
    expect(snap.cashLi).toBe(SEED - 948946000n - 246727n);
    const pos = snap.positions.get(1);
    expect(pos?.holdingQuantity).toBe(76900);
    expect(pos?.costPriceLi).toBe(12340n);
    expect(pos?.entryTime).toBeDefined();
    // entryTime 的上海日期 = tradingDay（T+1 判定一致性）
    expect(pos?.entryTime?.getTimezoneOffset()).toBeDefined();
    expect(pos?.entryTime?.toISOString()).toContain('2026-01-04T16:00:00'); // 00:00 +08:00
  });

  it('次日卖出 → 已实现盈亏含费用分摊，持仓清零现金回补', () => {
    const events = [
      fill({
        idempotencyKey: 'evt-1',
        side: ORDER_SIDES.BUY,
        quantity: 1000,
        priceLi: 10000n,
        feesLi: 10000n,
        netAmountLi: -(10000000n + 10000n),
        tradingDay: '2026-01-05',
      }),
      fill({
        idempotencyKey: 'evt-2',
        side: ORDER_SIDES.SELL,
        quantity: 1000,
        priceLi: 11500n,
        feesLi: 15000n,
        netAmountLi: 11500000n - 15000n,
        tradingDay: '2026-01-06',
      }),
    ];
    const snap = foldVirtualFills(events, SEED, '2026-01-06');
    // 已实现盈亏 = (11.50 × 1000 − 15) − (10.00 × 1000) = 1485 元
    const pos = snap.positions.get(1);
    expect(pos).toBeUndefined(); // 全平后不投影
    // 现金 = 种子 − 10010 + 11485 = 种子 + 1475 元 → 与状态机口径一致
    expect(snap.cashLi).toBe(SEED - 10000000n - 10000n + 11500000n - 15000n);
  });

  it('部分卖出：买入费用按比例分摊', () => {
    const events = [
      fill({
        idempotencyKey: 'evt-1',
        side: ORDER_SIDES.BUY,
        quantity: 2000,
        priceLi: 10000n,
        feesLi: 20000n,
        netAmountLi: -(20000000n + 20000n),
        tradingDay: '2026-01-05',
      }),
      fill({
        idempotencyKey: 'evt-2',
        side: ORDER_SIDES.SELL,
        quantity: 500,
        priceLi: 11000n,
        feesLi: 8000n,
        netAmountLi: 5500000n - 8000n,
        tradingDay: '2026-01-06',
      }),
    ];
    const snap = foldVirtualFills(events, SEED, '2026-01-06');
    const pos = snap.positions.get(1)!;
    expect(pos.holdingQuantity).toBe(1500);
    // 已实现 = (5500 − 8) 厘千分位… 精确：(5,500,000 − 8,000) − (500×10,000) − 20,000×(500/2000)
    //        = 5,492,000 − 5,000,000 − 5,000 = 487,000 厘
    expect(pos.realizedPnlLi).toBe(487000n);
  });

  it('跨回合重买：entryTime 重置、realizedPnl 累计', () => {
    const events = [
      fill({
        idempotencyKey: 'evt-1',
        side: ORDER_SIDES.BUY,
        quantity: 1000,
        priceLi: 10000n,
        feesLi: 10000n,
        netAmountLi: -10010000n,
        tradingDay: '2026-01-05',
      }),
      fill({
        idempotencyKey: 'evt-2',
        side: ORDER_SIDES.SELL,
        quantity: 1000,
        priceLi: 11000n,
        feesLi: 15000n,
        netAmountLi: 11000000n - 15000n,
        tradingDay: '2026-01-06',
      }),
      fill({
        idempotencyKey: 'evt-3',
        side: ORDER_SIDES.BUY,
        quantity: 1000,
        priceLi: 12000n,
        feesLi: 12000n,
        netAmountLi: -(12000000n + 12000n),
        tradingDay: '2026-01-07',
      }),
    ];
    const snap = foldVirtualFills(events, SEED, '2026-01-07');
    const pos = snap.positions.get(1)!;
    expect(pos.holdingQuantity).toBe(1000);
    expect(pos.costPriceLi).toBe(12000n);
    expect(pos.realizedPnlLi).toBe(975000n); // 第一回合：(11,000,000−15,000)−10,000,000−买费10,000 = 975,000 厘
    expect(pos.entryTime?.toISOString()).toContain('2026-01-06T16:00:00'); // 01-07 00:00 +08:00
  });

  it('createVirtualFillAccumulator 增量 apply 与 foldVirtualFills 逐字段等价且快照隔离', () => {
    const events: VirtualFillEvent[] = [
      fill({
        idempotencyKey: 'evt-1',
        side: ORDER_SIDES.BUY,
        quantity: 2000,
        priceLi: 10000n,
        feesLi: 20000n,
        netAmountLi: -(20000000n + 20000n),
        tradingDay: '2026-01-05',
      }),
      fill({
        idempotencyKey: 'evt-2',
        side: ORDER_SIDES.SELL,
        quantity: 500,
        priceLi: 11000n,
        feesLi: 8000n,
        netAmountLi: 5500000n - 8000n,
        tradingDay: '2026-01-06',
      }),
      fill({
        idempotencyKey: 'evt-3',
        side: ORDER_SIDES.SELL,
        quantity: 1500,
        priceLi: 12000n,
        feesLi: 15000n,
        netAmountLi: 18000000n - 15000n,
        tradingDay: '2026-01-07',
      }),
      fill({
        idempotencyKey: 'evt-4',
        side: ORDER_SIDES.BUY,
        quantity: 1000,
        priceLi: 12500n,
        feesLi: 12000n,
        netAmountLi: -(12500000n + 12000n),
        tradingDay: '2026-01-08',
      }),
    ];

    const acc = createVirtualFillAccumulator(SEED, '2026-01-05');
    expect(acc.snapshot('2026-01-05')).toEqual(
      foldVirtualFills([], SEED, '2026-01-05'),
    );

    const historySnapshots = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      acc.apply(ev);
      const incSnap = acc.snapshot(ev.tradingDay);
      const fullSnap = foldVirtualFills(
        events.slice(0, i + 1),
        SEED,
        ev.tradingDay,
      );
      expect(incSnap).toEqual(fullSnap);
      historySnapshots.push({ incSnap, fullSnap });
    }

    // 验证既往快照未受后续 apply 污染
    expect(historySnapshots[0].incSnap).toEqual(historySnapshots[0].fullSnap);
    expect(historySnapshots[1].incSnap).toEqual(historySnapshots[1].fullSnap);
  });
});
