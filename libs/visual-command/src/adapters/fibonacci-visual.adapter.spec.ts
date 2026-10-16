import type { ChanK } from '@app/chancore';
import { FibonacciVisualAdapter } from './fibonacci-visual.adapter';

/**
 * Synthetic ChanK series forming a completed UP bi 89.5 → 108.5 (bars 25 → 45) with the
 * final close at 96.8 (61.6% retracement) — the same structure verified against the real
 * `deriveCompletedBis` derivation used by the factor plugin.
 */
function buildSwingKlines(): ChanK[] {
  const values: number[] = [];
  for (let i = 0; i <= 5; i += 1) values.push(100 + i * 0.4);
  for (let i = 1; i <= 20; i += 1) values.push(102 - i * 0.6);
  for (let i = 1; i <= 20; i += 1) values.push(90 + i * 0.9);
  for (let i = 1; i <= 14; i += 1) values.push(108 - i * 0.8);

  const base = new Date('2026-09-01T09:30:00Z');
  return values.map((value, index) => ({
    id: index + 1,
    symbol: '000001',
    time: new Date(base.getTime() + index * 5 * 60 * 1000),
    open: value,
    high: value + 0.5,
    low: value - 0.5,
    close: value,
    volume: '1000',
    amount: String(1000 * value),
  }));
}

/** Monotonic rise: no fractal pair, hence no completed Chan unit. */
function buildMonotonicKlines(): ChanK[] {
  const base = new Date('2026-09-01T09:30:00Z');
  return Array.from({ length: 60 }, (_, index) => {
    const value = 90 + index * 0.3;
    return {
      id: index + 1,
      symbol: '000001',
      time: new Date(base.getTime() + index * 5 * 60 * 1000),
      open: value,
      high: value + 0.5,
      low: value - 0.5,
      close: value,
      volume: '1000',
      amount: String(1000 * value),
    };
  });
}

describe('FibonacciVisualAdapter (Chan swing anchor)', () => {
  it('returns empty commands for empty input or when no completed swing exists', () => {
    expect(FibonacciVisualAdapter.convert([])).toEqual([]);
    expect(FibonacciVisualAdapter.convert(buildMonotonicKlines())).toEqual([]);
  });

  it('generates TradingView-styled bands, lines, and text labels anchored on the swing', () => {
    const klines = buildSwingKlines();
    const cmds = FibonacciVisualAdapter.convert(klines, { units: 'bi' });

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

    // span: from the swing start bar (index 25) to the latest bar
    const expectedStart = 25;
    const expectedEnd = klines.length - 1;
    for (const band of bands) {
      expect((band as any).fromIndex).toBe(expectedStart);
      expect((band as any).toIndex).toBe(expectedEnd);
    }
    for (const line of lines) {
      expect((line as any).startIndex).toBe(expectedStart);
      expect((line as any).endIndex).toBe(expectedEnd);
    }
  });

  it('respects includeBands: false and includeLabels: false', () => {
    const klines = buildSwingKlines();
    const cmds = FibonacciVisualAdapter.convert(klines, {
      units: 'bi',
      includeBands: false,
      includeLabels: false,
    });

    expect(cmds.every((c) => c.type === 'line')).toBe(true);
    expect(cmds.length).toBe(7);
  });

  it('returns empty commands for the duan level when no completed duan exists', () => {
    const klines = buildSwingKlines();
    expect(FibonacciVisualAdapter.convert(klines, { units: 'duan' })).toEqual(
      [],
    );
  });
});
