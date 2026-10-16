import type { ChanK } from '@app/chancore';
import { VisualCommandService } from './visual-command.service';

function generateSampleKlines(count = 60): ChanK[] {
  const klines: ChanK[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const isUp = i % 8 < 4;
    const delta = isUp ? 2.5 : -2.0;
    const open = price;
    const close = price + delta;
    const high = Math.max(open, close) + 1.0;
    const low = Math.min(open, close) - 1.0;
    price = close;

    klines.push({
      id: i + 1,
      symbol: '000001',
      time: new Date(Date.UTC(2026, 0, 1 + i, 9, 30)),
      open,
      high,
      low,
      close,
      volume: '10000',
      amount: '1000000',
    });
  }
  return klines;
}

/** Synthetic series forming a completed UP bi (89.5 → 108.5) with a golden-pocket pullback close. */
function generateSwingKlines(): ChanK[] {
  const values: number[] = [];
  for (let i = 0; i <= 5; i += 1) values.push(100 + i * 0.4);
  for (let i = 1; i <= 20; i += 1) values.push(102 - i * 0.6);
  for (let i = 1; i <= 20; i += 1) values.push(90 + i * 0.9);
  for (let i = 1; i <= 14; i += 1) values.push(108 - i * 0.8);

  const base = new Date(Date.UTC(2026, 0, 1, 9, 30));
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

/** Monotonic rise: no completed Chan unit, so the fibonacci layer must stay empty. */
function generateNoSwingKlines(): ChanK[] {
  const base = new Date(Date.UTC(2026, 0, 1, 9, 30));
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

describe('VisualCommandService', () => {
  let service: VisualCommandService;

  beforeEach(() => {
    service = new VisualCommandService();
  });

  it('generates standard VisualCommandPayload for given K-lines', () => {
    const klines = generateSampleKlines(60);
    const start = Date.now();
    const result = service.generateCommands({
      code: '000001',
      period: 5,
      source: 'qmt',
      klines,
      layers: ['chan'],
    });
    const duration = Date.now() - start;

    expect(result.code).toBe('000001');
    expect(result.period).toBe(5);
    expect(result.source).toBe('qmt');
    expect(result.totalKlines).toBe(60);
    expect(result.commands.length).toBeGreaterThan(0);
    // Performance requirement: typically < 50ms, allow up to 200ms under parallel CI load
    expect(duration).toBeLessThan(200);
  });

  it('filters commands according to requested layer subsets', () => {
    const klines = generateSampleKlines(60);
    const result = service.generateCommands({
      code: '000001',
      period: 5,
      source: 'tdx',
      klines,
      layers: ['chan_bi'],
    });

    expect(result.commands.every((c) => c.layer === 'chan_bi')).toBe(true);
  });

  it('generates fibonacci layer commands with TradingView styles', () => {
    const klines = generateSwingKlines();
    const result = service.generateCommands({
      code: '000001',
      period: 5,
      source: 'tdx',
      klines,
      layers: ['fibonacci'],
      fibOptions: { units: 'bi' },
    });

    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.commands.every((c) => c.layer === 'fibonacci')).toBe(true);
    expect(result.commands.some((c) => c.type === 'band')).toBe(true);
    expect(result.commands.some((c) => c.type === 'line')).toBe(true);
  });

  it('emits no fibonacci commands when no completed chan swing exists', () => {
    const klines = generateNoSwingKlines();
    const result = service.generateCommands({
      code: '000001',
      period: 5,
      source: 'tdx',
      klines,
      layers: ['fibonacci'],
    });

    expect(result.commands).toEqual([]);
  });
});
