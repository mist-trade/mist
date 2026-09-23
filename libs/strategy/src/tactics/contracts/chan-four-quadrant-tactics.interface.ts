import type {
  ChanK,
  ChanBi,
  ChanDuan,
  ChanDivergenceZhongshu,
} from '@app/chancore';

/** 战术四象限类型枚举 */
export enum TacticalQuadrant {
  LeftBuy = 'left_buy', // ① 左侧抄底买点（逆势反转/分型+次级别动能上0轴）
  RightBuy = 'right_buy', // ② 右侧顺势买点（顺势确认/二买三买不破位）
  LeftSell = 'left_sell', // ③ 左侧逃顶卖点（冲高滞涨/分型+次级别动能下0轴）
  RightSell = 'right_sell', // ④ 右侧止损卖点（形态破位/二卖三卖主跌）
}

/** 交易操作倾向建议 */
export enum TacticalAction {
  OpenLong = 'open_long', // 开多 / 底仓建仓
  AddLong = 'add_long', // 顺势加仓
  ReduceLong = 'reduce_long', // 冲高减仓 / 锁定利润
  CloseLong = 'close_long', // 清仓止损 / 破位逃命
  None = 'none', // 观望
}

/** 宏观走势背景（顺势/逆势/震荡环境） */
export type MacroTrendDirection = 'UP' | 'DOWN' | 'RANGE';

/** 候选买卖点结构血统详情 */
export interface CandidateBspMetadata {
  readonly type:
    | 'first_buy'
    | 'first_sell'
    | 'second_buy'
    | 'second_sell'
    | 'third_buy'
    | 'third_sell';
  readonly divergenceType?: 'trend' | 'consolidation';
  readonly zhongshuCount: number; // 经历了几个中枢 (1, 2, 3...)
  readonly price: number;
  readonly time: Date;
}

/** 战术求值上下文数据包 */
export interface ChanTacticsContext {
  readonly symbol: string;
  readonly period: string | number; // 当前主交易级别（如 '30m' 或 30）
  readonly subPeriod?: string | number; // 次级别（如 '5m' 或 5）
  readonly parentPeriod?: string | number; // 上一级别（大级别，如 '120m' 或 '1d'）
  readonly klines: readonly ChanK[]; // 本级别 K 线序列
  readonly subKlines?: readonly ChanK[]; // 次级别 K 线序列（用于跨周期穿透）
  readonly parentKlines?: readonly ChanK[]; // 上一级别 K 线序列（用于大级别动能与多空金叉死叉审查）
  readonly bis: readonly ChanBi[]; // 本级别已确立笔序列
  readonly duans?: readonly ChanDuan[]; // 本级别已确立线段序列
  readonly zhongshus: readonly ChanDivergenceZhongshu[]; // 本级别已成形中枢区间序列
  readonly lastPrice?: number; // 最新即时价格
  readonly timestamp: Date; // 当前求值时间戳

  /** 宏观走势背景（由大级别均线或线段级别推导：UP 上升 / DOWN 下跌 / RANGE 震荡） */
  readonly macroTrend?: MacroTrendDirection;

  /** 候选买卖点及其结构血统（方便私有逻辑审查中枢数量与背驰类型） */
  readonly candidateBsp?: CandidateBspMetadata;
}

/** 单象限决策输出详情 */
export interface TacticalQuadrantDecision {
  readonly triggered: boolean; // 是否触发该象限信号
  readonly quadrant: TacticalQuadrant; // 所属象限
  readonly price: number; // 建议成交/标定价格
  readonly time: Date; // 触发时刻
  readonly confidence: number; // 置信度打分 (0 ~ 100)
  readonly action: TacticalAction; // 建议动作
  readonly reason: string; // 触发核心逻辑摘要（用于决策回溯与归因）
  readonly stopLossPrice?: number; // 建议防守止损线
  readonly targetPrice?: number; // 建议目标止盈线
  readonly metadata?: Readonly<Record<string, unknown>>; // 策略自定义附加特征
}

/**
 * 缠论四象限交易战术执行器标准契约
 *
 * 核心架构思想：
 * 1. 买卖不对称：买入与卖出逻辑完全独立编写与求值，杜绝强行对称导致的假信号；
 * 2. 左右侧分立：左侧追求极值赔率，右侧追求破位与反转的确定性胜率；
 * 3. 跨级别穿透：支持同时消费本级别几何形态与次级别动力学指标。
 */
export interface ChanFourQuadrantTactics {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author?: string;

  /**
   * ① 左侧买点 (Left Buy)
   * 典型实现：本级别完成底分型 + 次级别 MACD 黄白线上 0 轴（或趋势背驰离开段极限衰竭）
   */
  evaluateLeftBuy(ctx: ChanTacticsContext): TacticalQuadrantDecision;

  /**
   * ② 右侧买点 (Right Buy)
   * 典型实现：次级别回抽不破前低（严格排除前序 3S 陷阱）或脱离中枢回抽不跌回中枢上轨
   */
  evaluateRightBuy(ctx: ChanTacticsContext): TacticalQuadrantDecision;

  /**
   * ③ 左侧卖点 (Left Sell)
   * 典型实现：本级别完成顶分型 + 次级别 MACD 黄白线下破 0 轴（高位冲高滞涨逃顶）
   */
  evaluateLeftSell(ctx: ChanTacticsContext): TacticalQuadrantDecision;

  /**
   * ④ 右侧卖点 (Right Sell)
   * 典型实现：二卖反弹不过前高、三卖破位中枢下轨加速下杀，坚决止损出局
   */
  evaluateRightSell(ctx: ChanTacticsContext): TacticalQuadrantDecision;
}
