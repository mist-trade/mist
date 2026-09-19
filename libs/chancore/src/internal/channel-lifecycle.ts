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
 * 3. 级别对齐：
 *    - 笔级中枢（Bi Channel）：有方向（由进入笔 b0 趋势决定），4 笔核心（1 进入 + 3 构件），5 笔完成封存门槛；
 *    - 段级中枢（Duan Channel）：无方向，3 段对称重叠核心。
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
 * 计算中枢在原始序列中的首尾 ID 与居中展示锚点 ID
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
  displayStartId: number;
  displayEndId: number;
} {
  const firstElem = originalElements[startIndex];
  const firstMidIdx = Math.floor(firstElem.originIds.length / 2);
  const displayStartId = firstElem.originIds[firstMidIdx];

  const lastElem = originalElements[endIndex];
  const lastMidIdx = Math.floor(lastElem.originIds.length / 2);
  const displayEndId = lastElem.originIds[lastMidIdx];

  return {
    startId: firstElem.originIds[0],
    endId: lastElem.originIds[lastElem.originIds.length - 1],
    displayStartId,
    displayEndId,
  };
}

// ============================================================================
// 二、笔级走势中枢有限状态机（CentralStateMachine）
// ============================================================================

/**
 * 中枢有限状态机状态枚举
 */
export enum CentralLifecycleState {
  /** 初始 4 笔基础核心形成中 */
  Forming = 'forming',
  /** 核心确立，内部延伸震荡吸纳中 */
  Oscillating = 'oscillating',
  /** 已出现顺势突破极值笔，处于候选离开监测与确认期 */
  CandidateDeparting = 'candidate_departing',
  /** 已通过 3买/3卖 / 2s/2b / 末端顺势突破确认完满封存 */
  Sealed = 'sealed',
  /** 反向极端打穿进入笔起点，结构崩塌失效作废 */
  Collapsed = 'collapsed',
}

/** 笔中枢基础核心构件长度：进入笔 b0 + 3 笔内部构件 = 4 笔 */
export const BI_CENTRAL_CORE_LENGTH = 4;

/** 笔中枢确认完满封存最小元素数：进入笔 b0 + 3 笔内部构件 + 1 笔离开笔 b = 5 笔 */
export const BI_CENTRAL_MIN_SEALED_LENGTH = 5;

/**
 * 笔级中枢生命周期策略适配器
 */
