import { PaK, PinBarDirection } from '../contracts';
import { PinBarDetector } from './pin-bar';

describe('PinBarDetector (匹诺曹长影针检测)', () => {
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

  it('正确识别看涨锤头针 (Bullish Pin Bar)', () => {
    // 振幅 = 10 (100 - 90), open = 98, close = 99 (body = 1, bodyRatio = 0.1)
    // lowerWick = 98 - 90 = 8 (wickRatio = 0.8 >= 0.5)
    // 收盘在 99 (前 10% 高位)
    const klines: PaK[] = [createBar(1, 98, 100, 90, 99)];

    const pins = PinBarDetector.detect(klines);
    expect(pins).toHaveLength(1);
    expect(pins[0].direction).toBe(PinBarDirection.Bullish);
    expect(pins[0].extremePrice).toBe(90);
    expect(pins[0].wickRatio).toBe(0.8);
    expect(pins[0].bodyRatio).toBe(0.1);
  });

  it('正确识别看跌射击之星针 (Bearish Pin Bar)', () => {
    // 振幅 = 10 (110 - 100), open = 102, close = 101 (body = 1)
    // upperWick = 110 - 102 = 8 (wickRatio = 0.8)
    // 收盘在 101 (处于低位)
    const klines: PaK[] = [createBar(1, 102, 110, 100, 101)];

    const pins = PinBarDetector.detect(klines);
    expect(pins).toHaveLength(1);
    expect(pins[0].direction).toBe(PinBarDirection.Bearish);
    expect(pins[0].extremePrice).toBe(110);
    expect(pins[0].wickRatio).toBe(0.8);
  });

  it('过滤掉实体过大的假针和普通十字星', () => {
    const klines: PaK[] = [
      createBar(1, 95, 100, 90, 100), // 大阳线 (body = 5, bodyRatio = 0.5 > 0.33)
      createBar(2, 95, 96, 94, 95), // 振幅仅 2 的小十字
    ];

    const pins = PinBarDetector.detect(klines, { minRange: 3 });
    expect(pins).toHaveLength(0);
  });
});
