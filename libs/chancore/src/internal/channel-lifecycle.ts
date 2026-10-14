/**
 * 缠论走势中枢生命周期状态机引擎（Central Lifecycle State Machine Engine）
 *
 * ======================================================================================
 * 核心架构与职责定位（第一性原理）：
 * ======================================================================================
 * 1. 纯数学核心库契约：无副作用纯状态机，严禁引入任何 I/O、持久化、Redis 或 NestJS 依赖；
 * 2. 状态驱动生命周期：
 *    - 核心构建（Forming）：初始构件趋势交替与几何重叠校验；
 *    - 候选离开登记（Candidate List）：顺势冲破 ZG/ZD 或 GG/DD 时记录完整快照；
 *    - 离开决断与封存（Sealing）：3买/3卖确认、2s/2b 次级别背驰衰竭转折确认、反向打穿进入笔起点、序列末端顺势突破封存；
 *    - 严格重叠门禁（Strict Overlap Guard）：No Overlap, No Entry，脱离区间的走势严禁机械吸纳；
 *    - 断裂脱离收口：无法吸纳且不在中枢内时，在历史最佳离开笔处收口最佳中枢。
 * 3. 级别对齐与架构同构：
 *    - 笔级中枢（Bi Channel）与段级中枢（Duan Channel）：统一同构，均有方向（由进入构件 trend 决定），4 构件核心（1 进入 + 3 内部），5 构件完成封存门槛；
 *    - 构件纯化契约（内部构件纯化 + 进入/离开构件解耦）与生命周期状态机 100% 同构复用。
 * ======================================================================================
 */

import { TrendDirection } from '../contracts';
import { minMaxBy } from './min-max-by';

// ============================================================================
// 一、通用接口与几何辅助函数
// ============================================================================

/**
 * 通用中枢几何构件元素契约（ChanBi 与 ChanDuan 的统一几何接口）
 */
export interface ChannelElement {
  readonly trend: TrendDirection;
  readonly high: number;
  readonly low: number;
  readonly originIds: readonly number[];
}

/**
 * 中枢核心几何参数
 */
export interface ChannelGeometry {
  zg: number;
  zd: number;
  gg: number;
  dd: number;
}

/**
 * 验证序列中各元素的趋势是否严格交替（Up 与 Down 交替）
 */
export function validateTrendAlternating<T extends { trend: TrendDirection }>(
  items: readonly T[],
): boolean {
  for (let i = 0; i < items.length - 1; i++) {
    if (items[i].trend === items[i + 1].trend) {
      return false;
    }
  }
  return true;
}

/**
 * 对称重叠几何参数计算（无方向区域计算）：
 * zg = min(高点), zd = max(低点), gg = max(高点), dd = min(低点)
 */
export function computeSymmetricGeometry<
  T extends { high: number; low: number },
>(items: readonly T[]): ChannelGeometry | null {
  if (items.length < 3) {
    return null;
  }
  const highMinMax = minMaxBy(items, (item) => item.high);
  const lowMinMax = minMaxBy(items, (item) => item.low);
  if (!highMinMax || !lowMinMax) {
    return null;
  }
  const zg = highMinMax.min;
  const zd = lowMinMax.max;
  const gg = highMinMax.max;
  const dd = lowMinMax.min;
  if (zg <= zd) {
    return null;
  }
  return { zg, zd, gg, dd };
}

/**
 * 计算中枢在原始序列中的首尾 ID
 */
export function resolveChannelAnchorIds<
  T extends { originIds: readonly number[] },
>(
  originalElements: readonly T[],
  startIndex: number,
  endIndex: number,
): {
  startId: number;
  endId: number;
} {
  const firstElem = originalElements[startIndex];
  const lastElem = originalElements[endIndex];

  return {
    startId: firstElem.originIds[0],
    endId: lastElem.originIds[lastElem.originIds.length - 1],
  };
}

// ============================================================================
// 二、走势中枢有限状态机（CentralStateMachine）
// ============================================================================

/**
 * 中枢有限状态机状态枚举
 */