export interface BiChannelLifecycleStrategy<T extends ChannelElement, R> {
  readonly allowUncomplete?: boolean;
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
 * 候选离开笔快照记录
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
export class CentralStateMachine<T extends ChannelElement> {
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
  ): CandidateDeparture<T> | null {
    if (curr.trend !== this.firstElem.trend) {
      return null;
    }

    const extremePrice = this.isUp ? curr.high : curr.low;
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

    if (this.isUp) {
      let best = this.candidateDepartures[0];
      for (let i = 1; i < this.candidateDepartures.length; i++) {
        const c = this.candidateDepartures[i];
        if (c.extremePrice >= best.extremePrice) {
          best = c;
        }
      }
      return best;
    } else {
      let best = this.candidateDepartures[0];
      for (let i = 1; i < this.candidateDepartures.length; i++) {
        const c = this.candidateDepartures[i];
        if (c.extremePrice <= best.extremePrice) {
          best = c;
        }
      }
      return best;
    }
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
    this.gg = candidate.geometry.gg;
    this.dd = candidate.geometry.dd;
    this.isComplete = true;
    this.state = CentralLifecycleState.Sealed;
    if (this.elements.length >= 9) {
      this.isExpanded = true;
    }
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
  absorb(curr: T, pullback?: T | null): void {
    if (pullback) {
      this.elements.push(curr, pullback);
      this.gg = Math.max(this.gg, curr.high, pullback.high);
      this.dd = Math.min(this.dd, curr.low, pullback.low);
    } else {
      this.elements.push(curr);
      this.gg = Math.max(this.gg, curr.high);
      this.dd = Math.min(this.dd, curr.low);
    }

    const coreElements = this.elements.slice(1);
    const allHigh = minMaxBy(coreElements, (e) => e.high);
    const allLow = minMaxBy(coreElements, (e) => e.low);
    if (allHigh && allLow && allHigh.min > allLow.max) {
      this.zg = allHigh.min;
      this.zd = allLow.max;
    } else {
      this.isExpanded = true;
    }

    if (this.elements.length >= 9) {
      this.isExpanded = true;
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

/**
 * 笔级中枢生命周期引擎（ChannelLifecycleEngine）
 *
 * 核心驱动逻辑：
 * 1. 寻找候选核心：顺序滑动寻找符合交替性与四笔几何有效性的中枢核心；
 * 2. 状态机推进：驱动 CentralStateMachine 进行延伸吸纳、脱离尝试与离开确认；
 * 3. 结果组装：产出 phaseA 与顺序确认的 sequential 中枢序列。
 */
export class ChannelLifecycleEngine {
  static runSequentialLifecycle<T extends ChannelElement, R>(
    data: readonly T[],
    strategy: BiChannelLifecycleStrategy<T, R>,
  ): { phaseA: R[]; sequential: R[] } {
    const phaseA: R[] = [];
    const sequential: R[] = [];
    const count = data.length;

    if (count < BI_CENTRAL_CORE_LENGTH) {
      return { phaseA, sequential };
    }

    let cursor = 0;
    while (cursor <= count - BI_CENTRAL_CORE_LENGTH) {
      // 1. 检验趋势交替与初始 4 笔基础核心构件
      const candidateCore = data.slice(cursor, cursor + BI_CENTRAL_CORE_LENGTH);
      if (!validateTrendAlternating(candidateCore)) {
        cursor++;
        continue;
      }

      const coreInfo = strategy.validateCore(candidateCore);
      if (!coreInfo) {
        cursor++;
        continue;
      }

      // 实例化有限状态机
      const stateMachine = new CentralStateMachine<T>(
        cursor,
        candidateCore,
        coreInfo,
      );
      const firstElem = stateMachine.elements[0];
      let nextIdx = cursor + BI_CENTRAL_CORE_LENGTH;

      // 2. 有限状态机顺序推进循环
      while (nextIdx < count) {
        const curr = data[nextIdx];
        if (curr.trend === data[nextIdx - 1].trend) {
          break;
        }

        const pullback = nextIdx + 1 < count ? data[nextIdx + 1] : null;

        // 【核心公理】：中枢离开笔必须与进入笔首尾同向！
        const isTrendAlignedWithEntry = curr.trend === firstElem.trend;

        // 突破判定与候选离开笔登记（同向冲破 ZG/ZD 或 破 GG/DD）
        const hasBrokenOut = stateMachine.isUp
          ? curr.high > stateMachine.zg
          : curr.low < stateMachine.zd;
        const breaksExtreme = stateMachine.isUp
          ? curr.high > stateMachine.gg
          : curr.low < stateMachine.dd;

        const candidateGg = stateMachine.isUp
          ? Math.max(stateMachine.gg, curr.high)
          : stateMachine.gg;
        const candidateDd = !stateMachine.isUp
          ? Math.min(stateMachine.dd, curr.low)
          : stateMachine.dd;

        // 1. 同向刷新极值，登记入 Candidate List 备选列表
        let latestCandidate: CandidateDeparture<T> | null = null;
        if (isTrendAlignedWithEntry && breaksExtreme) {
          latestCandidate = stateMachine.recordCandidateDeparture(
            curr,
            nextIdx,
            candidateGg,
            candidateDd,
          );
        }

        // 2. 核心离开确认：
        // 形式 A：3买 / 3卖确认（离开笔就是 3 买笔前面的那一笔）
        if (
          isTrendAlignedWithEntry &&
          hasBrokenOut &&
          pullback &&
          stateMachine.isThirdBuyOrSellPoint(pullback)
        ) {
          if (!latestCandidate) {
            latestCandidate = stateMachine.recordCandidateDeparture(
              curr,
              nextIdx,
              candidateGg,
              candidateDd,
            );
          }
          stateMachine.sealAtLatestCandidate();
          break;
        }

        // 形式 B：2s / 2b 次级别背驰衰竭转折确认（冲破极值后走出次高点转折）
        if (
          latestCandidate &&
          stateMachine.isSecondClassReversal(latestCandidate, data, nextIdx)
        ) {
          stateMachine.sealAtCandidate(latestCandidate);
          break;
        }

        // 3. 【极端反转】：反向一笔物理打穿进入笔起点（上涨打穿 b0.low / 下跌打穿 b0.high）
        if (pullback && stateMachine.piercesOppositeExtreme(pullback)) {
          stateMachine.sealOrCollapseAtBestCandidate();
          break;
        }

        // 4. 【序列末端顺势离开笔封存守卫】：
        // 当走势到达序列末尾（!pullback）时：
        // 【离开笔第一公理】：离开笔除非是出现了 3 买/3 卖，否则极值必须突破 GG/DD！
        // 序列末端无 pullback 无法形成 3 买/3 卖，故无论是否为封闭切片，离开终笔必须严格突破全局极值 breaksExtreme。
        const shouldSealAtEnd =
          !pullback && isTrendAlignedWithEntry && breaksExtreme;

        if (shouldSealAtEnd) {
          if (!latestCandidate) {
            latestCandidate = stateMachine.recordCandidateDeparture(
              curr,
              nextIdx,
              candidateGg,
              candidateDd,
            );
          }
          stateMachine.sealAtLatestCandidate();
          break;
        }

        // 5. 【内部延伸震荡阶段】（Strict Overlap Guard 严格重叠门禁）
        if (stateMachine.canAbsorbExtension(curr, pullback)) {
          if (pullback && stateMachine.canAbsorbExtension(pullback)) {
            stateMachine.absorb(curr, pullback);
            nextIdx += 2;
          } else {
            stateMachine.absorb(curr);
            nextIdx++;
            break;
          }
        } else {
          // 6. 【断裂脱离】：无法吸纳延伸且不在中枢内，在备选离开笔中收口最佳中枢
          stateMachine.sealOrCollapseAtBestCandidate();
          break;
        }
      }

      // 3. 门槛校验与结果记录
      if (stateMachine.hasCollapsed) {
        cursor++;
        continue;
      }

      const allowUncomplete = strategy.allowUncomplete ?? true;
      const isAtDataEnd =
        allowUncomplete && (nextIdx >= count || count - nextIdx <= 2);
      const isComplete = stateMachine.isComplete;

      // 未完结中枢若未处在数据末端，说明已属于历史走势中未成型的结构，丢弃不输出
      if (!isComplete && !isAtDataEnd) {
        cursor++;
        continue;
      }

      const minRequiredLength = isComplete
        ? BI_CENTRAL_MIN_SEALED_LENGTH
        : BI_CENTRAL_CORE_LENGTH;

      if (stateMachine.elements.length < minRequiredLength) {
        cursor++;
        continue;
      }

      // Phase A 中枢
      const phaseAChannel = strategy.buildPhaseAChannel(
        stateMachine.elements,
        data,
        cursor,
        coreInfo.geometry,
      );
      if (phaseAChannel) {
        phaseA.push(phaseAChannel);
      }

      // Phase B 中枢
      const outputChannel = strategy.buildSealedChannel(
        stateMachine.elements,
        data,
        cursor,
        stateMachine.geometry,
        stateMachine.isExpanded || stateMachine.elements.length >= 9,
        isComplete,
      );
      sequential.push(outputChannel);

      // 推进游标至离开笔
      cursor = cursor + stateMachine.elements.length - 1;
    }

    return { phaseA, sequential };
  }
}

// ============================================================================
// 四、段级走势中枢生命周期引擎（DuanChannelLifecycleEngine）
// ============================================================================

export enum DepartureCheckResult {
  /** 未满足任何离开条件，继续中枢生命周期 */
  None = 'none',
  /** 顺势直接离开：出 3买/3卖，或破 GG/DD 后走出 2s/2b */
  Direct = 'direct',
  /** 旁枝终结信号：后续反向击穿对侧、段中枢单段反穿、或后续走出独立新核心 */
  BranchReversal = 'branch_reversal',
}

/**
 * 检验顺势突破离开段是否满足规则 1～4 封存条件（双向严格对称）
 */
export function checkDepartureRules<T extends ChannelElement, R>(
  data: readonly T[],
  candidateIdx: number,
  isUp: boolean,
  curZg: number,
  curZd: number,
  curGg: number,
  curDd: number,
  strategy: DuanChannelLifecycleStrategy<T, R>,
): DepartureCheckResult {
  const count = data.length;
  if (
    candidateIdx + 1 >= count ||
    data[candidateIdx + 1].trend === data[candidateIdx].trend
  ) {
    return DepartureCheckResult.Direct;
  }

  const pullback = data[candidateIdx + 1];
  const curr = data[candidateIdx];

  // 条件 1：后续段出现 3 买 / 3 卖（回抽不跌回/升回中枢 [ZD, ZG]）
  const is3rdPoint = isUp ? pullback.low > curZg : pullback.high < curZd;
  if (is3rdPoint) {
    return DepartureCheckResult.Direct;
  }

  // 条件 2：2s / 2b
  const hasBrokenExtreme = isUp ? curr.high > curGg : curr.low < curDd;
  if (hasBrokenExtreme) {
    const has2ndPremise = isUp ? pullback.low >= curZd : pullback.high <= curZg;
    if (has2ndPremise && candidateIdx + 2 < count) {
      const bounce = data[candidateIdx + 2];
      if (bounce.trend === curr.trend) {
        const isSecondClassPoint = isUp
          ? bounce.high < curr.high
          : bounce.low > curr.low;
        if (isSecondClassPoint) {
          return DepartureCheckResult.Direct;
        }
      }
    }
  }

  // 条件 3：反向单段物理反穿中枢对向边界（暴跌穿透 ZD / 暴涨穿透 ZG）
  const piercesOppositeBoundary = isUp
    ? pullback.low < curZd
    : pullback.high > curZg;
  if (piercesOppositeBoundary) {
    return DepartureCheckResult.BranchReversal;
  }

  // 条件 4：后续段直接走出全新合法基础中枢核心
  if (candidateIdx + 1 + strategy.minCoreLength <= count) {
    const nextCoreWindow = data.slice(
      candidateIdx + 1,
      candidateIdx + 1 + strategy.minCoreLength,
    );
    if (validateTrendAlternating(nextCoreWindow)) {
      const nextCore = strategy.validateCore(nextCoreWindow);
      if (nextCore) {
        return DepartureCheckResult.BranchReversal;
      }
    }
  }

  return DepartureCheckResult.None;
}

export interface DuanChannelLifecycleStrategy<T extends ChannelElement, R> {
  readonly minCoreLength: number;
  readonly minSealedLength: number;
  readonly allowUncomplete?: boolean;
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

/** 段中枢状态机专用辅助类 */
class DuanStateMachine<T extends ChannelElement> {
  readonly startIndex: number;
  readonly elements: T[];
  readonly isUp: boolean;

  zg: number;
  zd: number;
  gg: number;
  dd: number;

  isComplete = false;
  isExpanded = false;
  hasCollapsed = false;

  readonly candidateDepartures: CandidateDeparture<T>[] = [];

  constructor(
    startIndex: number,
    initialCore: readonly T[],
    coreInfo: { geometry: ChannelGeometry; isUp: boolean },
  ) {
    this.startIndex = startIndex;
    this.elements = [...initialCore];
    this.isUp = coreInfo.isUp;
    this.zg = coreInfo.geometry.zg;
    this.zd = coreInfo.geometry.zd;
    this.gg = coreInfo.geometry.gg;
    this.dd = coreInfo.geometry.dd;
  }

  recordCandidateDeparture(
    curr: T,
    index: number,
    candidateGg: number,
    candidateDd: number,
  ): void {
    const extremePrice = this.isUp ? curr.high : curr.low;
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
  }

  findBestCandidateDeparture(): CandidateDeparture<T> | null {
    if (this.candidateDepartures.length === 0) return null;
    if (this.isUp) {
      let best = this.candidateDepartures[0];
      for (let i = 1; i < this.candidateDepartures.length; i++) {
        const c = this.candidateDepartures[i];
        if (c.extremePrice >= best.extremePrice) best = c;
      }
      return best;
    } else {
      let best = this.candidateDepartures[0];
      for (let i = 1; i < this.candidateDepartures.length; i++) {
        const c = this.candidateDepartures[i];
        if (c.extremePrice <= best.extremePrice) best = c;
      }
      return best;
    }
  }

  sealAtCandidate(candidate: CandidateDeparture<T>): void {
    this.elements.splice(candidate.elementCount);
    if (this.elements.length < candidate.elementCount) {
      this.elements.push(candidate.element);
    }
    this.gg = candidate.geometry.gg;
    this.dd = candidate.geometry.dd;
    this.isComplete = true;
    if (this.elements.length >= 9) {
      this.isExpanded = true;
    }
  }

  resolveFinalDepartureOnReversal(): boolean {
    const best = this.findBestCandidateDeparture();
    if (best) {
      this.sealAtCandidate(best);
      return true;
    }
    this.collapse();
    return false;
  }

  collapse(): void {
    this.hasCollapsed = true;
  }

  absorb(curr: T, pullback?: T | null): void {
    if (pullback) {
      this.elements.push(curr, pullback);
      this.gg = Math.max(this.gg, curr.high, pullback.high);
      this.dd = Math.min(this.dd, curr.low, pullback.low);
    } else {
      this.elements.push(curr);
      this.gg = Math.max(this.gg, curr.high);
      this.dd = Math.min(this.dd, curr.low);
    }

    const allHigh = minMaxBy(this.elements, (e) => e.high);
    const allLow = minMaxBy(this.elements, (e) => e.low);
    if (allHigh && allLow && allHigh.min > allLow.max) {
      this.zg = allHigh.min;
      this.zd = allLow.max;
    } else {
      this.isExpanded = true;
    }

    if (this.elements.length >= 9) {
      this.isExpanded = true;
    }
  }

  get geometry(): ChannelGeometry {
    return { zg: this.zg, zd: this.zd, gg: this.gg, dd: this.dd };
  }
}

/**
 * 段级走势中枢生命周期引擎
 */
export class DuanChannelLifecycleEngine {
  static runSequentialLifecycle<T extends ChannelElement, R>(
    data: readonly T[],
    strategy: DuanChannelLifecycleStrategy<T, R>,
  ): { phaseA: R[]; sequential: R[] } {
    const phaseA: R[] = [];
    const sequential: R[] = [];
    const count = data.length;

    if (count < strategy.minCoreLength) {
      return { phaseA, sequential };
    }

    let cursor = 0;
    while (cursor <= count - strategy.minCoreLength) {
      const candidateCore = data.slice(cursor, cursor + strategy.minCoreLength);
      if (!validateTrendAlternating(candidateCore)) {
        cursor++;
        continue;
      }

      const coreInfo = strategy.validateCore(candidateCore);
      if (!coreInfo) {
        cursor++;
        continue;
      }

      const stateMachine = new DuanStateMachine<T>(
        cursor,
        candidateCore,
        coreInfo,
      );
      const firstElem = stateMachine.elements[0];
      let nextIdx = cursor + strategy.minCoreLength;

      while (nextIdx < count) {
        const curr = data[nextIdx];
        if (curr.trend === data[nextIdx - 1].trend) {
          break;
        }

        if (nextIdx + 1 < count) {
          const nextElem = data[nextIdx + 1];
          const nextIsTrendDir =
            (stateMachine.isUp && nextElem.trend === TrendDirection.Up) ||
            (!stateMachine.isUp && nextElem.trend === TrendDirection.Down);
          const nextBrokenOut =
            nextIsTrendDir &&
            (stateMachine.isUp
              ? nextElem.high > stateMachine.zg
              : nextElem.low < stateMachine.zd);

          if (nextBrokenOut) {
            const tempZd = Math.max(stateMachine.zd, curr.low);
            const tempZg = Math.min(stateMachine.zg, curr.high);
            let testZg = stateMachine.zg;
            let testZd = stateMachine.zd;
            if (tempZg > tempZd) {
              testZg = tempZg;
              testZd = tempZd;
            }
            const newGg = stateMachine.isUp
              ? Math.max(stateMachine.gg, nextElem.high)
              : stateMachine.gg;
            const newDd = !stateMachine.isUp
              ? Math.min(stateMachine.dd, nextElem.low)
              : stateMachine.dd;

            const decision = checkDepartureRules(
              data,
              nextIdx + 1,
              stateMachine.isUp,
              testZg,
              testZd,
              stateMachine.gg,
              stateMachine.dd,
              strategy,
            );

            if (
              decision === DepartureCheckResult.Direct ||
              decision === DepartureCheckResult.BranchReversal
            ) {
              stateMachine.elements.push(curr, nextElem);
              stateMachine.zg = testZg;
              stateMachine.zd = testZd;
              stateMachine.gg = newGg;
              stateMachine.dd = newDd;
              stateMachine.isComplete = true;
              nextIdx += 2;
              if (stateMachine.elements.length >= 9) {
                stateMachine.isExpanded = true;
              }
              break;
            }
          }
        }

        if (nextIdx + 1 < count) {
          const nextElem = data[nextIdx + 1];
          if (nextElem.trend === curr.trend) {
            break;
          }

          const testWindow = [...stateMachine.elements, curr, nextElem];
          const allHighMinMax = minMaxBy(testWindow, (e) => e.high);
          const allLowMinMax = minMaxBy(testWindow, (e) => e.low);

          if (
            allHighMinMax &&
            allLowMinMax &&
            allHighMinMax.min > allLowMinMax.max
          ) {
            stateMachine.absorb(curr, nextElem);
            nextIdx += 2;
            continue;
          } else {
            break;
          }
        } else {
          if (curr.high >= stateMachine.zd && curr.low <= stateMachine.zg) {
            const newZg = Math.min(stateMachine.zg, curr.high);
            const newZd = Math.max(stateMachine.zd, curr.low);
            if (newZg > newZd) {
              stateMachine.absorb(curr);
              stateMachine.zg = newZg;
              stateMachine.zd = newZd;
              nextIdx++;
            }
          }
          break;
        }
      }

      if (stateMachine.hasCollapsed) {
        cursor++;
        continue;
      }

      const allowUncomplete = strategy.allowUncomplete ?? true;
      const isAtDataEnd =
        allowUncomplete && (nextIdx >= count || count - nextIdx <= 2);
      const isComplete =
        stateMachine.isComplete ||
        (!isAtDataEnd &&
          strategy.minSealedLength <= 3 &&
          stateMachine.elements.length >= 3);

      if (!isComplete && !isAtDataEnd) {
        cursor++;
        continue;
      }

      const minRequiredLength = isComplete
        ? strategy.minSealedLength
        : strategy.minCoreLength;

      if (stateMachine.elements.length < minRequiredLength) {
        cursor++;
        continue;
      }

      if (!isComplete) {
        const lastElem =
          stateMachine.elements[stateMachine.elements.length - 1];
        const hasCollapsedAtEnd = stateMachine.isUp
          ? lastElem.low < firstElem.low
          : lastElem.high > firstElem.high;

        if (hasCollapsedAtEnd) {
          cursor++;
          continue;
        }
      }

      const phaseAChannel = strategy.buildPhaseAChannel(
        stateMachine.elements,
        data,
        cursor,
        coreInfo.geometry,
      );
      if (phaseAChannel) {
        phaseA.push(phaseAChannel);
      }

      const outputChannel = strategy.buildSealedChannel(
        stateMachine.elements,
        data,
        cursor,
        stateMachine.geometry,
        stateMachine.isExpanded || stateMachine.elements.length >= 9,
        isComplete,
      );
      sequential.push(outputChannel);

      cursor = cursor + stateMachine.elements.length - 1;
    }

    return { phaseA, sequential };
  }
}

/** 兼容别名 */
export type ChannelLifecycleStrategy<
  T extends ChannelElement,
  R,
> = DuanChannelLifecycleStrategy<T, R>;
