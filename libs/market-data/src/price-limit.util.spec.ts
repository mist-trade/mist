import type { StrategyBar } from './strategy-bar';
import {
  calculatePriceLimits,
  getPriceLimitRatio,
  isOneWordLimitDown,
  isOneWordLimitUp,
} from './price-limit.util';

function makeBar(
  open: number,
  high: number,
  low: number,
  close: number,
  securityCode = '600519',
): StrategyBar {
  return {
    securityId: 1,
    securityCode,
    source: 'tdx',
    period: 1440,
    timestamp: new Date('2026-10-16T15:00:00.000Z'),
    open,
    high,
    low,
    close,
    volume: '1000',
    amount: '10000',
    type: 'complete',
  };
}

describe('getPriceLimitRatio', () => {
  it('returns 0.20 for ChiNext and STAR market securities', () => {
    expect(getPriceLimitRatio('300750')).toBe(0.2);
    expect(getPriceLimitRatio('301001.SZ')).toBe(0.2);
    expect(getPriceLimitRatio('688981')).toBe(0.2);
    expect(getPriceLimitRatio('688001.SH')).toBe(0.2);
  });

  it('returns 0.10 for main board securities or unspecified code', () => {
    expect(getPriceLimitRatio('600519')).toBe(0.1);
    expect(getPriceLimitRatio('000001')).toBe(0.1);
    expect(getPriceLimitRatio()).toBe(0.1);
  });
});

describe('calculatePriceLimits', () => {
  it('calculates 10% limit correctly with rounding to 2 decimals', () => {
    const limits = calculatePriceLimits(10.0, '600519');
    expect(limits.limitUp).toBe(11.0);
    expect(limits.limitDown).toBe(9.0);
  });

  it('calculates 20% limit correctly for ChiNext', () => {
    const limits = calculatePriceLimits(10.0, '300750');
    expect(limits.limitUp).toBe(12.0);
    expect(limits.limitDown).toBe(8.0);
  });

  it('handles rounding edge cases properly', () => {
    // 10.55 * 1.1 = 11.605 -> 11.61
    // 10.55 * 0.9 = 9.495 -> 9.50
    const limits = calculatePriceLimits(10.55, '600000');
    expect(limits.limitUp).toBe(11.61);
    expect(limits.limitDown).toBe(9.5);
  });
});

describe('isOneWordLimitUp', () => {
  it('returns true when four prices are equal and equal to or above limit up', () => {
    const bar = makeBar(11.0, 11.0, 11.0, 11.0, '600519');
    expect(isOneWordLimitUp(bar, 10.0)).toBe(true);
  });

  it('returns false when bar touched limit up but opened lower or traded below (not four prices equal)', () => {
    const bar = makeBar(10.5, 11.0, 10.5, 11.0, '600519');
    expect(isOneWordLimitUp(bar, 10.0)).toBe(false);
  });

  it('returns false when four prices are equal but price did not reach limit up', () => {
    const bar = makeBar(10.5, 10.5, 10.5, 10.5, '600519');
    expect(isOneWordLimitUp(bar, 10.0)).toBe(false);
  });

  it('returns false if prevClose is invalid', () => {
    const bar = makeBar(11.0, 11.0, 11.0, 11.0, '600519');
    expect(isOneWordLimitUp(bar, 0)).toBe(false);
  });
});

describe('isOneWordLimitDown', () => {
  it('returns true when four prices are equal and equal to or below limit down', () => {
    const bar = makeBar(9.0, 9.0, 9.0, 9.0, '600519');
    expect(isOneWordLimitDown(bar, 10.0)).toBe(true);
  });

  it('returns false when bar touched limit down but opened higher or bounced', () => {
    const bar = makeBar(9.5, 9.5, 9.0, 9.0, '600519');
    expect(isOneWordLimitDown(bar, 10.0)).toBe(false);
  });

  it('returns false when four prices are equal but price is above limit down', () => {
    const bar = makeBar(9.5, 9.5, 9.5, 9.5, '600519');
    expect(isOneWordLimitDown(bar, 10.0)).toBe(false);
  });
});
