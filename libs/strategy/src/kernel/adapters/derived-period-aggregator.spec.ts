import type { StrategyBar } from '@app/market-data';
import { availabilityKey } from '../availability';
import { deriveRightLabeledPeriodBars } from './derived-period-aggregator';
import { InMemoryReplayPort } from './in-memory-replay-port';
import {
  DAILY_EXPECTED_BUCKETS,
  shanghaiMidnightOf,
} from './period-aggregation.helper';

function make1mDayBars(
  shanghaiDate: string,
  options: {
    readonly securityId?: number;
    readonly securityCode?: string;
    readonly basePrice?: number;
    readonly volumePerMin?: string;
    readonly amountPerMin?: string;
    readonly countMorning?: number;
    readonly countAfternoon?: number;
    readonly includeMorningTerminal?: boolean;
    readonly includeAfternoonTerminal?: boolean;
  } = {},
): StrategyBar[] {
  const {
    securityId = 9,
    securityCode = '000001',
    basePrice = 10,
    volumePerMin = '1',
    amountPerMin = '10',
    countMorning = 120,
    countAfternoon = 120,
    includeMorningTerminal = true,
    includeAfternoonTerminal = true,
  } = options;

  const morningStartMs = Date.parse(`${shanghaiDate}T09:30:00+08:00`);
  const afternoonStartMs = Date.parse(`${shanghaiDate}T13:00:00+08:00`);
  const bars: StrategyBar[] = [];

  const morningTotal = countMorning + (includeMorningTerminal ? 1 : 0);
  for (let m = 0; m < morningTotal; m += 1) {
    bars.push({
      securityId,
      securityCode,
      source: 'tdx',
      period: 1,
      timestamp: new Date(morningStartMs + m * 60_000),
      open: basePrice + m * 0.01,
      high: basePrice + 1 + m * 0.01,
      low: basePrice - 1,
      close: basePrice + 0.5 + m * 0.01,
      volume: volumePerMin,
      amount: amountPerMin,
      type: 'complete',
    });
  }

  const afternoonTotal = countAfternoon + (includeAfternoonTerminal ? 1 : 0);
  for (let m = 0; m < afternoonTotal; m += 1) {
    bars.push({
      securityId,
      securityCode,
      source: 'tdx',
      period: 1,
      timestamp: new Date(afternoonStartMs + m * 60_000),
      open: basePrice + 2 + m * 0.01,
      high: basePrice + 3 + m * 0.01,
      low: basePrice - 0.5,
      close: basePrice + 2.5 + m * 0.01,
      volume: volumePerMin,
      amount: amountPerMin,
      type: 'complete',
    });
  }

  return bars;
}

