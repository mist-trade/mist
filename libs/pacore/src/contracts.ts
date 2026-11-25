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

export enum NecklinePatternType {
  DoubleBottom = 'double_bottom', // 双底 (W底, 看涨反转)
  DoubleTop = 'double_top', // 双顶 (M头, 看跌反转)
  HeadAndShouldersBottom = 'head_and_shoulders_bottom', // 倒头肩 / 头肩底 (看涨反转)
  HeadAndShouldersTop = 'head_and_shoulders_top', // 头肩顶 (看跌反转)
}

export enum NecklineStatus {
  Forming = 'forming', // 构筑中 (摆动极值已成型，未收盘突破)
  Breakout = 'breakout', // 确认突破 (收盘价坚决突破颈线)
  PullbackRetested = 'pullback_retested', // 回抽颈线支阻互换带确认
  TargetReached = 'target_reached', // 达成 1:1 对称目标或 1.618 扩展目标
  Invalidated = 'invalidated', // 跌破极值点或假突破深幅破坏失效
}

/** 局部客观摆动极值点 (Swing Pivot) */
export interface PaPivotPoint {
  readonly index: number;
  readonly time: Date;
  readonly price: number;
  readonly type: 'high' | 'low';
}

/** 颈线突破确立事实 */
export interface NecklineBreakoutInfo {
  readonly breakoutIndex: number;
  readonly breakoutTime: Date;
  readonly breakoutPrice: number;
}

/** 空间投射目标矩阵 (基于形态垂直高差 H) */
export interface NecklineProjectionTargets {
  readonly baseHeight: number; // 垂直高度 H = |necklinePrice - extremumPrice|
  readonly necklinePrice: number; // 颈线突破基准价
  readonly target1_0: number; // 1:1 对称度量目标位 (Measured Move: Neckline ± 1.0 * H)
  readonly target1_618: number; // 1.618 黄金分割扩展位 (Neckline ± 1.618 * H)
  readonly target2_0: number; // 2.0 双倍空间目标位 (Neckline ± 2.0 * H)
}

/** 回抽支阻互换敏感带 (Support/Resistance Flip Zone) */
export interface NecklineRetestZone {
  readonly top: number;
  readonly bottom: number;
  readonly isRetested: boolean;
  readonly retestIndex?: number;
  readonly retestTime?: Date;
  readonly retestExtreme?: number;
}

/** 颈线映射核心领域实体 */
export interface NecklineProjection {
  readonly id: string;
  readonly patternType: NecklinePatternType;
  readonly status: NecklineStatus;
  readonly direction: 'up' | 'down';
  readonly pivots: readonly PaPivotPoint[];
  readonly startTime: Date;
  readonly startIndex: number;
  readonly endTime: Date;
  readonly endIndex: number;
  readonly necklinePrice: number;
  readonly extremumPrice: number;
  readonly targets: NecklineProjectionTargets;
  readonly retestZone: NecklineRetestZone;
  readonly breakout?: NecklineBreakoutInfo;
}

/** 颈线检测门槛配置 */
export interface NecklineOptions {
  readonly swingWindow?: number; // Swing Pivot 局域窗口半径 (默认 2，即 5 棒局域)
  readonly maxTroughDifferenceRatio?: number; // 双底/双顶两端点容差比 (默认 0.05 即 5%)
  readonly minPatternHeightRatio?: number; // 形态最小高度占均价比例 (默认 0.01)
  readonly maxBarSpan?: number; // 形态最大横跨 Bar 数 (默认 120)
  readonly minBarSpan?: number; // 形态最小横跨 Bar 数 (默认 4)
}

export interface PaGeometryResult {
  readonly fvgs: readonly FairValueGap[];
  readonly wickGaps: readonly WickGap[];
  readonly pinBars: readonly PinBar[];
  readonly sweeps: readonly LiquiditySweep[];
  readonly projections: readonly GapProjection[];
  readonly necklines: readonly NecklineProjection[];
}

export interface PaAnalysisOptions {
  readonly minFvgSize?: number;
  readonly minPinWickRatio?: number; // 默认 0.50
  readonly maxPinBodyRatio?: number; // 默认 0.33
  readonly atrThreshold?: number;
  readonly necklineOptions?: NecklineOptions;
}