export enum CentralLifecycleState {
  /** 初始 4 构件基础核心形成中 (1 进 + 3 内) */
  Forming = 'forming',
  /** 核心确立，内部延伸震荡吸纳中 */
  Oscillating = 'oscillating',
  /** 已出现顺势突破极值构件，处于候选离开监测与确认期 */
  CandidateDeparting = 'candidate_departing',
  /** 已通过 3买/3卖 / 2s/2b / 末端顺势突破确认完满封存 */
  Sealed = 'sealed',
  /** 反向极端打穿进入构件起点，结构崩塌失效作废 */
  Collapsed = 'collapsed',
}

/** 中枢基础核心构件长度：进入构件 e0 + 3 个内部构件 = 4 构件 */
export const CHANNEL_CORE_LENGTH = 4;

/** 中枢确认完满封存最小构件数：进入构件 e0 + 至少 3 个内部构件 + 1 个离开构件 e = 5 构件 */
export const CHANNEL_MIN_SEALED_LENGTH = 5;

/**
 * 判断两个构件元素是否为同一构件（优先基于 originIds，兜底支持时间戳与极值对齐）
 */
export function isSameChannelElement<
  T extends {
    originIds?: readonly number[];
    startTime?: Date;
    endTime?: Date;
    high?: number;
    low?: number;
  },
>(a?: T, b?: T): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (
    a.originIds &&
    b.originIds &&
    a.originIds.length > 0 &&
    b.originIds.length > 0
  ) {
    if (a.originIds[0] === b.originIds[0]) return true;
  }
  if (a.startTime && b.startTime && a.endTime && b.endTime) {
    return (
      a.startTime.getTime() === b.startTime.getTime() &&
      a.endTime.getTime() === b.endTime.getTime() &&
      a.high === b.high &&
      a.low === b.low
    );
  }
  return false;
}

/**
 * 4 构件基础核心几何校验（1 进入构件 + 3 内部构件 = 4 构件）
 *
 * 缠论原典第 17/18 课标准初生中枢几何校验：
 * 1. zg > zd（中枢核心必须存在真实价格重叠区间）；
 * 2. 进入构件外部端点必须在中枢 [ZD, ZG] 之外（即进入构件确实从外部进入中枢）；
 * 3. 内部构件不可反向打穿进入构件起点（上涨不跌破起点、下跌不突破起点导致原趋势反转）。
 */
export function validateStandardCoreGeometry<T extends ChannelElement>(
  fourElements: readonly T[],
): { geometry: ChannelGeometry; isUp: boolean } | null {
  if (fourElements.length < CHANNEL_CORE_LENGTH) {
    return null;
  }

  const firstElem = fourElements[0];
  const isUp = firstElem.trend === TrendDirection.Up;

  let zg: number, zd: number, gg: number, dd: number;
  if (isUp) {
    const frontHigh = minMaxBy(fourElements, (e) => e.high);
    const backLow = minMaxBy(fourElements.slice(1), (e) => e.low);
    if (!frontHigh || !backLow) return null;
    zg = frontHigh.min;
    gg = frontHigh.max;
    zd = backLow.max;
    dd = backLow.min;
  } else {
    const backHigh = minMaxBy(fourElements.slice(1), (e) => e.high);
    const frontLow = minMaxBy(fourElements, (e) => e.low);
    if (!backHigh || !frontLow) return null;
    zg = backHigh.min;
    gg = backHigh.max;
    zd = frontLow.max;
    dd = frontLow.min;
  }

  // 约束1：zg > zd（中枢核心必须存在真实价格重叠区间）
  if (zg <= zd) {
    return null;
  }

  // 约束2：进入构件外部端点必须在中枢 [ZD, ZG] 之外（即进入构件确实从外部进入中枢）
  if (isUp) {
    if (firstElem.low >= zd) {
      return null;
    }
    // 约束3：上涨中枢进入构件起点必须是最低点（内部构件最低不得跌破进入构件起点）
    if (dd < firstElem.low) {
      return null;
    }
  } else {
    if (firstElem.high <= zg) {
      return null;
    }
    // 约束3：下跌中枢进入构件起点必须是最高点（内部构件最高不得突破进入构件起点）
    if (gg > firstElem.high) {
      return null;
    }
  }

  return { geometry: { zg, zd, gg, dd }, isUp };
}

