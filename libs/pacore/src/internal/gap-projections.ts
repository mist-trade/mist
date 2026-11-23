import { FairValueGap, FvgType, GapProjection } from '../contracts';

export class GapProjectionEngine {
  /**
   * 基于失衡缺口及其 50% CE 轴心，计算 1:1 对称度量投射与标准差扩展目标箱体
   */
  public static project(
    fvg: FairValueGap,
    originPrice?: number,
  ): GapProjection {
    const isBull = fvg.type === FvgType.Bullish;
    const baseHeight = fvg.gapSize;
    const ce = fvg.consequentEncroachment;
    const origin = originPrice ?? (isBull ? fvg.gapBottom : fvg.gapTop);

    if (isBull) {
      const measuredTarget = 2.0 * ce - origin;
      return {
        fvgId: fvg.id,
        direction: 'up',
        originPrice: origin,
        baseGapHeight: baseHeight,
        measuredTarget,
        sdTargets: {
          sd1_0: fvg.gapTop + 1.0 * baseHeight,
          sd2_0: fvg.gapTop + 2.0 * baseHeight,
          sd2_5: fvg.gapTop + 2.5 * baseHeight,
          sd4_0: fvg.gapTop + 4.0 * baseHeight,
        },
      };
    } else {
      const measuredTarget = 2.0 * ce - origin;
      return {
        fvgId: fvg.id,
        direction: 'down',
        originPrice: origin,
        baseGapHeight: baseHeight,
        measuredTarget,
        sdTargets: {
          sd1_0: fvg.gapBottom - 1.0 * baseHeight,
          sd2_0: fvg.gapBottom - 2.0 * baseHeight,
          sd2_5: fvg.gapBottom - 2.5 * baseHeight,
          sd4_0: fvg.gapBottom - 4.0 * baseHeight,
        },
      };
    }
  }
}
