import type { StrategyBar } from './strategy-bar';
import {
  calculatePriceLimits,
  getPriceLimitRatio,
  isBseMarket,
  isChiNextOrStarMarket,
  isEtfSecurity,
  isOneWordLimitDown,
  isOneWordLimitUp,
  isStSecurity,
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

describe('isEtfSecurity', () => {
  it('correctly recognizes all ETF code series including 516, 517, 56x', () => {
    expect(isEtfSecurity('510050')).toBe(true);
    expect(isEtfSecurity('512010.SH')).toBe(true);
    expect(isEtfSecurity('516160')).toBe(true); // 产业 ETF
    expect(isEtfSecurity('517050')).toBe(true); // 港股通 ETF
    expect(isEtfSecurity('560010')).toBe(true); // 56x ETF
    expect(isEtfSecurity('563000.SH')).toBe(true); // 56x ETF
    expect(isEtfSecurity('588000')).toBe(true); // 科创 50 ETF
    expect(isEtfSecurity('159915')).toBe(true); // 创业板 ETF
    expect(isEtfSecurity('600519')).toBe(false);
    expect(isEtfSecurity('000001')).toBe(false);
  });
});

describe('isChiNextOrStarMarket', () => {
  it('identifies ChiNext, STAR 688, and STAR CDR 689', () => {
    expect(isChiNextOrStarMarket('300750')).toBe(true);
    expect(isChiNextOrStarMarket('301001.SZ')).toBe(true);
    expect(isChiNextOrStarMarket('688981')).toBe(true);
    expect(isChiNextOrStarMarket('689009')).toBe(true);
    expect(isChiNextOrStarMarket('600519')).toBe(false);
  });
});

describe('isBseMarket', () => {
  it('identifies Beijing Stock Exchange stock prefixes', () => {
    expect(isBseMarket('832000')).toBe(true);
    expect(isBseMarket('430047.BJ')).toBe(true);
    expect(isBseMarket('871981')).toBe(true);
    expect(isBseMarket('920002')).toBe(true);
    expect(isBseMarket('600519')).toBe(false);
  });
});

describe('isStSecurity', () => {
  it('identifies ST and *ST security names or symbols', () => {
    expect(isStSecurity('*ST某某')).toBe(true);
    expect(isStSecurity('ST平安')).toBe(true);
    expect(isStSecurity('sst股票')).toBe(true);
    expect(isStSecurity('贵州茅台')).toBe(false);
  });
});

describe('getPriceLimitRatio', () => {
  it('returns 0.20 for ChiNext, STAR market, and STAR CDR securities', () => {
    expect(getPriceLimitRatio('300750')).toBe(0.2);
    expect(getPriceLimitRatio('301001.SZ')).toBe(0.2);
    expect(getPriceLimitRatio('688981')).toBe(0.2);
    expect(getPriceLimitRatio('688001.SH')).toBe(0.2);
    expect(getPriceLimitRatio('689009')).toBe(0.2); // 科创板 CDR
  });

  it('returns 0.30 for Beijing Stock Exchange (BSE) securities', () => {
    expect(getPriceLimitRatio('832000')).toBe(0.3);
    expect(getPriceLimitRatio('430047.BJ')).toBe(0.3);
    expect(getPriceLimitRatio('871981')).toBe(0.3);
    expect(getPriceLimitRatio('920002')).toBe(0.3);
  });

  it('returns 0.05 for ST or *ST securities when indicated', () => {
    expect(getPriceLimitRatio('600000', '*ST某某')).toBe(0.05);
    expect(getPriceLimitRatio('000001', 'ST平安')).toBe(0.05);
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

  it('calculates 5% limit correctly for ST stock by securityName', () => {
    const limits = calculatePriceLimits(10.0, '600000', '*ST某某');
    expect(limits.limitUp).toBe(10.5);
    expect(limits.limitDown).toBe(9.5);
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

  it('returns true for ST stock hitting 5% limit up with securityName', () => {
    const bar = makeBar(10.5, 10.5, 10.5, 10.5, '600000');
    expect(isOneWordLimitUp(bar, 10.0, '*ST某某')).toBe(true);
  });

  it('returns false for ST stock at 10.5 when evaluated as normal main board (without ST name)', () => {
    const bar = makeBar(10.5, 10.5, 10.5, 10.5, '600000');
    expect(isOneWordLimitUp(bar, 10.0)).toBe(false);
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

  it('returns true for ST stock hitting 5% limit down with securityName', () => {
    const bar = makeBar(9.5, 9.5, 9.5, 9.5, '600000');
    expect(isOneWordLimitDown(bar, 10.0, '*ST某某')).toBe(true);
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