export interface AbsorbResult {
  readonly absorbed: boolean;
  readonly consumedCount: number;
  readonly shouldStop?: boolean;
}

/**
 * 走势中枢全生命周期策略契约（通用核心，笔级与段级各自独立实现）
 */
export interface ChannelLifecyclePolicy<T extends ChannelElement, R> {
  readonly allowUncomplete?: boolean;
  readonly dynamicNarrowing?: boolean;

  validateCore(
    window: readonly T[],
  ): { geometry: ChannelGeometry; isUp: boolean } | null;

  evaluateCandidateDeparture(
    curr: T,
    index: number,
    stateMachine: ChannelStateMachine<T>,
  ): CandidateDeparture<T> | null;

  checkDepartureConfirmation(
    curr: T,
    nextIdx: number,
    pullback: T | null,
    latestCandidate: CandidateDeparture<T> | null,
    data: readonly T[],
    stateMachine: ChannelStateMachine<T>,
  ): boolean;

  handleOppositePiercing(
    pullback: T | null,
    stateMachine: ChannelStateMachine<T>,
  ): boolean;

  checkTailSealing(
    curr: T,
    nextIdx: number,
    stateMachine: ChannelStateMachine<T>,
  ): boolean;

  tryAbsorbExtension(
    curr: T,
    pullback: T | null,
    stateMachine: ChannelStateMachine<T>,
  ): AbsorbResult;

  sealOrCollapseOnBreakdown(stateMachine: ChannelStateMachine<T>): boolean;

  buildPhaseAChannel(
    elements: readonly T[],
    original: readonly T[],
    startIndex: number,
    coreGeometry: ChannelGeometry,
  ): R | null;

  buildSealedChannel(
    elements: readonly T[],
    original: readonly T[],
    startIndex: number,
    geometry: ChannelGeometry,
    expanded: boolean,
    isComplete?: boolean,
  ): R;
}

/**
 * 走势中枢生命周期策略适配器（向后兼容传统简化接口）
 */
export interface ChannelLifecycleStrategy<T extends ChannelElement, R> {
  readonly allowUncomplete?: boolean;
  readonly dynamicNarrowing?: boolean;
  validateCore(
    window: readonly T[],
  ): { geometry: ChannelGeometry; isUp: boolean } | null;
  buildPhaseAChannel(
    elements: readonly T[],
    original: readonly T[],
    startIndex: number,
    coreGeometry: ChannelGeometry,
  ): R | null;
  buildSealedChannel(
    elements: readonly T[],
    original: readonly T[],
    startIndex: number,
    geometry: ChannelGeometry,
    expanded: boolean,
    isComplete?: boolean,
  ): R;
}

/**
 * 候选离开构件快照记录
 */
export interface CandidateDeparture<T> {
  readonly departureIndex: number;
  readonly element: T;
  readonly elementCount: number;
  readonly extremePrice: number;
  readonly geometry: ChannelGeometry;
}

/**
 * 走势中枢有限状态机（Central State Machine）
 *
 * 维护单中枢生长全生命周期（形成、震荡吸纳、候选离开列表记录、真实离开决断、反向破坏回退）：
 * - 核心状态包含：
 *   1. 到当前笔的动态极值与重叠几何参数 [gg, dd, zg, zd]
 *   2. 开始笔在原始序列中的全局下标 startIndex
 *   3. 是否为完整中枢 isComplete 标志
 * - 维护候选离开笔列表 candidateDepartures：每次顺势突破极值均完整记录；
 * - 最终封存决断时，从候选列表中筛选最符合缠论极值定义的真实离开笔（上涨 high===GG，下跌 low===DD）。
 */
