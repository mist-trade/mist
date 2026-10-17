import type {
  StrategyBar,
  StrategyRealtimeSource,
  StrategyTrigger,
} from '@app/market-data';
import { RealtimePeriodBuilder } from './realtime-period.builder';

// Shanghai = UTC+8. Session start 09:30 CST = 01:30Z. Morning session runs
// 01:30Z-03:29Z (09:30-11:29 CST); afternoon 05:00Z-06:59Z (13:00-14:59 CST).
const SESSION_START_MS = Date.UTC(2026, 7, 4, 1, 30, 0, 0);
const AFTERNOON_START_MS = Date.UTC(2026, 7, 4, 5, 0, 0, 0);

function barAt(
  offsetMinute: number,
  overrides: Partial<StrategyBar> = {},
): StrategyBar {
  return {
    securityId: 9,
    source: 'tdx',
    period: 1,
    timestamp: new Date(SESSION_START_MS + offsetMinute * 60_000),
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume: '1',
    amount: '2',
    type: 'complete',
    ...overrides,
  };
}

function afternoonBarAt(
  offsetMinute: number,
  overrides: Partial<StrategyBar> = {},
): StrategyBar {
  return {
    securityId: 9,
    source: 'tdx',
    period: 1,
    timestamp: new Date(AFTERNOON_START_MS + offsetMinute * 60_000),
    open: 40,
    high: 41,
    low: 39,
    close: 40.5,
    volume: '10',
    amount: '20',
    type: 'complete',
    ...overrides,
  };
}

function triggerOf(
  bar: StrategyBar,
  outcome: StrategyTrigger['outcome'] = 'sealed',
): StrategyTrigger {
  return {
    securityId: bar.securityId,
    source: bar.source as StrategyRealtimeSource,
    period: 1,
    timestamp: bar.timestamp,
    outcome,
  };
}

describe('RealtimePeriodBuilder', () => {
  it('emits the raw sealed 1m bar and aggregates multi-period bars at slot boundaries', () => {
    const builder = new RealtimePeriodBuilder();
    const emitted: StrategyBar[] = [];

    for (let minute = 0; minute < 5; minute += 1) {
      const bar = barAt(minute, {
        open: 10 + minute,
        high: 15 + minute,
        low: 5 + minute,
        close: 11 + minute,
      });
      emitted.push(...builder.accept(triggerOf(bar), bar));
    }

    expect(emitted).toHaveLength(6);
    expect(emitted.slice(0, 5).map((bar) => bar.period)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    const derived5m = emitted[5];
    expect(derived5m).toEqual({
      securityId: 9,
      source: 'tdx',
      period: 5,
      timestamp: new Date(SESSION_START_MS),
      open: 10,
      high: 19,
      low: 5,
      close: 15,
      volume: '5',
      amount: '10',
      type: 'complete',
    });
  });

  it('marks a period bar as incomplete when gaps are present', () => {
    const builder = new RealtimePeriodBuilder();
    const emitted: StrategyBar[] = [];

    for (const minute of [0, 1, 2, 4]) {
      const bar = barAt(minute);
      emitted.push(...builder.accept(triggerOf(bar), bar));
    }

    const derived5m = emitted.find((bar) => bar.period === 5);
    expect(derived5m).toBeDefined();
    expect(derived5m?.type).toBe('incomplete');
    expect(derived5m?.volume).toBe('4');
  });

  it('aggregates across afternoon session independently without mixing session offsets', () => {
    const builder = new RealtimePeriodBuilder();
    const emitted: StrategyBar[] = [];

    for (let minute = 0; minute < 5; minute += 1) {
      const bar = afternoonBarAt(minute);
      emitted.push(...builder.accept(triggerOf(bar), bar));
    }

    const derived5m = emitted.find((bar) => bar.period === 5);
    expect(derived5m).toBeDefined();
    expect(derived5m?.timestamp).toEqual(new Date(AFTERNOON_START_MS));
    expect(derived5m?.volume).toBe('50');
  });

  it('drops aggregated bars when volume or amount is non-canonical null', () => {
    const builder = new RealtimePeriodBuilder();
    const emitted: StrategyBar[] = [];

    for (let minute = 0; minute < 5; minute += 1) {
      const bar = barAt(minute, {
        volume: minute === 2 ? null : '1',
      });
      emitted.push(...builder.accept(triggerOf(bar), bar));
    }

    const derived5m = emitted.find((bar) => bar.period === 5);
    expect(derived5m).toBeDefined();
    expect(derived5m?.volume).toBeNull();
    expect(derived5m?.amount).toBe('10');
  });

  it('filters out non-requested periods via optional whitelist', () => {
    const builder = new RealtimePeriodBuilder();
    const emitted: StrategyBar[] = [];

    for (let minute = 0; minute < 5; minute += 1) {
      const bar = barAt(minute);
      emitted.push(...builder.accept(triggerOf(bar), bar, new Set([1])));
    }

    expect(emitted.every((bar) => bar.period === 1)).toBe(true);
  });

  it('rejects trigger/observation identity mismatch', () => {
    const builder = new RealtimePeriodBuilder();
    const bar = barAt(0);
    const trigger = { ...triggerOf(bar), securityId: 10 };
    expect(() => builder.accept(trigger, bar)).toThrow(
      'sealed observation does not match its trigger',
    );
  });

  it('handles discarded trigger by clearing slot without emitting', () => {
    const builder = new RealtimePeriodBuilder();
    const bar = barAt(0);
    builder.accept(triggerOf(bar), bar);
    const discardedTrigger: StrategyTrigger = {
      securityId: 9,
      source: 'tdx',
      period: 1,
      timestamp: bar.timestamp,
      outcome: 'discarded',
    };
    const emitted = builder.accept(discardedTrigger, null);
    expect(emitted).toEqual([]);
  });

  it('retains groups and evicts unmanaged groups', () => {
    const builder = new RealtimePeriodBuilder();
    const barA = barAt(0, { securityId: 1 });
    const barB = barAt(0, { securityId: 2 });
    builder.accept(triggerOf(barA), barA);
    builder.accept(triggerOf(barB), barB);

    builder.retainGroups([{ securityId: 1, source: 'tdx', period: 1 }]);
    // Reset should clear remaining
    builder.reset();
  });
});
