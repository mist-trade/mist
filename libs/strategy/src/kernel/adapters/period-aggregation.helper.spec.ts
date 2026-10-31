import type { StrategyBar } from '@app/market-data';
import {
  sumBarQuantity,
  resolveSessionPosition,
  shanghaiMidnightOf,
  reduceSlot,
  reduceDaily,
  DAILY_EXPECTED_BUCKETS,
} from './period-aggregation.helper';

describe('period-aggregation.helper', () => {
  describe('sumBarQuantity', () => {
    it('sums volumes correctly with Decimal8 canonical strings', () => {
      const bars: StrategyBar[] = [
        {
          securityId: 1,
          source: 'tdx',
          period: 1,
          timestamp: new Date('2026-10-30T09:31:00+08:00'),
          open: 10,
          high: 11,
          low: 9.9,
          close: 10.5,
          volume: '100.5',
          amount: '1050',
          type: 'complete',
        },
        {
          securityId: 1,
          source: 'tdx',
          period: 1,
          timestamp: new Date('2026-10-30T09:32:00+08:00'),
          open: 10.5,
          high: 12,
          low: 10.4,
          close: 11,
          volume: '200.5',
          amount: '2200',
          type: 'complete',
        },
      ];
      expect(sumBarQuantity(bars, 'volume')).toBe('301');
      expect(sumBarQuantity(bars, 'amount')).toBe('3250');
    });

    it('returns null if any bar has null volume or amount', () => {
      const bars: StrategyBar[] = [
        {
          securityId: 1,
          source: 'tdx',
          period: 1,
          timestamp: new Date('2026-10-30T09:31:00+08:00'),
          open: 10,
          high: 11,
          low: 9.9,
          close: 10.5,
          volume: null,
          amount: '1050',
          type: 'complete',
        },
      ];
      expect(sumBarQuantity(bars, 'volume')).toBeNull();
    });
  });

  describe('resolveSessionPosition', () => {
    it('resolves morning session offsets correctly', () => {
      const t = new Date('2026-10-30T09:35:00+08:00');
      const pos = resolveSessionPosition(t, 'test');
      expect(pos.minuteOffset).toBe(5);
    });

    it('resolves afternoon session offsets correctly', () => {
      const t = new Date('2026-10-30T13:10:00+08:00');
      const pos = resolveSessionPosition(t, 'test');
      expect(pos.minuteOffset).toBe(10);
    });

    it('rejects timestamps not aligned to minute', () => {
      const t = new Date('2026-10-30T09:35:15+08:00');
      expect(() => resolveSessionPosition(t, 'test bar')).toThrow(
        /test bar must be minute-aligned/,
      );
    });

    it('rejects timestamps outside trading hours', () => {
      const t = new Date('2026-10-30T12:00:00+08:00');
      expect(() => resolveSessionPosition(t, 'test bar')).toThrow(
        /test bar is outside A-share sessions/,
      );
    });
  });

  describe('shanghaiMidnightOf', () => {
    it('returns UTC+8 midnight correctly', () => {
      const t = new Date('2026-10-30T14:30:00+08:00');
      const midnight = shanghaiMidnightOf(t);
      expect(midnight.toISOString()).toBe('2026-10-29T16:00:00.000Z'); // 00:00 UTC+8
    });
  });

  describe('reduceSlot and reduceDaily', () => {
    it('returns null on empty buckets', () => {
      expect(reduceSlot(1, 'tdx', 5, 0, new Map())).toBeNull();
      expect(reduceDaily(1, 'tdx', 0, new Map())).toBeNull();
    });

    it('aggregates daily slot with expected bucket count', () => {
      const buckets = new Map<number, StrategyBar>();
      for (let i = 0; i < DAILY_EXPECTED_BUCKETS; i++) {
        buckets.set(i, {
          securityId: 1,
          source: 'tdx',
          period: 1,
          timestamp: new Date(i * 60_000),
          open: 10,
          high: 15,
          low: 8,
          close: 12,
          volume: '10',
          amount: '100',
          type: 'complete',
        });
      }
      const daily = reduceDaily(1, 'tdx', 1000, buckets);
      expect(daily?.type).toBe('complete');
      expect(daily?.period).toBe(1440);
    });
  });
});
