import type { ProjectedStrategyBar, StrategyBar } from '@app/market-data';
import {
  toChanKSeries,
  toPaKSeries,
  type PureBarSource,
} from './pure-bar-mapper';

function strategyBar(
  timestamp: string,
  overrides: Partial<StrategyBar> = {},
): StrategyBar {
  return {
    securityId: 7,
    securityCode: '000001',
    source: 'tdx',
    period: 30,
    timestamp: new Date(timestamp),
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume: '100',
    amount: '1000',
    type: 'complete',
    ...overrides,
  };
}

function projectedBar(
  timestamp: string,
  effective: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: string | null;
    amount: string | null;
  },
): ProjectedStrategyBar {
  return {
    rawBar: strategyBar(timestamp),
    tradingDay: '2024-01-02',
    ohlc: {
      raw: { open: 10, high: 11, low: 9, close: 10.5 },
      effective: {
        open: effective.open,
        high: effective.high,
        low: effective.low,
        close: effective.close,
      },
      resolution: 'backfilled',
    },
    volume: {
      raw: '100',
      effective: effective.volume,
      resolution: 'backfilled',
    },
    amount: {
      raw: '1000',
      effective: effective.amount,
      resolution: 'backfilled',
    },
  };
}

describe('pure bar mapper', () => {
  it('copies rawBar.timestamp to ChanK.time and uses effective OHLC/quantity', () => {
    const time = '2024-01-02T02:30:00.000Z';
    const [k] = toChanKSeries([
      projectedBar(time, {
        open: 10.1,
        high: 11.1,
        low: 9.1,
        close: 10.6,
        volume: '110',
        amount: '1100',
      }),
    ]);

    expect(k.id).toBe(1);
    expect(k.symbol).toBe('7');
    expect(k.time.toISOString()).toBe(time);
    expect(k.open).toBe(10.1);
    expect(k.high).toBe(11.1);
    expect(k.low).toBe(9.1);
    expect(k.close).toBe(10.6);
    expect(k.volume).toBe('110');
    expect(k.amount).toBe('1100');
  });

  it('copies timestamp to PaK.time and converts quantity without inventing values', () => {
    const first = new Date('2024-01-02T02:30:00.000Z');
    const second = new Date('2024-01-02T03:00:00.000Z');
    const rows: PureBarSource[] = [
      {
        timestamp: first,
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        volume: '0',
        amount: null,
      },
      {
        id: 42,
        timestamp: second,
        open: 10.5,
        high: 11.5,
        low: 9.5,
        close: 11,
        volume: '123.45',
        amount: 'not-a-number',
      },
    ];

    const [a, b] = toPaKSeries(rows);
    expect(a.id).toBe(1);
    expect(a.time).toBe(first);
    expect(a.volume).toBe(0);
    expect('amount' in a).toBe(false);
    expect(b.id).toBe(42);
    expect(b.time).toBe(second);
    expect(b.volume).toBe(123.45);
    expect('amount' in b).toBe(false);
  });

  it('accepts StrategyBar directly for PaK without re-labelling time', () => {
    const raw = strategyBar('2024-01-02T02:30:00.000Z');
    const [k] = toPaKSeries([raw]);

    expect(k.time).toBe(raw.timestamp);
    expect(k.open).toBe(raw.open);
    expect(k.high).toBe(raw.high);
    expect(k.low).toBe(raw.low);
    expect(k.close).toBe(raw.close);
    expect(k.volume).toBe(100);
    expect(k.amount).toBe(1000);
  });
});