describe('deriveRightLabeledPeriodBars — [DATA-P1-02] 跨日 1440 分组聚合', () => {
  it('空输入返回空数组', () => {
    expect(deriveRightLabeledPeriodBars([], 1440)).toEqual([]);
  });

  it('单日 242 桶完整日线与缺桶日线语义保持不变', () => {
    const fullDay = make1mDayBars('2026-08-03', { basePrice: 10 });
    expect(fullDay).toHaveLength(DAILY_EXPECTED_BUCKETS);

    const derivedFull = deriveRightLabeledPeriodBars(fullDay, 1440);
    expect(derivedFull).toHaveLength(1);
    expect(derivedFull[0]).toMatchObject({
      securityId: 9,
      securityCode: '000001',
      source: 'tdx',
      period: 1440,
      timestamp: shanghaiMidnightOf(fullDay[0].timestamp),
      open: fullDay[0].open,
      close: fullDay[fullDay.length - 1].close,
      volume: String(DAILY_EXPECTED_BUCKETS),
      amount: String(DAILY_EXPECTED_BUCKETS * 10),
      type: 'complete',
    });

    const partialDay = make1mDayBars('2026-08-04', {
      countMorning: 10,
      countAfternoon: 0,
      includeMorningTerminal: false,
      includeAfternoonTerminal: false,
    });
    const derivedPartial = deriveRightLabeledPeriodBars(partialDay, 1440);
    expect(derivedPartial).toHaveLength(1);
    expect(derivedPartial[0].type).toBe('incomplete');
    expect(derivedPartial[0].volume).toBe('10');
  });

  it('跨越多个上海交易日的 1m 序列按交易日各自聚合并按时间升序输出', () => {
    const day1 = make1mDayBars('2026-08-03', {
      basePrice: 10,
      volumePerMin: '1',
      amountPerMin: '10',
    });
    const day2 = make1mDayBars('2026-08-04', {
      basePrice: 20,
      volumePerMin: '2',
      amountPerMin: '20',
      countMorning: 60,
      countAfternoon: 60,
      includeMorningTerminal: false,
      includeAfternoonTerminal: false,
    });
    const day3 = make1mDayBars('2026-08-05', {
      basePrice: 30,
      volumePerMin: '3',
      amountPerMin: '30',
    });

    // 故意乱序输入，验证按交易日归桶且输出严格升序
    const mixedInput = [...day3, ...day1, ...day2];
    const derived = deriveRightLabeledPeriodBars(mixedInput, 1440);

    expect(derived).toHaveLength(3);
    expect(derived.map((b) => b.timestamp.toISOString())).toEqual([
      '2026-08-02T16:00:00.000Z',
      '2026-08-03T16:00:00.000Z',
      '2026-08-04T16:00:00.000Z',
    ]);
    expect(derived.map((b) => b.type)).toEqual([
      'complete',
      'incomplete',
      'complete',
    ]);
    expect(derived.map((b) => b.volume)).toEqual(['242', '240', '726']);
    expect(derived[0].open).toBe(day1[0].open);
    expect(derived[0].close).toBe(day1[day1.length - 1].close);
    expect(derived[1].open).toBe(day2[0].open);
    expect(derived[1].close).toBe(day2[day2.length - 1].close);
    expect(derived[2].open).toBe(day3[0].open);
    expect(derived[2].close).toBe(day3[day3.length - 1].close);

    // 与 InMemoryReplayPort 严格递增契约兼容
    const replayPort = new InMemoryReplayPort({
      securityId: 9,
      securityCode: '000001',
      series: new Map([[1440, derived]]),
    });
    expect(replayPort).toBeDefined();
  });

  it('严格执行 availabilityKey(bar) < anchorAvailabilityMs 因果过滤', () => {
    const day1 = make1mDayBars('2026-08-03', { basePrice: 10 });
    const day2 = make1mDayBars('2026-08-04', { basePrice: 20 });
    const day3 = make1mDayBars('2026-08-05', { basePrice: 30 });

    const allBars = [...day1, ...day2, ...day3];
    // Day 3 日线的 availabilityKey = 2026-08-05 15:01 CST
    const day3AvailabilityMs = availabilityKey({
      period: 1440,
      timestamp: shanghaiMidnightOf(day3[0].timestamp),
    }).getTime();

    const filteredAtBoundary = deriveRightLabeledPeriodBars(allBars, 1440, {
      anchorAvailabilityMs: day3AvailabilityMs,
    });
    expect(filteredAtBoundary.map((b) => b.timestamp.toISOString())).toEqual([
      '2026-08-02T16:00:00.000Z',
      '2026-08-03T16:00:00.000Z',
    ]);

    const filteredAfterBoundary = deriveRightLabeledPeriodBars(allBars, 1440, {
      anchorAvailabilityMs: day3AvailabilityMs + 1,
    });
    expect(filteredAfterBoundary).toHaveLength(3);
  });

  it('日内周期派生保持右标聚合且跳过 15:01 死桶', () => {
    const bars = [
      ...make1mDayBars('2026-08-03', {
        countMorning: 5,
        countAfternoon: 0,
        includeMorningTerminal: false,
        includeAfternoonTerminal: false,
      }),
      {
        securityId: 9,
        securityCode: '000001',
        source: 'tdx' as const,
        period: 1,
        timestamp: new Date('2026-08-03T15:01:00+08:00'),
        open: 10,
        high: 10,
        low: 10,
        close: 10,
        volume: '0',
        amount: '0',
        type: 'complete' as const,
      },
    ];
    const derived5m = deriveRightLabeledPeriodBars(bars, 5);
    expect(derived5m).toHaveLength(1);
    expect(derived5m[0].timestamp.toISOString()).toBe(
      new Date('2026-08-03T09:35:00+08:00').toISOString(),
    );
    expect(derived5m[0].type).toBe('complete');
  });
});