export class ChannelStateMachine<T extends ChannelElement> {
  readonly startIndex: number;
  readonly elements: T[];
  readonly firstElem: T;
  readonly isUp: boolean;

  zg: number;
  zd: number;
  gg: number;
  dd: number;

  isComplete = false;
  isExpanded = false;
  hasCollapsed = false;
  state: CentralLifecycleState = CentralLifecycleState.Forming;

  /** 候选离开笔历史快照列表 */
  readonly candidateDepartures: CandidateDeparture<T>[] = [];

  constructor(
    startIndex: number,
    initialCore: readonly T[],
    coreInfo: { geometry: ChannelGeometry; isUp: boolean },
  ) {
    this.startIndex = startIndex;
    this.elements = [...initialCore];
    this.firstElem = initialCore[0];
    this.isUp = coreInfo.isUp;
    this.zg = coreInfo.geometry.zg;
    this.zd = coreInfo.geometry.zd;
    this.gg = coreInfo.geometry.gg;
    this.dd = coreInfo.geometry.dd;
    this.state = CentralLifecycleState.Forming;
  }

  /**
   * 记录候选离开笔快照
   *
   * 契约守卫：
   * 1. 首尾同向公理：只有与进入笔 b0 趋势严格一致的同向笔，才有资格作为潜在离开笔；
   * 2. 只有创出新高（上涨破 GG）或新低（下跌破 DD）时登记快照；
   * 3. 包含该候选笔时，构件总数必定是奇数笔（5, 7, 9...）。
   */
  recordCandidateDeparture(
    curr: T,
    index: number,
    candidateGg: number,
    candidateDd: number,
    allowOpposite = false,
  ): CandidateDeparture<T> | null {
    if (!allowOpposite && curr.trend !== this.firstElem.trend) {
      return null;
    }

    const extremePrice =
      curr.trend === TrendDirection.Up ? curr.high : curr.low;
    const candidate: CandidateDeparture<T> = {
      departureIndex: index,
      element: curr,
      elementCount: this.elements.length + 1,
      extremePrice,
      geometry: {
        zg: this.zg,
        zd: this.zd,
        gg: candidateGg,
        dd: candidateDd,
      },
    };
    this.candidateDepartures.push(candidate);
    return candidate;
  }

  /**
   * 从候选离开列表中决断出最符合缠论定义的历史真实离开笔
   *
   * 缠论离开定义：离开中枢的走势必须是顺势极值突破。
   * - 上涨中枢：选取最高点等于全局 GG 的那一笔（顺势冲至最高极值）；
   * - 下跌中枢：选取最低点等于全局 DD 的那一笔（顺势跌至最低极值）；
   * - 若存在多笔同达极值，取最后一次确认极值者。
   */
  findBestCandidateDeparture(): CandidateDeparture<T> | null {
    if (this.candidateDepartures.length === 0) {
      return null;
    }

    let best = this.candidateDepartures[0];
    for (let i = 1; i < this.candidateDepartures.length; i++) {
      const c = this.candidateDepartures[i];
      if (c.element.trend === this.firstElem.trend) {
        if (
          this.isUp
            ? c.extremePrice >= best.extremePrice
            : c.extremePrice <= best.extremePrice
        ) {
          best = c;
        }
      } else {
        if (
          this.isUp
            ? c.extremePrice <= best.extremePrice
            : c.extremePrice >= best.extremePrice
        ) {
          best = c;
        }
      }
    }
    return best;
  }

  /**
   * 封存于最新的候选离开笔
   */
  sealAtLatestCandidate(): void {
    if (this.candidateDepartures.length === 0) {
      return;
    }
    const latest =
      this.candidateDepartures[this.candidateDepartures.length - 1];
    this.sealAtCandidate(latest);
  }

