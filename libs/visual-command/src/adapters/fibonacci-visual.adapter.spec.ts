import {
  FibonacciVisualAdapter,
  type FibonacciVisualKLine,
} from './fibonacci-visual.adapter';

function generateMockKlines(count: number): FibonacciVisualKLine[] {
  const klines: FibonacciVisualKLine[] = [];
  const baseDate = new Date('2026-09-01T09:30:00Z');

  for (let i = 0; i < count; i++) {
    const time = new Date(baseDate.getTime() + i * 5 * 60 * 1000);
    const high = i === 10 ? 25 : 15 + (i % 5);
    const low = i === 0 ? 10 : 12;
    const close = 14;
    klines.push({ time, high, low, close });
  }

  return klines;
}

describe('FibonacciVisualAdapter', () => {
  it('returns empty commands when klines are fewer than required period', () => {
    const klines = generateMockKlines(10);
    const cmds = FibonacciVisualAdapter.convert(klines, { period: 20 });
    expect(cmds).toEqual([]);
  });

  it('generates TradingView-styled bands, lines, and text labels', () => {
    const klines = generateMockKlines(30);
    const cmds = FibonacciVisualAdapter.convert(klines, { period: 20 });

    expect(cmds.length).toBeGreaterThan(0);

    const bands = cmds.filter((c) => c.type === 'band');
    const lines = cmds.filter((c) => c.type === 'line');
    const texts = cmds.filter((c) => c.type === 'text');

    // 5 adjacent band intervals (0.236~0.382, 0.382~0.5, 0.5~0.618, 0.618~0.786, 0.786~1.0)
    expect(bands.length).toBe(5);
    const gpBand = bands.find((b) => b.id.includes('0.5_0.618'));
    expect(gpBand).toBeDefined();
    expect(gpBand?.color).toBe('rgba(8, 153, 129, 0.12)'); // TradingView Golden Pocket

    // 7 horizontal levels (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1)
    expect(lines.length).toBe(7);
    const line618 = lines.find((l) => l.id.includes('_0.618_'));
    expect(line618).toBeDefined();
    expect(line618?.color).toBe('#089981'); // TradingView Teal

    // 7 text labels
    expect(texts.length).toBe(7);
    const text618 = texts.find((t) => t.id.includes('_0.618_'));
    expect(text618).toBeDefined();
    expect((text618 as any).text).toContain('0.618');
  });

  it('respects includeBands: false and includeLabels: false', () => {
    const klines = generateMockKlines(30);
    const cmds = FibonacciVisualAdapter.convert(klines, {
      period: 20,
      includeBands: false,
      includeLabels: false,
    });

    expect(cmds.every((c) => c.type === 'line')).toBe(true);
    expect(cmds.length).toBe(7);
  });
});
