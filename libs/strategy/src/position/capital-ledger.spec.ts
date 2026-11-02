import type { StrategyBar } from '@app/market-data';
import { ORDER_SIDES } from '../strategy.constants';
import type { OrderFilledEvent } from '../execution/execution.types';
import { CapitalLedger } from './capital-ledger';
import { PositionStateMachine } from './position-state-machine';

function createFillEvent(
  side: OrderFilledEvent['side'],
  fillPrice: number,
  filledQuantity: number,
  fees: number,
  fillTime: Date,
): OrderFilledEvent {
  const turnover = Math.round(fillPrice * filledQuantity * 100) / 100;
  const netAmount =
    side === ORDER_SIDES.BUY ? -(turnover + fees) : turnover - fees;
  return {
    securityId: 1,
    securityCode: '600519',
    side,
    fillPrice,
    filledQuantity,
    turnover,
    fillTime,
    fees: {
      commission: fees,
      stampDuty: 0,
      transferFee: 0,
      totalFees: fees,
    },
    netAmount,
  } as OrderFilledEvent;
}

function createBar(timestamp: string, close: number): StrategyBar {
  return {
    securityId: 1,
    securityCode: '600519',
    source: 'tdx',
    period: 1440,
    timestamp: new Date(timestamp),
    open: close - 0.1,
    high: close + 0.2,
    low: close - 0.2,
    close,
    volume: '10000',
    amount: '100000',
    type: 'complete',
  };
}

describe('CapitalLedger', () => {
  it('初始资金与成交现金流记账（买入为负、卖出为正）', () => {
    const ledger = new CapitalLedger({ initialCash: 1_000_000 });
    expect(ledger.getCash()).toBe(1_000_000);

    ledger.applyFill(
      createFillEvent(
        ORDER_SIDES.BUY,
        10.0,
        1000,
        10,
        new Date('2026-10-15T09:31:00.000Z'),
      ),
    );
    expect(ledger.getCash()).toBe(989_990);

    ledger.applyFill(
      createFillEvent(
        ORDER_SIDES.SELL,
        11.5,
        1000,
        10,
        new Date('2026-10-17T09:31:00.000Z'),
      ),
    );
    expect(ledger.getCash()).toBe(1_001_480);
  });

  it('日切净值曲线：现金 + 持仓市值，含环比收益', () => {
    const position = new PositionStateMachine(1, '600519');
    const ledger = new CapitalLedger({ initialCash: 1_000_000 });

    const entry = createFillEvent(
      ORDER_SIDES.BUY,
      10.0,
      1000,
      10,
      new Date('2026-10-12T09:31:00.000Z'),
    );
    position.onOrderFilled(entry);
    ledger.applyFill(entry);
    expect(ledger.getCash()).toBe(989_990);

    const nav1 = ledger.onDayClose(
      createBar('2026-10-12T15:00:00.000Z', 10.2),
      position.getSnapshot(),
    );
    expect(nav1.date).toBe('2026-10-12');
    expect(nav1.marketValue).toBe(10_200);
    expect(nav1.cash).toBe(989_990);
    expect(nav1.totalEquity).toBe(1_000_190);

    const nav2 = ledger.onDayClose(
      createBar('2026-10-13T15:00:00.000Z', 10.5),
      position.getSnapshot(),
    );
    expect(nav2.marketValue).toBe(10_500);
    expect(nav2.totalEquity).toBe(1_000_490);
    expect(nav2.dailyReturn).toBe(0.0003);

    const nav3 = ledger.onDayClose(
      createBar('2026-10-14T15:00:00.000Z', 10.1),
      position.getSnapshot(),
    );
    expect(nav3.totalEquity).toBe(1_000_090);

    expect(ledger.getNavHistory()).toHaveLength(3);
  });
});