  /**
   * 封存在指定的候选离开笔处，截断多余元素并同步极值与密封状态
   */
  sealAtCandidate(candidate: CandidateDeparture<T>): void {
    this.elements.splice(candidate.elementCount);
    if (this.elements.length < candidate.elementCount) {
      this.elements.push(candidate.element);
    }
    // 严格维护中枢波动极值纯净性：离开笔属于脱离中枢走势，中枢 [DD, GG] 严格保持为内部震荡构件极值
    const internalElements = this.elements.slice(1, -1);
    if (internalElements.length > 0) {
      this.gg = Math.max(...internalElements.map((e) => e.high));
      this.dd = Math.min(...internalElements.map((e) => e.low));
    }
    this.isComplete = true;
    this.state = CentralLifecycleState.Sealed;
  }

  /**
   * 出现异常或走势反转时，决断候选列表中最佳离开笔；若无候选离开笔则判定中枢崩塌
   */
  sealOrCollapseAtBestCandidate(): boolean {
    const best = this.findBestCandidateDeparture();
    if (best) {
      this.sealAtCandidate(best);
      return true;
    }
    this.collapse();
    return false;
  }

  /**
   * 检验反向回抽笔是否形成第 3 类买卖点（回抽不跌回 ZG / 升回 ZD）
   */
  isThirdBuyOrSellPoint(pullback: T | null): boolean {
    if (!pullback) return false;
    return this.isUp ? pullback.low > this.zg : pullback.high < this.zd;
  }

  /**
   * 检验反向一笔是否物理反转打穿进入笔起点（上涨暴跌打穿 b0.low / 下跌暴涨打穿 b0.high）
   */
  piercesOppositeExtreme(bi: T | null): boolean {
    if (!bi) return false;
    return this.isUp
      ? bi.low < this.firstElem.low
      : bi.high > this.firstElem.high;
  }

  /**
   * 检验是否满足 2s/2b 次级别背驰衰竭转折离开
   *
   * 冲破极值（Up 破 GG / Down 破 DD）后，回抽不破对向沿且紧随的同向反弹/回踩走出次级别不创新高/低转折。
   */
  isSecondClassReversal(
    candidate: CandidateDeparture<T>,
    data: readonly T[],
    currIdx: number,
  ): boolean {
    if (currIdx + 2 >= data.length) return false;

    const pullback = data[currIdx + 1];
    const bounce = data[currIdx + 2];

    const pullbackGuarded = this.isUp
      ? pullback.low >= this.zd
      : pullback.high <= this.zg;
    if (!pullbackGuarded) return false;

    return this.isUp
      ? bounce.high < candidate.element.high
      : bounce.low > candidate.element.low;
  }

  /**
   * 标记中枢结构崩塌失效（Collapsed）
   * 该候选中枢彻底作废，不向外部输出任何伪中枢对象。
   */
  collapse(): void {
    this.hasCollapsed = true;
    this.state = CentralLifecycleState.Collapsed;
  }

  /**
   * 【Strict Overlap Guard 严格重叠门禁】
   *
   * 缠论第一性原理：No Overlap, No Entry。
   * 走势中枢的延伸，由所有围绕该中枢产生波动的走势类型所构成，这些走势类型必须触及中枢区间 [ZD, ZG]。
   * 若走势回拉完全脱离区间，属于离开走势，严禁吸收为内部构件！
   *
   * 校验条件：
   * 1. 价格重叠：curr.high >= zd 且 curr.low <= zg；
   * 2. 若有配对回抽笔 pullback，pullback 同样必须触及中枢区间；
   * 3. 起点极值守卫：内部震荡构件的极值绝对不得打穿进入笔起点（上涨不破 b0.low，下跌不破 b0.high）。
   */
  canAbsorbExtension(curr: T, pullback?: T | null): boolean {
    // 1. curr 必须触及中枢区间 [zd, zg]（产生价格重叠）
    const currTouches = curr.high >= this.zd && curr.low <= this.zg;
    if (!currTouches) {
      return false;
    }

    // 2. 若存在配对的 pullback，pullback 也必须触及中枢区间
    if (pullback) {
      const pbTouches = pullback.high >= this.zd && pullback.low <= this.zg;
      if (!pbTouches) {
        return false;
      }
    }

    // 3. 进入笔起点极值守卫：内部震荡构件绝对不得跌破/升破进入笔起点
    if (this.isUp) {
      if (curr.low < this.firstElem.low) return false;
      if (pullback && pullback.low < this.firstElem.low) return false;
    } else {
      if (curr.high > this.firstElem.high) return false;
      if (pullback && pullback.high > this.firstElem.high) return false;
    }

    return true;
  }

