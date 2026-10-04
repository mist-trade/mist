export enum TrendDirection {
  Up = 'up',
  Down = 'down',
  None = 'none',
}

export enum FenxingType {
  Top = 'top',
  Bottom = 'bottom',
  None = 'none',
}

export enum BiType {
  UnComplete = 'uncomplete',
  Complete = 'complete',
}

export enum BiStatus {
  Unknown = 0,
  Valid = 1,
  Invalid = 2,
}

export enum ChannelLevel {
  Bi = 'bi',
  Duan = 'duan',
  Macro = 'macro',
}

export enum ChannelType {
  UnComplete = 'uncomplete',
  Complete = 'complete',
}

export enum ChannelStatus {
  Unknown = 0,
  Valid = 1,
  Invalid = 2,
}

export enum DuanType {
  UnComplete = 'uncomplete',
  Complete = 'complete',
}

export enum DuanStatus {
  Unknown = 0,
  Valid = 1,
  Invalid = 2,
}

export interface ChanK {
  readonly id: number;
  readonly symbol: string;
  readonly time: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: string | null;
  readonly amount: string | null;
}

export interface ChanMergedK {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly high: number;
  readonly low: number;
  readonly trend: TrendDirection;
  readonly mergedCount: number;
  readonly mergedIds: readonly number[];
  readonly mergedData: readonly ChanK[];
}

export interface ChanFenxing {
  readonly leftIds: readonly number[];
  readonly middleIds: readonly number[];
  readonly rightIds: readonly number[];
  readonly middleIndex: number;
  readonly middleOriginId: number;
  readonly type: FenxingType;
  readonly high: number;
  readonly low: number;
}

export interface ChanBi {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly high: number;
  readonly low: number;
  readonly trend: TrendDirection;
  readonly type: BiType;
  readonly status: BiStatus;
  readonly independentCount: number;
  readonly originIds: readonly number[];
  readonly originData: readonly ChanK[];
  readonly startFenxing: ChanFenxing | null;
  readonly endFenxing: ChanFenxing | null;
}

export interface ChanBiOptions {
  /**
   * 是否过滤顶底分型区间包含（工程防噪补丁）。
   * - false（默认，符合缠论原典）：不进行顶底分型区间包含过滤，严格遵循原典第 81 课条件；
   * - true：启用分型区间包含过滤，若候选笔两端分型区间相互包含则判为 Invalid。
   */
  readonly filterFenxingContainment?: boolean;
}

export interface ChanBiTwoPhaseResult {
  readonly phaseA: readonly ChanBi[];
  readonly phaseB: readonly ChanBi[];
}

/**
 * 缠论中枢公共抽象几何基底（消灭冗余，彻底删除 displayStartId/displayEndId）
 */
export interface BaseChanChannel {
  readonly zg: number; // 中枢上沿
  readonly zd: number; // 中枢下沿
  readonly gg: number; // 纯内部振荡极值高点
  readonly dd: number; // 纯内部振荡极值低点
  readonly level: ChannelLevel; // 物理构造型级别（血统永不变异）：Bi | Duan
  readonly type: ChannelType; // Complete | UnComplete
  readonly status: ChannelStatus; // Valid
  readonly expanded: boolean; // 中枢扩展标志（内部构件 >= 9 或 Phase B 扩展）
  readonly upgradedLevel?: ChannelLevel; // 升级目标级别（未升级为 undefined，升级后为 ChannelLevel.Macro 高一级中枢）
  readonly extended?: boolean; // Phase B 延伸融合产物标志
  readonly startId: number; // 真实物理起始 K 线 ID
  readonly endId: number; // 真实物理终止 K 线 ID
}

/**
 * 笔级中枢（Bi-level Channel）
 */
export interface ChanBiChannel extends BaseChanChannel {
  /** 纯中间内部振荡笔序列（基础 3 笔，延伸为 5, 7, 9... 笔） */
  readonly bis: readonly ChanBi[];
  /** 1 笔进入（独立解耦） */
  readonly entryBi: ChanBi;
  /** 1 笔离开（封存确立离开时为离开笔） */
  readonly leaveBi?: ChanBi;
  /** 中枢方向（由进入笔确立） */
  readonly trend: TrendDirection;
}

export interface ChanBiChannelTwoPhaseResult {
  readonly phaseA: readonly ChanBiChannel[];
  readonly phaseB: readonly ChanBiChannel[];
}

/**
 * 段（Duan / 线段）—— 笔的上一层，与 ChanBi 同构。
 * 端点从分型（Fenxing）升为笔（Bi），构成单元从原始 K 升为笔。
 */
export interface ChanDuan {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly high: number;
  readonly low: number;
  readonly trend: TrendDirection;
  readonly type: DuanType;
  readonly status: DuanStatus;
  readonly independentCount: number;
  readonly originIds: readonly number[];
  readonly originBis: readonly ChanBi[];
  readonly startBi: ChanBi | null;
  readonly endBi: ChanBi | null;
}

/**
 * 段级中枢（Duan-level Channel）—— 以段为构成单元的中枢，继承 BaseChanChannel。
 * 遵循原典第 17、18、20 课公理与 a + 3 + b 架构同构：
 * 1. entryDuan: 1 段进入（独立解耦挂载）；
 * 2. duans: 纯内部振荡段序列（基础至少 3 段，延伸为 4, 5, 6... 段）；
 * 3. leaveDuan: 1 段离开（确认离开封存时挂载，未完结为 undefined）；
 * 4. trend: 中枢形成方向（回升形成 Up 或 回调形成 Down，遵循第 20 课 Z 走势段逻辑）。
 */
