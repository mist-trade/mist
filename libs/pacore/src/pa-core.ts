import {
  FairValueGap,
  GapProjection,
  LiquiditySweep,
  NecklineOptions,
  NecklineProjection,
  PaAnalysisOptions,
  PaGeometryResult,
  PaK,
  PinBar,
  SweepType,
  WickGap,
} from './contracts';
import { assertPaKSeries } from './internal/assert-pa-k-series';
import { FairValueGapDetector } from './internal/fair-value-gap';
import { GapProjectionEngine } from './internal/gap-projections';
import { LiquiditySweepDetector } from './internal/liquidity-sweep';
import { NecklineProjectionEngine } from './internal/neckline-projections';
import { PinBarDetector } from './internal/pin-bar';
import { WickGapDetector } from './internal/wick-gap';

/**
 * PaCore - 西方微观价格行为 (Price Action) 纯数学/纯几何统一门面
 *
 * 继承 Chancore 纯边界原则：零 I/O、无环境依赖、无任何买卖撮合或交易状态机。
 */
export class PaCore {
  /**
   * 校验输入 K 线序列完整性与单调性
   */
  public static assertSeries(klines: readonly PaK[]): void {
    assertPaKSeries(klines);
  }

  /**
   * 检测三棒价格失衡缺口 (Fair Value Gap)
   */
  public static findFairValueGaps(
    klines: readonly PaK[],
    options?: { readonly minFvgSize?: number },
  ): FairValueGap[] {
    assertPaKSeries(klines);
    return FairValueGapDetector.detect(klines, options);
  }

  /**
   * 检测单根 K 线的影线流动性真空区 (Wick-as-Gap)
   */
  public static findWickGaps(
    klines: readonly PaK[],
    options?: {
      readonly minWickSize?: number;
      readonly wickToBodyMultiple?: number;
    },
  ): WickGap[] {
    assertPaKSeries(klines);
    return WickGapDetector.detect(klines, options);
  }

  /**
   * 检测 Pin Bar (长影针)
   */
  public static findPinBars(
    klines: readonly PaK[],
    options?: {
      readonly minWickRatio?: number;
      readonly maxBodyRatio?: number;
      readonly minRange?: number;
    },
  ): PinBar[] {
    assertPaKSeries(klines);
    return PinBarDetector.detect(klines, options);
  }

  /**
   * 检测当期 Bar 是否对参考关键位形成扫损收回 (Sweep & Reclaim)
   */
  public static checkLiquiditySweep(
    bar: PaK,
    barIndex: number,
    levelPrice: number,
    type: SweepType,
  ): LiquiditySweep | null {
    return LiquiditySweepDetector.detectSweep(bar, barIndex, levelPrice, type);
  }

  /**
   * 从 K 线序列解析 FVG 推动段起源极值价，供外部投射调用
   */
  public static resolveFvgOrigin(
    fvg: FairValueGap,
    klines: readonly PaK[],
  ): number | undefined {
    return GapProjectionEngine.resolveImpulseOrigin(fvg, klines);
  }

  /**
   * 计算失衡缺口的空间对称度量与标准差扩展投射
   */
  public static calculateProjection(
    fvg: FairValueGap,
    originPrice?: number,
  ): GapProjection {
    return GapProjectionEngine.project(fvg, originPrice);
  }

  /**
   * 检测形态颈线映射与空间度量投射 (Neckline Projections)
   */
  public static findNecklines(
    klines: readonly PaK[],
    options?: NecklineOptions,
  ): readonly NecklineProjection[] {
    assertPaKSeries(klines);
    return NecklineProjectionEngine.findProjections(klines, options);
  }

  /**
   * 执行全量微观价格行为纯几何特征提取
   */
  public static executeFullAnalysis(
    klines: readonly PaK[],
    options?: PaAnalysisOptions,
  ): PaGeometryResult {
    assertPaKSeries(klines);

    const fvgs = FairValueGapDetector.detect(klines, {
      minFvgSize: options?.minFvgSize,
    });
    const wickGaps = WickGapDetector.detect(klines);
    const pinBars = PinBarDetector.detect(klines, {
      minWickRatio: options?.minPinWickRatio,
      maxBodyRatio: options?.maxPinBodyRatio,
    });

    const projections: GapProjection[] = fvgs.map((fvg) =>
      GapProjectionEngine.project(
        fvg,
        GapProjectionEngine.resolveImpulseOrigin(fvg, klines),
      ),
    );

    const necklines = NecklineProjectionEngine.findProjections(
      klines,
      options?.necklineOptions,
    );

    return {
      fvgs,
      wickGaps,
      pinBars,
      sweeps: [],
      projections,
      necklines,
    };
  }

  /**
   * 语义别名支持: analyze
   */
  public static analyze(
    klines: readonly PaK[],
    options?: PaAnalysisOptions,
  ): PaGeometryResult {
    return this.executeFullAnalysis(klines, options);
  }
}