  /**
   * 吸纳延伸构件并动态收敛全量公共重叠区间 [ZD, ZG]
   */
  absorb(curr: T, pullback?: T | null, dynamicNarrowing = true): void {
    if (pullback) {
      this.elements.push(curr, pullback);
      this.gg = Math.max(this.gg, curr.high, pullback.high);
      this.dd = Math.min(this.dd, curr.low, pullback.low);
    } else {
      this.elements.push(curr);
      this.gg = Math.max(this.gg, curr.high);
      this.dd = Math.min(this.dd, curr.low);
    }

    if (dynamicNarrowing) {
      const coreElements = this.elements.slice(1);
      const allHigh = minMaxBy(coreElements, (e) => e.high);
      const allLow = minMaxBy(coreElements, (e) => e.low);
      if (allHigh && allLow && allHigh.min > allLow.max) {
        this.zg = allHigh.min;
        this.zd = allLow.max;
      }
    }

    this.state = CentralLifecycleState.Oscillating;
  }

  get geometry(): ChannelGeometry {
    return { zg: this.zg, zd: this.zd, gg: this.gg, dd: this.dd };
  }
}

// ============================================================================
// 三、笔级中枢生命周期引擎（ChannelLifecycleEngine）
// ============================================================================

function isChannelLifecyclePolicy<T extends ChannelElement, R>(
  strategyOrPolicy:
    | ChannelLifecyclePolicy<T, R>
    | ChannelLifecycleStrategy<T, R>,
): strategyOrPolicy is ChannelLifecyclePolicy<T, R> {
  return (
    'evaluateCandidateDeparture' in strategyOrPolicy &&
    typeof (strategyOrPolicy as ChannelLifecyclePolicy<T, R>)
      .evaluateCandidateDeparture === 'function'
  );
}

