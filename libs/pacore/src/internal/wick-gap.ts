import { PaK, PinBarDirection, WickGap } from '../contracts';

export class WickGapDetector {
  /**
   * 检测单根 K 线上的长影线流动性真空区 (Wick-as-Gap)
   */
  public static detect(
    klines: readonly PaK[],
    options?: {
      readonly minWickSize?: number;
      readonly wickToBodyMultiple?: number;
    },
  ): WickGap[] {
    const minSize = options?.minWickSize ?? 0;
    const multiple = options?.wickToBodyMultiple ?? 2.0;
    const wickGaps: WickGap[] = [];

    for (let i = 0; i < klines.length; i++) {
      const k = klines[i];
      const range = k.high - k.low;
      if (range <= 0) continue;

      const body = Math.abs(k.close - k.open);
      const lowerWick = Math.min(k.open, k.close) - k.low;
      const upperWick = k.high - Math.max(k.open, k.close);

      // 看涨下影线真空区
      if (
        lowerWick >= minSize &&
        lowerWick >= body * multiple &&
        lowerWick > upperWick
      ) {
        const bottom = k.low;
        const top = Math.min(k.open, k.close);
        const ce = (bottom + top) / 2.0;

        wickGaps.push({
          id: `wick_bull_${k.time.getTime()}_${i}`,
          barIndex: i,
          time: k.time,
          direction: PinBarDirection.Bullish,
          top,
          bottom,
          size: top - bottom,
          consequentEncroachment: ce,
        });
      }
      // 看跌上影线真空区
      else if (
        upperWick >= minSize &&
        upperWick >= body * multiple &&
        upperWick > lowerWick
      ) {
        const bottom = Math.max(k.open, k.close);
        const top = k.high;
        const ce = (bottom + top) / 2.0;

        wickGaps.push({
          id: `wick_bear_${k.time.getTime()}_${i}`,
          barIndex: i,
          time: k.time,
          direction: PinBarDirection.Bearish,
          top,
          bottom,
          size: top - bottom,
          consequentEncroachment: ce,
        });
      }
    }

    return wickGaps;
  }
}
