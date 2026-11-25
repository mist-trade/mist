import { FairValueGap, FvgType, GapProjection, PaK } from '../contracts';

export class GapProjectionEngine {
  /**
   * 从原始 K 线序列提取三棒失衡推动段的起点参考价，供缺口投射使用。
   */
  public static resolveImpulseOrigin(
    fvg: FairValueGap,
    klines: readonly PaK[],
  ): number | undefined {
    const startBar = klines[fvg.startIndex];
    const dispBar = klines[fvg.displacementIndex];
    if (!startBar && !dispBar) return undefined;
    if (fvg.type === FvgType.Bullish) {
      return Math.min(
        startBar?.low ?? Number.POSITIVE_INFINITY,
        dispBar?.low ?? Number.POSITIVE_INFINITY,
      );
    }
    return Math.max(
      startBar?.high ?? Number.NEGATIVE_INFINITY,
      dispBar?.high ?? Number.NEGATIVE_INFINITY,
    );
  }

  /**
   * 基于失衡缺口及其 50% CE 轴心，计算 1:1 对称度量投射与标准差扩展目标箱体。
   * 未显式传入 originPrice 时，沿用失衡基准单位向外对称 1:1 展开，避免退化回缺口边沿。
   */
  public static project(
    fvg: FairValueGap,
    originPrice?: number,
  ): GapProjection {
    const isBull = fvg.type === FvgType.Bullish;
    const baseHeight = fvg.gapSize;
    const ce = fvg.consequentEncroachment;
    const origin =
      originPrice ??
      (isBull ? fvg.gapBottom - baseHeight : fvg.gapTop + baseHeight);

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