function adaptStrategyToPolicy<T extends ChannelElement, R>(
  strategy: ChannelLifecycleStrategy<T, R>,
): ChannelLifecyclePolicy<T, R> {
  return {
    allowUncomplete: strategy.allowUncomplete,
    dynamicNarrowing: strategy.dynamicNarrowing,
    validateCore: (window) => strategy.validateCore(window),
    evaluateCandidateDeparture: (curr, index, stateMachine) => {
      const isTrendAlignedWithEntry =
        curr.trend === stateMachine.firstElem.trend;
      const breaksExtreme = stateMachine.isUp
        ? curr.high > stateMachine.gg
        : curr.low < stateMachine.dd;
      const candidateGg = stateMachine.isUp
        ? Math.max(stateMachine.gg, curr.high)
        : stateMachine.gg;
      const candidateDd = !stateMachine.isUp
        ? Math.min(stateMachine.dd, curr.low)
        : stateMachine.dd;

      if (isTrendAlignedWithEntry && breaksExtreme) {
        return stateMachine.recordCandidateDeparture(
          curr,
          index,
          candidateGg,
          candidateDd,
        );
      }
      return null;
    },
    checkDepartureConfirmation: (
      curr,
      nextIdx,
      pullback,
      latestCandidate,
      data,
      stateMachine,
    ) => {
      const isTrendAlignedWithEntry =
        curr.trend === stateMachine.firstElem.trend;
      const hasBrokenOut = stateMachine.isUp
        ? curr.high > stateMachine.zg
        : curr.low < stateMachine.zd;
      const candidateGg = stateMachine.isUp
        ? Math.max(stateMachine.gg, curr.high)
        : stateMachine.gg;
      const candidateDd = !stateMachine.isUp
        ? Math.min(stateMachine.dd, curr.low)
        : stateMachine.dd;

      if (
        isTrendAlignedWithEntry &&
        hasBrokenOut &&
        pullback &&
        stateMachine.isThirdBuyOrSellPoint(pullback)
      ) {
        if (!latestCandidate) {
          stateMachine.recordCandidateDeparture(
            curr,
            nextIdx,
            candidateGg,
            candidateDd,
          );
        }
        stateMachine.sealAtLatestCandidate();
        return true;
      }

      if (
        latestCandidate &&
        stateMachine.isSecondClassReversal(latestCandidate, data, nextIdx)
      ) {
        stateMachine.sealAtCandidate(latestCandidate);
        return true;
      }

      return false;
    },
    handleOppositePiercing: (pullback, stateMachine) => {
      if (pullback && stateMachine.piercesOppositeExtreme(pullback)) {
        stateMachine.sealOrCollapseAtBestCandidate();
        return true;
      }
      return false;
    },
    checkTailSealing: (curr, nextIdx, stateMachine) => {
      const isTrendAlignedWithEntry =
        curr.trend === stateMachine.firstElem.trend;
      const breaksExtreme = stateMachine.isUp
        ? curr.high > stateMachine.gg
        : curr.low < stateMachine.dd;

      if (isTrendAlignedWithEntry && breaksExtreme) {
        const candidateGg = stateMachine.isUp
          ? Math.max(stateMachine.gg, curr.high)
          : stateMachine.gg;
        const candidateDd = !stateMachine.isUp
          ? Math.min(stateMachine.dd, curr.low)
          : stateMachine.dd;

        stateMachine.recordCandidateDeparture(
          curr,
          nextIdx,
          candidateGg,
          candidateDd,
        );
        stateMachine.sealAtLatestCandidate();
        return true;
      }
      return false;
    },
    tryAbsorbExtension: (curr, pullback, stateMachine) => {
      const shouldNarrow = strategy.dynamicNarrowing ?? true;
      if (stateMachine.canAbsorbExtension(curr, pullback)) {
        if (pullback && stateMachine.canAbsorbExtension(pullback)) {
          stateMachine.absorb(curr, pullback, shouldNarrow);
          return { absorbed: true, consumedCount: 2, shouldStop: false };
        } else {
          stateMachine.absorb(curr, undefined, shouldNarrow);
          return { absorbed: true, consumedCount: 1, shouldStop: true };
        }
      }
      return { absorbed: false, consumedCount: 0 };
    },
    sealOrCollapseOnBreakdown: (stateMachine) => {
      return stateMachine.sealOrCollapseAtBestCandidate();
    },
    buildPhaseAChannel: (...args) => strategy.buildPhaseAChannel(...args),
    buildSealedChannel: (...args) => strategy.buildSealedChannel(...args),
  };
}

/**
 * 通用走势中枢生命周期引擎（ChannelLifecycleEngine）
 *
 * 核心调度职责：
 * 1. 寻找候选核心：顺序滑动寻找符合交替性与初生几何有效性的中枢核心；
 * 2. 调度推进：驱动 CentralStateMachine 结合 Policy 策略进行延伸吸纳、脱离尝试与离开确认；
 * 3. 结果组装：产出 phaseA 与顺序确认的 sequential 中枢序列。
 */
