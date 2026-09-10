import type { ProjectedStrategyBar } from '@app/market-data';
import type { FactorContext } from '../factor.types';
import { FibonacciRetracementPlugin } from './fibonacci.plugin';

function makeMockBar(
  time: Date,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 10000,
): ProjectedStrategyBar {
  return {
    rawBar: {
      securityId: 1,
      source: 'tdx',
      period: 5,
      timestamp: time,
      open,
      high,
      low,
      close,
      volume: String(volume),
      amount: String(volume * close),
      type: 'complete',
    },
    tradingDay: '2026-09-07',
    ohlc: {
      raw: { open, high, low, close },
      effective: { open, high, low, close },
      resolution: 'observed',
    },
    volume: {
      raw: String(volume),
      effective: String(volume),
      resolution: 'observed',
    },
    amount: {
      raw: String(volume * close),
      effective: String(volume * close),
      resolution: 'observed',
    },
  };
}

describe('FibonacciRetracementPlugin', () => {
  const plugin = new FibonacciRetracementPlugin();

  it('has valid metadata in TECHNICAL category', () => {
    expect(plugin.id).toBe('plugin.technical.fibonacci');
    expect(plugin.category).toBe('TECHNICAL');
    expect(plugin.name).toContain('斐波那契');
  });

  it('returns NEUTRAL with 0 confidence when bars are insufficient', async () => {
    const context: FactorContext = {
      securityId: 1,
      securityCode: '000001',
      timestamp: new Date('2026-09-01T15:00:00Z'),
      period: 1440,
      bars: [makeMockBar(new Date('2026-09-01T15:00:00Z'), 10, 12, 9, 11)],
      attributes: new Map(),
    };

    const opinion = await plugin.evaluate(context, { period: 10 });
    expect(opinion.action).toBe('NEUTRAL');
    expect(opinion.confidence).toBe(0.0);
    expect(opinion.reason).toContain('K线数量不足');
  });

  it('triggers BUY when price pulls back into Golden Pocket (0.500 ~ 0.618)', async () => {
    // 10 bars: Max High is 20, Min Low is 10 (diff = 10)
    // 55% pullback: close = 20 - 5.5 = 14.5
    const bars: ProjectedStrategyBar[] = [
      makeMockBar(new Date('2026-09-01T10:00:00Z'), 12, 15, 10, 12),
      makeMockBar(new Date('2026-09-01T10:01:00Z'), 12, 16, 11, 14),
      makeMockBar(new Date('2026-09-01T10:02:00Z'), 14, 18, 12, 16),
      makeMockBar(new Date('2026-09-01T10:03:00Z'), 16, 20, 14, 19), // Peak 20
      makeMockBar(new Date('2026-09-01T10:04:00Z'), 19, 19, 15, 17),
      makeMockBar(new Date('2026-09-01T10:05:00Z'), 17, 18, 14, 16),
      makeMockBar(new Date('2026-09-01T10:06:00Z'), 16, 17, 13, 15.5),
      makeMockBar(new Date('2026-09-01T10:07:00Z'), 15.5, 16, 12, 15),
      makeMockBar(new Date('2026-09-01T10:08:00Z'), 15, 15.5, 12, 14.8),
      makeMockBar(new Date('2026-09-01T10:09:00Z'), 14.8, 15, 12, 14.5), // Close 14.5 -> 55% pullback
    ];

    const context: FactorContext = {
      securityId: 1,
      securityCode: '000001',
      timestamp: new Date('2026-09-01T10:09:00Z'),
      period: 5,
      bars,
      attributes: new Map(),
    };

    const opinion = await plugin.evaluate(context, { period: 10 });
    expect(opinion.action).toBe('BUY');
    expect(opinion.confidence).toBe(0.75);
    expect(opinion.reason).toContain('黄金口袋');
    expect(opinion.evidence?.isGoldenPocket).toBe(true);
    expect(opinion.evidence?.ratio).toBe(0.55);
    expect(opinion.evidence?.levels).toBeDefined();
    expect(opinion.evidence?.styles).toBeDefined();
  });

  it('triggers SELL when direction is rebound and price bounces to Golden Pocket', async () => {
    // High is 20, Low is 10 (diff = 10). Close is 15.5 (55% rebound from low 10)
    const bars: ProjectedStrategyBar[] = [
      makeMockBar(new Date('2026-09-01T10:00:00Z'), 18, 20, 16, 18), // High 20
      makeMockBar(new Date('2026-09-01T10:01:00Z'), 18, 18, 14, 15),
      makeMockBar(new Date('2026-09-01T10:02:00Z'), 15, 15, 12, 12.5),
      makeMockBar(new Date('2026-09-01T10:03:00Z'), 12.5, 13, 10, 10.5), // Low 10
      makeMockBar(new Date('2026-09-01T10:04:00Z'), 10.5, 12, 10.2, 11.5),
      makeMockBar(new Date('2026-09-01T10:05:00Z'), 11.5, 13, 11, 12.8),
      makeMockBar(new Date('2026-09-01T10:06:00Z'), 12.8, 14, 12, 13.5),
      makeMockBar(new Date('2026-09-01T10:07:00Z'), 13.5, 15, 13, 14.5),
      makeMockBar(new Date('2026-09-01T10:08:00Z'), 14.5, 15.8, 14, 15.0),
      makeMockBar(new Date('2026-09-01T10:09:00Z'), 15.0, 16.0, 14.8, 15.5), // Rebound to 15.5
    ];

    const context: FactorContext = {
      securityId: 1,
      securityCode: '000001',
      timestamp: new Date('2026-09-01T10:09:00Z'),
      period: 5,
      bars,
      attributes: new Map(),
    };

    const opinion = await plugin.evaluate(context, {
      period: 10,
      direction: 'rebound',
    });
    expect(opinion.action).toBe('SELL');
    expect(opinion.confidence).toBe(0.75);
    expect(opinion.reason).toContain('黄金口袋阻力区');
  });

  it('returns NEUTRAL when price is in shallow pullback', async () => {
    // High is 20, Low is 10. Close is 18 (20% pullback)
    const bars: ProjectedStrategyBar[] = [
      makeMockBar(new Date('2026-09-01T10:00:00Z'), 12, 15, 10, 12),
      makeMockBar(new Date('2026-09-01T10:01:00Z'), 12, 16, 11, 14),
      makeMockBar(new Date('2026-09-01T10:02:00Z'), 14, 18, 12, 16),
      makeMockBar(new Date('2026-09-01T10:03:00Z'), 16, 20, 14, 19), // Peak 20
      makeMockBar(new Date('2026-09-01T10:04:00Z'), 19, 19.5, 17, 18.5),
      makeMockBar(new Date('2026-09-01T10:05:00Z'), 18.5, 19, 17, 18.2),
      makeMockBar(new Date('2026-09-01T10:06:00Z'), 18.2, 18.8, 17, 18.0),
      makeMockBar(new Date('2026-09-01T10:07:00Z'), 18.0, 18.5, 17, 18.1),
      makeMockBar(new Date('2026-09-01T10:08:00Z'), 18.1, 18.5, 17.5, 18.0),
      makeMockBar(new Date('2026-09-01T10:09:00Z'), 18.0, 18.4, 17.5, 18.0), // Close 18 (20% pullback)
    ];

    const context: FactorContext = {
      securityId: 1,
      securityCode: '000001',
      timestamp: new Date('2026-09-01T10:09:00Z'),
      period: 5,
      bars,
      attributes: new Map(),
    };

    const opinion = await plugin.evaluate(context, { period: 10 });
    expect(opinion.action).toBe('NEUTRAL');
    expect(opinion.confidence).toBe(0.0);
    expect(opinion.reason).toContain('浅度回调');
  });
});
