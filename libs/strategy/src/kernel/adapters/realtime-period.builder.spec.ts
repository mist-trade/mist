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
const MORNING_TERMINAL_MS = Date.UTC(2026, 7, 4, 3, 30, 0, 0); // 11:30 CST
const AFTERNOON_TERMINAL_MS = Date.UTC(2026, 7, 4, 7, 0, 0, 0); // 15:00 CST
const TRADING_DAY_MIDNIGHT_MS = Date.UTC(2026, 7, 3, 16, 0, 0, 0); // 00:00 CST

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

describe('RealtimePeriodBuilder（右标语义）', () => {
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
      // 右标：槽 [09:30,09:35) 的标签 = 09:35（与 canonical 历史 5m 同构）
      timestamp: new Date(SESSION_START_MS + 5 * 60_000),
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
    expect(derived5m?.timestamp).toEqual(
      new Date(AFTERNOON_START_MS + 5 * 60_000),
    );
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

describe('RealtimePeriodBuilder（终端桶吸收）', () => {
  it('defers the session-last window to the terminal bucket and absorbs it as optional constituent', () => {
    const builder = new RealtimePeriodBuilder();
    const emitted: StrategyBar[] = [];

    // 11:25..11:29（最后一窗常规成分）+ 11:30 终端桶
    for (let minute = 115; minute < 120; minute += 1) {
      const bar = barAt(minute, { volume: '1' });
      emitted.push(...builder.accept(triggerOf(bar), bar));
    }
    // 11:29 触发不得闭合最后一窗（等终端桶）
    expect(
      emitted.filter((bar) => bar.period === 5 && bar.volume === '5'),
    ).toEqual([]);
    // 11:30 终端触发闭合：6 个成分（5 常规 + 终端）
    const terminal = barAt(120, { volume: '8', close: 12 });
    emitted.push(...builder.accept(triggerOf(terminal), terminal));

    const last5m = emitted.filter((bar) => bar.period === 5).at(-1)!;
    expect(last5m.timestamp).toEqual(new Date(MORNING_TERMINAL_MS));
    expect(last5m.volume).toBe('13'); // 5 常规×1 + 终端×8
    expect(last5m.close).toBe(12); // 终端桶收盘（竞价）入最后一根
    expect(last5m.type).toBe('complete'); // 完整性只按常规 5 成分判
  });

  it('keeps the derived bar complete when the terminal bucket is discarded', () => {
    const builder = new RealtimePeriodBuilder();
    const emitted: StrategyBar[] = [];
    for (let minute = 115; minute < 120; minute += 1) {
      const bar = barAt(minute, { volume: '1' });
      emitted.push(...builder.accept(triggerOf(bar), bar));
    }
    // 终端桶 discarded（无成交打印）
    const discardedTrigger: StrategyTrigger = {
      securityId: 9,
      source: 'tdx',
      period: 1,
      timestamp: new Date(MORNING_TERMINAL_MS),
      outcome: 'discarded',
    };
    emitted.push(...builder.accept(discardedTrigger, null));

    const last5m = emitted.filter((bar) => bar.period === 5).at(-1)!;
    expect(last5m.timestamp).toEqual(new Date(MORNING_TERMINAL_MS));
    expect(last5m.type).toBe('complete'); // 常规 5 成分齐即 complete
    expect(last5m.volume).toBe('5'); // 终端缺席不造数
  });

  it('closes every session-last window on the terminal trigger without leaving orphans', () => {
    const builder = new RealtimePeriodBuilder();
    const emitted: StrategyBar[] = [];
    for (let minute = 0; minute < 120; minute += 1) {
      const bar = barAt(minute, { volume: '1' });
      emitted.push(...builder.accept(triggerOf(bar), bar));
    }
    const terminal = barAt(120, { volume: '1' });
    emitted.push(...builder.accept(triggerOf(terminal), terminal));

    // 5m：24 根（09:35..11:30）；30m：4 根（10:00..11:30）；60m：2 根（10:30/11:30）
    expect(emitted.filter((bar) => bar.period === 5)).toHaveLength(24);
    expect(emitted.filter((bar) => bar.period === 30)).toHaveLength(4);
    expect(emitted.filter((bar) => bar.period === 60)).toHaveLength(2);
    // 各周期 session 末根标签均为 11:30
    for (const period of [5, 30, 60]) {
      const last = emitted.filter((bar) => bar.period === period).at(-1)!;
      expect(last.timestamp).toEqual(new Date(MORNING_TERMINAL_MS));
    }
  });
});

describe('RealtimePeriodBuilder（1440 日线派生）', () => {
  function feedFullDay(builder: RealtimePeriodBuilder): StrategyBar[] {
    const emitted: StrategyBar[] = [];
    for (let minute = 0; minute < 120; minute += 1) {
      const bar = barAt(minute, { volume: '1' });
      emitted.push(...builder.accept(triggerOf(bar), bar, new Set([1, 1440])));
    }
    // 11:30 上午终端桶（日线第 121 成分）
    const morningTerminal = barAt(120, { volume: '1' });
    emitted.push(
      ...builder.accept(
        triggerOf(morningTerminal),
        morningTerminal,
        new Set([1, 1440]),
      ),
    );
    for (let minute = 0; minute < 120; minute += 1) {
      const bar = afternoonBarAt(minute, { volume: '1' });
      emitted.push(...builder.accept(triggerOf(bar), bar, new Set([1, 1440])));
    }
    // 15:00 终端桶
    const terminal = afternoonBarAt(120, { volume: '2', close: 42 });
    emitted.push(
      ...builder.accept(triggerOf(terminal), terminal, new Set([1, 1440])),
    );
    return emitted;
  }

  it('derives the daily bar at the afternoon terminal with 00:00 trading-day identity', () => {
    const builder = new RealtimePeriodBuilder();
    const emitted = feedFullDay(builder);

    // 15:00 之前不得出现任何日线 bar
    const dailies = emitted.filter((bar) => bar.period === 1440);
    expect(dailies).toHaveLength(1);
    const daily = dailies[0];
    expect(daily.timestamp).toEqual(new Date(TRADING_DAY_MIDNIGHT_MS));
    expect(daily.type).toBe('complete'); // 242 桶齐
    expect(daily.open).toBe(10); // 首桶开盘
    expect(daily.close).toBe(42); // 终端桶收盘（竞价价）
    // 242 桶 volume 合计：上午 121×1 + 下午 120×1 + 终端 2 = 243
    expect(daily.volume).toBe('243'); // 241×1 + 终端×2
  });

  it('marks the daily bar incomplete when buckets are missing', () => {
    const builder = new RealtimePeriodBuilder();
    const emitted: StrategyBar[] = [];
    // 只喂上午 + 少量下午，然后直接 15:00 终端触发（大量缺桶）
    for (let minute = 0; minute < 120; minute += 1) {
      const bar = barAt(minute, { volume: '1' });
      emitted.push(...builder.accept(triggerOf(bar), bar, new Set([1, 1440])));
    }
    const discardedTrigger: StrategyTrigger = {
      securityId: 9,
      source: 'tdx',
      period: 1,
      timestamp: new Date(AFTERNOON_TERMINAL_MS),
      outcome: 'discarded',
    };
    emitted.push(...builder.accept(discardedTrigger, null, new Set([1, 1440])));

    const dailies = emitted.filter((bar) => bar.period === 1440);
    expect(dailies).toHaveLength(1);
    expect(dailies[0].type).toBe('incomplete');
    expect(dailies[0].volume).toBe('120'); // 仅上午常规桶，不造数
  });

  it('does not emit a daily bar when the whole day has no sealed bucket', () => {
    const builder = new RealtimePeriodBuilder();
    const discardedTrigger: StrategyTrigger = {
      securityId: 9,
      source: 'tdx',
      period: 1,
      timestamp: new Date(AFTERNOON_TERMINAL_MS),
      outcome: 'discarded',
    };
    const emitted = builder.accept(discardedTrigger, null, new Set([1, 1440]));
    expect(emitted.filter((bar) => bar.period === 1440)).toEqual([]);
  });
});