export class ChannelLifecycleEngine {
  static runSequentialLifecycle<T extends ChannelElement, R>(
    data: readonly T[],
    strategyOrPolicy:
      | ChannelLifecyclePolicy<T, R>
      | ChannelLifecycleStrategy<T, R>,
  ): { phaseA: R[]; sequential: R[] } {
    const policy = isChannelLifecyclePolicy(strategyOrPolicy)
      ? strategyOrPolicy
      : adaptStrategyToPolicy(strategyOrPolicy);

    const phaseA: R[] = [];
    const sequential: R[] = [];
    const count = data.length;

    if (count < CHANNEL_CORE_LENGTH) {
      return { phaseA, sequential };
    }

    let cursor = 0;
    while (cursor <= count - CHANNEL_CORE_LENGTH) {
      // 1. 检验趋势交替与初始 4 构件基础核心
      const candidateCore = data.slice(cursor, cursor + CHANNEL_CORE_LENGTH);
      if (!validateTrendAlternating(candidateCore)) {
        cursor++;
        continue;
      }

      const coreInfo = policy.validateCore(candidateCore);
      if (!coreInfo) {
        cursor++;
        continue;
      }

      // 实例化有限状态机
      const stateMachine = new ChannelStateMachine<T>(
        cursor,
        candidateCore,
        coreInfo,
      );
      let nextIdx = cursor + CHANNEL_CORE_LENGTH;

      // 2. 有限状态机顺序推进循环（委托 Policy 执行）
      while (nextIdx < count) {
        const curr = data[nextIdx];
        if (curr.trend === data[nextIdx - 1].trend) {
          break;
        }

        const pullback = nextIdx + 1 < count ? data[nextIdx + 1] : null;

        // 1. 候选离开构件检测（Policy 决策）
        const latestCandidate = policy.evaluateCandidateDeparture(
          curr,
          nextIdx,
          stateMachine,
        );

        // 2. 核心离开确认（3买/3卖、2s/2b 等，Policy 决策）
        if (
          policy.checkDepartureConfirmation(
            curr,
            nextIdx,
            pullback,
            latestCandidate,
            data,
            stateMachine,
          )
        ) {
          break;
        }

        // 3. 极端反转处理（Policy 决策）
        if (policy.handleOppositePiercing(pullback, stateMachine)) {
          break;
        }

        // 4. 序列末端顺势离开笔封存守卫（Policy 决策）
        if (!pullback && policy.checkTailSealing(curr, nextIdx, stateMachine)) {
          break;
        }

        // 5. 内部延伸震荡阶段（Policy 决策）
        const absorbResult = policy.tryAbsorbExtension(
          curr,
          pullback,
          stateMachine,
        );
        if (absorbResult.absorbed) {
          nextIdx += absorbResult.consumedCount;
          if (absorbResult.shouldStop) {
            break;
          }
        } else {
          // 6. 断裂脱离：无法吸纳延伸且不在中枢内，在备选离开笔中收口最佳中枢
          policy.sealOrCollapseOnBreakdown(stateMachine);
          break;
        }
      }

      // 3. 门槛校验与结果记录
      if (stateMachine.hasCollapsed) {
        cursor++;
        continue;
      }

      const allowUncomplete = policy.allowUncomplete ?? true;
      const isAtDataEnd =
        allowUncomplete && (nextIdx >= count || count - nextIdx <= 2);
      const isComplete = stateMachine.isComplete;

      // 未完结中枢若未处在数据末端，说明已属于历史走势中未成型的结构，丢弃不输出
      if (!isComplete && !isAtDataEnd) {
        cursor++;
        continue;
      }

      const minRequiredLength = isComplete
        ? CHANNEL_MIN_SEALED_LENGTH
        : CHANNEL_CORE_LENGTH;

      if (stateMachine.elements.length < minRequiredLength) {
        cursor++;
        continue;
      }

      // Phase A 中枢
      const phaseAChannel = policy.buildPhaseAChannel(
        stateMachine.elements,
        data,
        cursor,
        coreInfo.geometry,
      );
      if (phaseAChannel) {
        phaseA.push(phaseAChannel);
      }

      // Phase B 中枢
      const outputChannel = policy.buildSealedChannel(
        stateMachine.elements,
        data,
        cursor,
        stateMachine.geometry,
        false,
        isComplete,
      );
      sequential.push(outputChannel);

      // 推进游标至离开构件处
      cursor = cursor + stateMachine.elements.length - 1;
    }

    return { phaseA, sequential };
  }
}

// ============================================================================
// 四、向后兼容别名导出（Backward-Compatibility Aliases）
// ============================================================================

export const BiChannelLifecycleEngine = ChannelLifecycleEngine;
export const BiStateMachine = ChannelStateMachine;
export type BiChannelLifecycleStrategy<
  T extends ChannelElement,
  R,
> = ChannelLifecycleStrategy<T, R>;
