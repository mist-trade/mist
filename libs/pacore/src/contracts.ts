export enum PaTrendDirection {
  Up = 'up',
  Down = 'down',
  None = 'none',
}

export enum FvgType {
  Bullish = 'bullish',
  Bearish = 'bearish',
}

export enum FvgMitigationStatus {
  Unmitigated = 'unmitigated', // 未触及
  Tested = 'tested', // 刺入但未破 CE (50%)
  CeFilled = 'ce_filled', // 深度回抽击破 CE (50%)
  Invalidated = 'invalidated', // 彻底收盘贯穿对侧边界失效
}

export enum SweepType {
  BullishSweep = 'bullish_sweep', // 向下刺破支撑后收回
  BearishSweep = 'bearish_sweep', // 向上刺破阻力后收回
}

export enum PinBarDirection {
  Bullish = 'bullish',
  Bearish = 'bearish',
}

export interface PaK {
  readonly id: number;
  readonly time: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number;
  readonly amount?: number;
}

export interface FairValueGap {
  readonly id: string;
  readonly type: FvgType;
  readonly startIndex: number; // 第 1 根 Bar 下标
  readonly displacementIndex: number; // 第 2 根失衡 Bar 下标
  readonly endIndex: number; // 第 3 根确认 Bar 下标
  readonly startTime: Date;
  readonly endTime: Date;
  readonly gapTop: number; // 上沿价格 (Bullish: K[i].low; Bearish: K[i-2].low)
  readonly gapBottom: number; // 下沿价格 (Bullish: K[i-2].high; Bearish: K[i].high)
  readonly gapSize: number; // gapTop - gapBottom
  readonly consequentEncroachment: number; // 50% CE = (gapTop + gapBottom) / 2
  readonly status: FvgMitigationStatus;
  readonly firstMitigatedTime?: Date;
  readonly firstMitigatedIndex?: number;
}

export interface WickGap {
  readonly id: string;
  readonly barIndex: number;
  readonly time: Date;
  readonly direction: PinBarDirection;
  readonly top: number;
  readonly bottom: number;
  readonly size: number;
  readonly consequentEncroachment: number; // 50% CE
}

export interface PinBar {
  readonly index: number;
  readonly time: Date;
  readonly direction: PinBarDirection;
  readonly totalRange: number;
  readonly wickRatio: number; // 影线 / 总振幅 (>= 0.50)
  readonly bodyRatio: number; // 实体 / 总振幅 (<= 0.33)
  readonly extremePrice: number; // 针尖极值价格 (Low 或 High)
  readonly normalizedAtrRange?: number;
}

export interface LiquiditySweep {
  readonly id: string;
  readonly type: SweepType;
  readonly sweepIndex: number;
  readonly sweepTime: Date;
  readonly levelPrice: number; // 被刺破的关键参考位
  readonly extremePrice: number; // 刺破极值
  readonly sweepDepth: number; // 刺破深度
  readonly rejectionWickRatio: number; // 影线拒斥收回比例
}

export interface GapProjection {
  readonly fvgId: string;
  readonly direction: 'up' | 'down';
  readonly originPrice: number;
  readonly baseGapHeight: number;
  readonly measuredTarget: number; // 1:1 对称投射
  readonly sdTargets: {
    readonly sd1_0: number;
    readonly sd2_0: number;
    readonly sd2_5: number;
    readonly sd4_0: number;
  };
}

export interface PaGeometryResult {
  readonly fvgs: readonly FairValueGap[];
  readonly wickGaps: readonly WickGap[];
  readonly pinBars: readonly PinBar[];
  readonly sweeps: readonly LiquiditySweep[];
  readonly projections: readonly GapProjection[];
}

export interface PaAnalysisOptions {
  readonly minFvgSize?: number;
  readonly minPinWickRatio?: number; // 默认 0.50
  readonly maxPinBodyRatio?: number; // 默认 0.33
  readonly atrThreshold?: number;
}
