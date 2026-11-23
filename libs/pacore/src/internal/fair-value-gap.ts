import { FairValueGap, FvgMitigationStatus, FvgType, PaK } from '../contracts';

export class FairValueGapDetector {
  /**
   * 基于三棒价格失衡模型 (3-Candle Imbalance) 检测 FVG，并单调推演回补状态机
   */
  public static detect(
    klines: readonly PaK[],
    options?: { readonly minFvgSize?: number },
  ): FairValueGap[] {
    if (klines.length < 3) {
      return [];
    }

    const minSize = options?.minFvgSize ?? 0;
    const fvgs: FairValueGap[] = [];

    // 1. 三棒扫描检测
    for (let i = 2; i < klines.length; i++) {
      const k0 = klines[i - 2];
      const k1 = klines[i - 1];
      const k2 = klines[i];

      // Bullish FVG: k0.high < k2.low (第 2 根大阳线向上失衡)
      if (k2.low > k0.high) {
        const gapBottom = k0.high;
        const gapTop = k2.low;
        const gapSize = gapTop - gapBottom;

        if (gapSize > minSize) {
          const ce = (gapTop + gapBottom) / 2.0;
          const fvg: FairValueGap = {
            id: `fvg_bull_${k1.time.getTime()}_${i - 1}`,
            type: FvgType.Bullish,
            startIndex: i - 2,
            displacementIndex: i - 1,
            endIndex: i,
            startTime: k0.time,
            endTime: k2.time,
            gapTop,
            gapBottom,
            gapSize,
            consequentEncroachment: ce,
            status: FvgMitigationStatus.Unmitigated,
          };
          fvgs.push(fvg);
        }
      }
      // Bearish FVG: k0.low > k2.high (第 2 根大阴线向下失衡)
      else if (k2.high < k0.low) {
        const gapTop = k0.low;
        const gapBottom = k2.high;
        const gapSize = gapTop - gapBottom;

        if (gapSize > minSize) {
          const ce = (gapTop + gapBottom) / 2.0;
          const fvg: FairValueGap = {
            id: `fvg_bear_${k1.time.getTime()}_${i - 1}`,
            type: FvgType.Bearish,
            startIndex: i - 2,
            displacementIndex: i - 1,
            endIndex: i,
            startTime: k0.time,
            endTime: k2.time,
            gapTop,
            gapBottom,
            gapSize,
            consequentEncroachment: ce,
            status: FvgMitigationStatus.Unmitigated,
          };
          fvgs.push(fvg);
        }
      }
    }

    // 2. 纯几何状态机单调推进（追踪后续回补状态）
    const resolvedFvgs: FairValueGap[] = [];
    for (const fvg of fvgs) {
      let status = FvgMitigationStatus.Unmitigated;
      let firstMitigatedTime: Date | undefined;
      let firstMitigatedIndex: number | undefined;

      for (let j = fvg.endIndex + 1; j < klines.length; j++) {
        const kj = klines[j];

        if (fvg.type === FvgType.Bullish) {
          // 看涨 FVG 回踩检测
          if (kj.low <= fvg.gapTop) {
            if (firstMitigatedTime === undefined) {
              firstMitigatedTime = kj.time;
              firstMitigatedIndex = j;
            }

            // 若实体完全跌穿下沿 gapBottom，彻底失效
            if (kj.close < fvg.gapBottom) {
              status = FvgMitigationStatus.Invalidated;
              break;
            }
            // 跌破 50% CE 但收盘未破下沿
            else if (kj.low <= fvg.consequentEncroachment) {
              status = FvgMitigationStatus.CeFilled;
            }
            // 刺入上沿但未破 CE
            else if (status === FvgMitigationStatus.Unmitigated) {
              status = FvgMitigationStatus.Tested;
            }
          }
        } else {
          // 看跌 FVG 回抽检测
          if (kj.high >= fvg.gapBottom) {
            if (firstMitigatedTime === undefined) {
              firstMitigatedTime = kj.time;
              firstMitigatedIndex = j;
            }

            // 若实体完全涨穿上沿 gapTop，彻底失效
            if (kj.close > fvg.gapTop) {
              status = FvgMitigationStatus.Invalidated;
              break;
            }
            // 涨破 50% CE 但收盘未破上沿
            else if (kj.high >= fvg.consequentEncroachment) {
              status = FvgMitigationStatus.CeFilled;
            }
            // 刺入下沿但未破 CE
            else if (status === FvgMitigationStatus.Unmitigated) {
              status = FvgMitigationStatus.Tested;
            }
          }
        }
      }

      resolvedFvgs.push({
        ...fvg,
        status,
        firstMitigatedTime,
        firstMitigatedIndex,
      });
    }

    return resolvedFvgs;
  }
}