export interface ChanDuanChannel extends BaseChanChannel {
  /** 纯内部振荡段序列（基础至少 3 段，延伸为 4, 5, 6... 段） */
  readonly duans: readonly ChanDuan[];
  /** 1 段进入（独立解耦） */
  readonly entryDuan: ChanDuan;
  /** 1 段离开（封存确立离开时为真正离开段） */
  readonly leaveDuan?: ChanDuan;
  /** 中枢形成方向（由进入段或首根内部段确立） */
  readonly trend: TrendDirection;
}

export interface ChanDuanChannelTwoPhaseResult {
  readonly phaseA: readonly ChanDuanChannel[];
  readonly phaseB: readonly ChanDuanChannel[];
}

// ---------------------------------------------------------------------------
// 背驰（Divergence，缠论24/25课）— 共享纯函数，笔级/段级复用。
// 力度（forces）由调用方经 @app/indicators 计算传入；chancore 不计算指标。
// ---------------------------------------------------------------------------

export enum ChanDivergenceType {
  Trend = 'trend', // 趋势背驰（24课标准背驰）
  Consolidation = 'consolidation', // 盘整背驰
}

/** 背驰单元（笔或段皆可，最小结构接口）。 */
export interface ChanDivergenceUnit {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly trend: TrendDirection;
  readonly high?: number;
  readonly low?: number;
}

/**
 * 背驰中枢（笔级 ChanChannel 或段级 ChanDuanChannel 皆可）——最小结构接口。
 * 中枢扩张已由 chan-central-extension（Phase C）解决：phaseB 相邻中枢波动区间严格不重叠；
 * 扩张合并产物（expanded=true）为同级别中枢，背驰不读 expanded、当普通中枢看待。
 */
export interface ChanDivergenceZhongshu {
  readonly firstUnitTime: Date; // 中枢首单元起点（≡ units[0].startTime）
  readonly lastUnitTime: Date; // 中枢末单元终点（≡ units.at(-1).endTime）
  readonly zg: number; // 中枢上沿
  readonly zd: number; // 中枢下沿
  readonly gg: number; // 中枢最高（位置递进用）
  readonly dd: number; // 中枢最低
  readonly level?: ChannelLevel;
}

/** 每单元力度（双分量，均为"越大越强"正向标量）：area=方向柱面积、peak=黄白线(DIF)极值绝对值。 */
export interface ChanUnitForce {
  readonly area: number;
  readonly peak: number;
}

/** 背驰判定入参：units 与 forces 按索引一一对齐。 */
export interface ChanDivergenceInput {
  readonly units: readonly ChanDivergenceUnit[];
  readonly zhongshus: readonly ChanDivergenceZhongshu[];
  readonly forces: readonly ChanUnitForce[];
  readonly level?: ChannelLevel;
}

export interface ChanDivergence {
  readonly type: ChanDivergenceType;
  readonly level: ChannelLevel;
  readonly zhongshuIndex: number; // 相关中枢在 zhongshus 中的位置
  readonly enterIndex: number; // 进入段在 units 中的位置
  readonly leaveIndex: number; // 离开段在 units 中的位置
  readonly enterForce: ChanUnitForce;
  readonly leaveForce: ChanUnitForce;
}

// ---------------------------------------------------------------------------
// 买卖点（Buy/Sell Point，缠论第20/21课）— 共享纯函数，笔级/段级复用。
// 一类=趋势背驰点（消费 Trend 背驰）、二类=一买/一卖后回抽确认（结构，不查背驰）、
// 三类=离开中枢后回抽不回中枢区间（几何）。力度（forces）由调用方经 @app/indicators
// 计算传入；chancore 不计算指标。
// ---------------------------------------------------------------------------

export enum ChanBspType {
  FirstBuy = 'first_buy', // 第一类买点（一买）
  FirstSell = 'first_sell', // 第一类卖点（一卖）
  SecondBuy = 'second_buy', // 第二类买点（二买）
  SecondSell = 'second_sell', // 第二类卖点（二卖）
  ThirdBuy = 'third_buy', // 第三类买点（三买）
  ThirdSell = 'third_sell', // 第三类卖点（三卖）
}

/** 买卖点单元（笔或段皆可，最小结构接口）——背驰 unit 超集：价格比较需要 high/low。 */
export interface ChanBspUnit {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly high: number; // 段内最高价
  readonly low: number; // 段内最低价
  readonly trend: TrendDirection;
}

/** 买卖点判定入参：units 与 forces 按索引一一对齐；zhongshus 复用背驰最小接口。 */
export interface ChanBspInput {
  readonly units: readonly ChanBspUnit[];
  readonly zhongshus: readonly ChanDivergenceZhongshu[];
  readonly forces: readonly ChanUnitForce[]; // 空数组 → 一类不输出；二三类照常
  readonly level?: ChannelLevel;
}

/**
 * 买卖点输出。
 * - zhongshuIndex：一类/三类 = 相关中枢在 zhongshus 中的下标；二类恒 null（结构性判定不绑定中枢）。
 * - unitIndex：确认段下标（一类=离开段 leaveIndex；二三类=回抽段），点位于该段末端。
 * - price：点价格（买=确认段 low、卖=确认段 high）。
 * - firstTypeIndex：同向最近前置一类点在结果数组中的下标；无 → null。
 */
export interface ChanBuySellPoint {
  readonly type: ChanBspType;
  readonly level: ChannelLevel;
  readonly zhongshuIndex: number | null;
  readonly unitIndex: number;
  readonly price: number;
  readonly firstTypeIndex: number | null;
}
