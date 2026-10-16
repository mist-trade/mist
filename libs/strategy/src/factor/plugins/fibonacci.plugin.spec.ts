import type { ProjectedStrategyBar } from '@app/market-data';
import type { FactorContext } from '../factor.types';
import { FibonacciRetracementPlugin } from './fibonacci.plugin';

/**
 * Synthetic series used by the Chan-anchored Fibonacci tests. The series are designed so
 * the real `@app/chancore` derivation produces exactly the stated completed units
 * (verified against `deriveCompletedBis` while authoring these tests):
 * - pullback: completed UP bi 89.5 → 108.5, final close 96.8 (61.6% retracement);
 * - rebound: completed DOWN bi 110.5 → 97.5, final close 104.6 (54.6% rebound);
 * - monotonic: no fractal pair → no completed unit at all.
 */
function makeMockBar(time: Date, value: number): ProjectedStrategyBar {
  const high = value + 0.5;
  const low = value - 0.5;
  return {
    rawBar: {
      securityId: 1,
      source: 'tdx',
      period: 5,
      timestamp: time,
      open: value,
      high,
      low,
      close: value,
      volume: '1000',
      amount: String(1000 * value),
      type: 'complete',
    },
    tradingDay: '2026-09-07',
    ohlc: {
      raw: { open: value, high, low, close: value },
      effective: { open: value, high, low, close: value },
      resolution: 'observed',
    },
    volume: {
      raw: '1000',
      effective: '1000',
      resolution: 'observed',
    },
    amount: {
      raw: String(1000 * value),
      effective: String(1000 * value),
      resolution: 'observed',
    },
  } as unknown as ProjectedStrategyBar;
}

function toBars(values: number[]): ProjectedStrategyBar[] {
  const start = new Date('2026-09-07T01:30:00.000Z');
  return values.map((value, index) =>
    makeMockBar(new Date(start.getTime() + index * 60_000), value),
  );
}

function makeContext(bars: ProjectedStrategyBar[]): FactorContext {
  return {
    securityId: 1,
    securityCode: '000001',
    timestamp:
      bars.length > 0
        ? bars[bars.length - 1].rawBar.timestamp
        : new Date('2026-09-07T01:30:00.000Z'),
    period: 5,
    bars,
    attributes: new Map(),
  };
}

/** Up swing then a pullback into the golden pocket of the completed up bi. */
function pullbackSeries(): number[] {
  const values: number[] = [];
  for (let i = 0; i <= 5; i += 1) values.push(100 + i * 0.4);
  for (let i = 1; i <= 20; i += 1) values.push(102 - i * 0.6);
  for (let i = 1; i <= 20; i += 1) values.push(90 + i * 0.9);
  for (let i = 1; i <= 14; i += 1) values.push(108 - i * 0.8);
  return values;
}

/** Down swing then a rebound into the golden pocket of the completed down bi. */
function reboundSeries(): number[] {
  const values: number[] = [];
  for (let i = 0; i <= 5; i += 1) values.push(102 - i * 0.4);
  for (let i = 1; i <= 20; i += 1) values.push(100 + i * 0.5);
  for (let i = 1; i <= 20; i += 1) values.push(110 - i * 0.6);
  for (let i = 1; i <= 10; i += 1) values.push(98 + i * 0.66);
  return values;
}

/** Monotonic rise: no fractal pair, hence no completed bi/duan. */
function monotonicSeries(): number[] {
  return Array.from({ length: 60 }, (_, i) => 90 + i * 0.3);
}

describe('FibonacciRetracementPlugin (Chan swing anchor)', () => {
  const plugin = new FibonacciRetracementPlugin();

  it('has valid metadata in TECHNICAL category with the Chan-anchor parameter schema', () => {
    expect(plugin.id).toBe('plugin.technical.fibonacci');
    expect(plugin.category).toBe('TECHNICAL');
    expect(plugin.name).toContain('斐波那契');
    expect(plugin.paramSchema.units.default).toBe('bi');
    expect('period' in plugin.paramSchema).toBe(false);
  });

  it('returns NEUTRAL with 0 confidence when bars are insufficient for the bi derivation', async () => {
    const context = makeContext(toBars(pullbackSeries().slice(0, 49)));
    const opinion = await plugin.evaluate(context);

    expect(opinion.action).toBe('NEUTRAL');
    expect(opinion.confidence).toBe(0.0);
    expect(opinion.reason).toContain('K线数量不足');
  });

  it('returns NEUTRAL when the duan level is requested without enough bars for a duan', async () => {
    const context = makeContext(toBars(pullbackSeries()));
    const opinion = await plugin.evaluate(context, { units: 'duan' });

    expect(opinion.action).toBe('NEUTRAL');
    expect(opinion.reason).toContain('K线数量不足');
  });

  it('returns NEUTRAL when no completed chan swing exists (never falls back to a rolling window)', async () => {
    const context = makeContext(toBars(monotonicSeries()));
    const opinion = await plugin.evaluate(context);

    expect(opinion.action).toBe('NEUTRAL');
    expect(opinion.confidence).toBe(0.0);
    expect(opinion.reason).toContain('不回退滚动窗口');
    expect(opinion.evidence?.insufficientSwing).toBe(true);
  });

  it('triggers BUY when price pulls back into the golden pocket of the completed up bi', async () => {
    const context = makeContext(toBars(pullbackSeries()));
    const opinion = await plugin.evaluate(context);

    expect(opinion.action).toBe('BUY');
    expect(opinion.confidence).toBe(0.75);
    expect(opinion.reason).toContain('黄金口袋');
    expect(opinion.evidence?.isGoldenPocket).toBe(true);
    expect(Number(opinion.evidence?.ratio)).toBeCloseTo(0.6158, 4);
    expect(opinion.evidence?.swingDirection).toBe('up');
    expect(opinion.evidence?.units).toBe('bi');
    expect(opinion.evidence?.swingHigh).toBeCloseTo(108.5, 6);
    expect(opinion.evidence?.swingLow).toBeCloseTo(89.5, 6);
    expect(typeof opinion.evidence?.swingStartTime).toBe('string');
    expect(typeof opinion.evidence?.swingEndTime).toBe('string');
    expect(opinion.evidence?.levels).toBeDefined();
    expect(opinion.evidence?.styles).toBeDefined();
  });

  it('triggers SELL when price rebounds into the golden pocket of the completed down bi', async () => {
    const context = makeContext(toBars(reboundSeries()));
    const opinion = await plugin.evaluate(context, { direction: 'rebound' });

    expect(opinion.action).toBe('SELL');
    expect(opinion.confidence).toBe(0.75);
    expect(opinion.reason).toContain('黄金口袋');
    expect(opinion.evidence?.isGoldenPocket).toBe(true);
    expect(Number(opinion.evidence?.ratio)).toBeCloseTo(0.5462, 4);
    expect(opinion.evidence?.swingDirection).toBe('down');
    expect(opinion.evidence?.swingHigh).toBeCloseTo(110.5, 6);
    expect(opinion.evidence?.swingLow).toBeCloseTo(97.5, 6);
  });

  it('stays NEUTRAL when the enabled direction does not match the completed swing direction', async () => {
    const context = makeContext(toBars(reboundSeries()));
    const opinion = await plugin.evaluate(context);

    expect(opinion.action).toBe('NEUTRAL');
    expect(opinion.evidence?.swingDirection).toBe('down');
  });

  it('is deterministic for identical inputs', async () => {
    const context = makeContext(toBars(pullbackSeries()));
    const first = await plugin.evaluate(context);
    const second = await plugin.evaluate(context);

    expect(second).toEqual(first);
  });
});
