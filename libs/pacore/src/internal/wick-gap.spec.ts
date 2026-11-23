import { PaK, PinBarDirection } from '../contracts';
import { WickGapDetector } from './wick-gap';

describe('WickGapDetector (影线流动性真空区)', () => {
  const baseTime = new Date('2026-01-01T09:30:00Z').getTime();
  const createBar = (
    id: number,
    open: number,
    high: number,
    low: number,
    close: number,
  ): PaK => ({
    id,
    time: new Date(baseTime + id * 5 * 60 * 1000),
    open,
    high,
    low,
    close,
  });

  it('检测长下影线真空区并计算 50% CE', () => {
    // open = 105, close = 106 (body = 1), high = 106.5, low = 95
    // lowerWick = 105 - 95 = 10 (10 >= 2 * 1)
    const klines: PaK[] = [createBar(1, 105, 106.5, 95, 106)];

    const wickGaps = WickGapDetector.detect(klines);
    expect(wickGaps).toHaveLength(1);
    expect(wickGaps[0].direction).toBe(PinBarDirection.Bullish);
    expect(wickGaps[0].bottom).toBe(95);
    expect(wickGaps[0].top).toBe(105);
    expect(wickGaps[0].size).toBe(10);
    expect(wickGaps[0].consequentEncroachment).toBe(100);
  });
});
