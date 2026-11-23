import { PaK, PinBar, PinBarDirection } from '../contracts';

export class PinBarDetector {
  /**
   * 严格按照微观动力学检测 Pin Bar (匹诺曹长影针)
   */
  public static detect(
    klines: readonly PaK[],
    options?: {
      readonly minWickRatio?: number;
      readonly maxBodyRatio?: number;
      readonly minRange?: number;
    },
  ): PinBar[] {
    const minWickRatio = options?.minWickRatio ?? 0.5;
    const maxBodyRatio = options?.maxBodyRatio ?? 0.33;
    const minRange = options?.minRange ?? 0;
    const pinBars: PinBar[] = [];

    for (let i = 0; i < klines.length; i++) {
      const k = klines[i];
      const totalRange = k.high - k.low;
      if (totalRange <= 0 || totalRange < minRange) continue;

      const body = Math.abs(k.close - k.open);
      const bodyRatio = body / totalRange;
      if (bodyRatio > maxBodyRatio) continue;

      const lowerWick = Math.min(k.open, k.close) - k.low;
      const upperWick = k.high - Math.max(k.open, k.close);

      // 看涨探底针 (Bullish Pin Bar)
      const lowerWickRatio = lowerWick / totalRange;
      if (lowerWickRatio >= minWickRatio && lowerWick > upperWick) {
        // 收盘价必须在全振幅的中高位 (前 50% 乃至 33%)
        if (k.close >= k.low + totalRange * 0.5) {
          pinBars.push({
            index: i,
            time: k.time,
            direction: PinBarDirection.Bullish,
            totalRange,
            wickRatio: lowerWickRatio,
            bodyRatio,
            extremePrice: k.low,
          });
        }
      }

      // 看跌冲高受阻针 (Bearish Pin Bar)
      const upperWickRatio = upperWick / totalRange;
      if (upperWickRatio >= minWickRatio && upperWick > lowerWick) {
        // 收盘价必须在全振幅的中低位
        if (k.close <= k.low + totalRange * 0.5) {
          pinBars.push({
            index: i,
            time: k.time,
            direction: PinBarDirection.Bearish,
            totalRange,
            wickRatio: upperWickRatio,
            bodyRatio,
            extremePrice: k.high,
          });
        }
      }
    }

    return pinBars;
  }
}
