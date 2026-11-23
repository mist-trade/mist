import { LiquiditySweep, PaK, SweepType } from '../contracts';

export class LiquiditySweepDetector {
  /**
   * 检测某根 Bar 对关键结构参考位 (levelPrice) 的刺破扫损与坚决收回
   */
  public static detectSweep(
    bar: PaK,
    barIndex: number,
    levelPrice: number,
    type: SweepType,
  ): LiquiditySweep | null {
    const totalRange = bar.high - bar.low;
    if (totalRange <= 0) return null;

    if (type === SweepType.BullishSweep) {
      // 刺破支撑位 (low < levelPrice) 但收盘强力收回在支撑之上 (close >= levelPrice)
      if (bar.low < levelPrice && bar.close >= levelPrice) {
        const sweepDepth = levelPrice - bar.low;
        const rejectionWickRatio = (bar.close - bar.low) / totalRange;

        return {
          id: `sweep_bull_${bar.time.getTime()}_${barIndex}`,
          type: SweepType.BullishSweep,
          sweepIndex: barIndex,
          sweepTime: bar.time,
          levelPrice,
          extremePrice: bar.low,
          sweepDepth,
          rejectionWickRatio,
        };
      }
    } else if (type === SweepType.BearishSweep) {
      // 刺破阻力位 (high > levelPrice) 但收盘坚决被打回在阻力之下 (close <= levelPrice)
      if (bar.high > levelPrice && bar.close <= levelPrice) {
        const sweepDepth = bar.high - levelPrice;
        const rejectionWickRatio = (bar.high - bar.close) / totalRange;

        return {
          id: `sweep_bear_${bar.time.getTime()}_${barIndex}`,
          type: SweepType.BearishSweep,
          sweepIndex: barIndex,
          sweepTime: bar.time,
          levelPrice,
          extremePrice: bar.high,
          sweepDepth,
          rejectionWickRatio,
        };
      }
    }

    return null;
  }
}
