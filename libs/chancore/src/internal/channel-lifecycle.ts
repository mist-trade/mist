import { TrendDirection } from '../contracts';
import { minMaxBy } from './min-max-by';

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

/**
 * 中枢生命周期策略适配器：注入笔级与段级的特化核心识别与中枢组装
 */
export interface ChannelLifecycleStrategy<T extends ChannelElement, R> {
  /** 初始核心构件所需最小元素数（笔中枢为 4 笔：1进入+3构件；段中枢为 3 段：3构件） */
  readonly minCoreLength: number;
  /** 确认完成中枢的最小元素数门槛（笔中枢 >= 5；段中枢 >= 3） */
  readonly minSealedLength: number;
  /** 是否允许末端未完成中枢（若为 false，则为历史走势切片，绝不产生 UnComplete 中枢） */
  readonly allowUncomplete?: boolean;
  /** 验证初始核心的几何与进入约束，返回核心几何参数与基准趋势方向 */
  validateCore(
    window: readonly T[],
  ): { geometry: ChannelGeometry; isUp: boolean } | null;
  /** 构建 Phase A 基础中枢 */
  buildPhaseAChannel(
    elements: readonly T[],
    original: readonly T[],
    startIndex: number,
    coreGeometry: ChannelGeometry,
  ): R | null;
  /** 构建 Phase B 密封完成中枢或未完成中枢 */
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
 * 候选离开笔/段快照记录
 */
export interface CandidateDeparture<T> {
  /** 候选离开构件在全局数据序列中的绝对下标 */
  readonly departureIndex: number;
  /** 候选离开构件对象 */
  readonly element: T;
  /** 包含该候选离开构件时的中枢构件总数 */
  readonly elementCount: number;
  /** 突破时的极值价格（上涨为 high，下跌为 low） */
  readonly extremePrice: number;
  /** 此时的几何快照（包含当时的 [zg, zd, gg, dd]） */
  readonly geometry: ChannelGeometry;
}

/**
 * 显式走势中枢状态机（Central State Machine）
 *
 * 维护中枢生长全生命周期（形成、震荡吸纳、候选离开列表记录、真实离开决断、反向破坏回退）：
 * - 核心状态包含：
 *   1. 到当前笔的动态极值与重叠几何参数 [gg, dd, zg, zd]
 *   2. 开始笔在原始序列中的全局下标 startIndex
 *   3. 是否为完整中枢 isComplete 标志
 * - 维护候选离开笔列表 candidateDepartures：每次顺势突破极值均完整记录；
 * - 最终封存决断时，从候选列表中筛选最符合缠论极值定义的真实离开笔（上涨 high===GG，下跌 low===DD），
 *   严禁离开笔最低点/最高点与 DD/GG 发生脱节。
 */
export class CentralStateMachine<T extends ChannelElement> {
  readonly startIndex: number;
  isComplete = false;
  zg: number;
  zd: number;
  gg: number;
  dd: number;
  readonly elements: T[];
  readonly isUp: boolean;
  isExpanded = false;
  hasCollapsed = false;

  /** 候选离开笔历史列表 */
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

  /**
   * 记录候选离开笔进入历史候选列表
   */
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

  /**
   * 从候选离开列表中决断出最符合缠论定义的真实离开笔：
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
   * 直接在当前离开笔封存中枢
   */
  sealAtCurrent(curr: T, finalGg: number, finalDd: number): void {
    this.elements.push(curr);
    this.gg = finalGg;
    this.dd = finalDd;
    this.isComplete = true;
    if (this.elements.length >= 9) {
      this.isExpanded = true;
    }
  }

  /**
   * 回退并封存在指定的真实离开笔处
   */
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

  /**
   * 当走势发生反向破坏、反向 3买/3卖、或形成新核心时，决断真实的离开笔并闭合封存：
   * - 若存在候选离开笔列表，回退并封存于最符合极值定义的真实离开笔；
   * - 若从未走出过顺势极值突破（候选列表为空），判定中枢结构崩塌（collapse）。
   */
  resolveFinalDepartureOnReversal(): boolean {
    const bestCandidate = this.findBestCandidateDeparture();
    if (bestCandidate) {
      this.sealAtCandidate(bestCandidate);
      return true;
    }
    this.collapse();
    return false;
  }

  /**
   * 检验顺势突破候选离开笔是否满足规则 1～4 封存条件（基于自身状态求值）
   */
  checkDepartureRules(
    data: readonly T[],
    candidateIdx: number,
    strategy: ChannelLifecycleStrategy<T, unknown>,
  ): DepartureCheckResult {
    return checkDepartureRules(
      data,
      candidateIdx,
      this.isUp,
      this.zg,
      this.zd,
      this.gg,
      this.dd,
      strategy,
    );
  }

  /**
   * 标记中枢结构崩塌失效
   */
  collapse(): void {
    this.hasCollapsed = true;
  }

  /**
   * 吸纳走势构件并动态更新全量公共交集（方式 A）与极值
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

  /**
   * 提取当前中枢几何快照
   */
  get geometry(): ChannelGeometry {
    return { zg: this.zg, zd: this.zd, gg: this.gg, dd: this.dd };
  }
}

export enum DepartureCheckResult {
  /** 未满足任何离开条件，继续中枢生命周期 */
  None = 'none',
  /** 顺势直接离开：出 3买/3卖，或破 GG/DD 后走出 2s/2b */
  Direct = 'direct',
  /** 旁枝终结信号：后续反向击穿对侧、段中枢单段反穿、或后续走出独立新核心 */
  BranchReversal = 'branch_reversal',
}

/**
 * 检验顺势突破离开笔/段是否满足规则 1～4 封存条件（双向严格对称）
 */
function checkDepartureRules<T extends ChannelElement, R>(
  data: readonly T[],
  candidateIdx: number,
  isUp: boolean,
  curZg: number,
  curZd: number,
  curGg: number,
  curDd: number,
  strategy: ChannelLifecycleStrategy<T, R>,
): DepartureCheckResult {
  const count = data.length;
  // 若已至序列末尾，或下一笔未保持趋势交替，直接封存
  if (
    candidateIdx + 1 >= count ||
    data[candidateIdx + 1].trend === data[candidateIdx].trend
  ) {
    return DepartureCheckResult.Direct;
  }

  const pullback = data[candidateIdx + 1];
  const curr = data[candidateIdx];

  // -------------------------------------------------------------------------
  // 正规离开条件（Direct Departure）：
  // -------------------------------------------------------------------------
  // 条件 1：后续笔出现 3 买 / 3 卖（回抽不跌回/升回中枢 [ZD, ZG]）：
  const is3rdPoint = isUp ? pullback.low > curZg : pullback.high < curZd;
  if (is3rdPoint) {
    return DepartureCheckResult.Direct;
  }

  // 条件 2：后续笔没有出现 3买/3卖，但是出现了满足 3买/3卖 前提的 2s/2b
  // 用户铁律 1：即使是 5 笔基础中枢，如果在没有出现 3b/3s 的情况下，离开笔的最大值必须高于 GG（下跌低于 DD）
  // 用户铁律 2：2s/2b 出现的前提是不能跌破对侧中枢边界（向上中枢回踩不能破 ZD，向下中枢反弹不能破 ZG）；
  //            若反向一笔跌破 ZD（或未打穿 DD），属于中枢内部震荡，严禁机械当成 2s 提前关门！
  const hasBrokenExtreme = isUp ? curr.high > curGg : curr.low < curDd;
  if (hasBrokenExtreme) {
    // 检查 2s/2b 前提：
    const has2ndPremise = isUp ? pullback.low >= curZd : pullback.high <= curZg;
    if (has2ndPremise && candidateIdx + 2 < count) {
      const bounce = data[candidateIdx + 2];
      if (bounce.trend === curr.trend) {
        const isSecondClassPoint = isUp
          ? bounce.high < curr.high
          : bounce.low > curr.low;
        if (isSecondClassPoint) {
          // 确认 2s/2b 已经转折成型（后续已转向，或已到达数据末端）
          if (
            candidateIdx + 3 >= count ||
            data[candidateIdx + 3].trend !== bounce.trend
          ) {
            return DepartureCheckResult.Direct;
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 旁枝终结判定（Branch Reversal / External Termination）：
  // 注意：旁枝判定只表明走势发生外部破坏或新中枢独立，中枢必须终结；
  // 但决不能把当前候选笔盲目扣为离开笔，而必须回到 candidateDepartures 列表中
  // 确认真正的极值离开笔并重新计算；若候选列表为空，则中枢崩塌失效。
  // -------------------------------------------------------------------------
  // 规则 2：反向一笔物理反转打穿对侧极值（暴跌打穿 DD / 暴涨打穿 GG）：
  const piercesOppositeExtreme = isUp
    ? pullback.low < curDd
    : pullback.high > curGg;
  if (piercesOppositeExtreme) {
    return DepartureCheckResult.BranchReversal;
  }

  // 规则 3（仅限 Duan 级别段中枢）：无 3买/3卖，离开后反向单段直接打穿中枢对向沿 (ZD/ZG)
  if (strategy.minCoreLength <= 3) {
    const pbPiercesBoundary = isUp
      ? pullback.low < curZd
      : pullback.high > curZg;
    if (pbPiercesBoundary) {
      return DepartureCheckResult.BranchReversal;
    }
  }

  // 规则 4：后续走势自身已独立构成完全不重叠的新中枢核心
  const checkNewCore = (startIdx: number): boolean => {
    if (startIdx + strategy.minCoreLength > count) {
      return false;
    }
    const newCoreCandidate = data.slice(
      startIdx,
      startIdx + strategy.minCoreLength,
    );
    if (
      validateTrendAlternating(newCoreCandidate) &&
      newCoreCandidate.length === strategy.minCoreLength
    ) {
      const newCore = strategy.validateCore(newCoreCandidate);
      if (newCore) {
        const isHigher = newCore.geometry.zd >= curZg;
        const isLower = newCore.geometry.zg <= curZd;
        if (isHigher || isLower) {
          return true;
        }
      }
    }
    return false;
  };

  for (let offset = 0; offset <= 1; offset++) {
    if (checkNewCore(candidateIdx + offset)) {
      return DepartureCheckResult.BranchReversal;
    }
  }

  return DepartureCheckResult.None;
}

/**
 * 中枢生命周期引擎（Channel Lifecycle Engine）
 *
 * 统一驱动笔中枢与段中枢的生命周期推进：
 * 1. 核心确立：按策略识别初始构件并确立 CentralStateMachine；
 * 2. 极值守卫：防止顺势突破穿越起点极值；
 * 3. 离开突破与规则 1～4 状态机封存（双向对称支持）：
 *    - 规则 1：3买/3卖 顺势突破 GG/DD 封存；
 *    - 规则 2：3买/3卖 逆势反转向下击穿 ZD（或向上击穿 ZG）封存；
 *    - 规则 3：无 3买/3卖，离开后单笔反向直接打穿 ZD/ZG 封存；
 *    - 规则 4：离开极值后，后续走势已独立构成合法新中枢核心，旧中枢在离开端点封存；
 * 4. 内部震荡成对触及延伸（维持动态公共重叠交集）；
 * 5. 序列末尾单元素触及保底吸纳。
 */
export class ChannelLifecycleEngine {
  static runSequentialLifecycle<T extends ChannelElement, R>(
    data: readonly T[],
    strategy: ChannelLifecycleStrategy<T, R>,
  ): { phaseA: R[]; sequential: R[] } {
    const phaseA: R[] = [];
    const sequential: R[] = [];
    const count = data.length;

    if (count < strategy.minCoreLength) {
      return { phaseA, sequential };
    }

    let cursor = 0;
    while (cursor <= count - strategy.minCoreLength) {
      // 1. 检验趋势交替与初始核心构件
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

      // 实例化显式中枢状态机
      const stateMachine = new CentralStateMachine<T>(
        cursor,
        candidateCore,
        coreInfo,
      );
      const firstElem = stateMachine.elements[0];
      let nextIdx = cursor + strategy.minCoreLength;

      // 2. 状态机推进：
      if (strategy.minCoreLength > 3) {
        // =====================================================================
        // 笔级中枢专属推进引擎（统一驱动 5 笔基础与扩展阶段，严格杜绝逻辑重复）
        // =====================================================================
        while (nextIdx < count) {
          const curr = data[nextIdx];
          if (curr.trend === data[nextIdx - 1].trend) {
            break;
          }

          const pullback = nextIdx + 1 < count ? data[nextIdx + 1] : null;
          const isBaseCoreStage = stateMachine.elements.length === 4;

          // 1. 突破判定与候选离开笔登记
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

          if (breaksExtreme) {
            stateMachine.recordCandidateDeparture(
              curr,
              nextIdx,
              candidateGg,
              candidateDd,
            );
          }

          // 2. 离开决断求值
          const canCheckDeparture = isBaseCoreStage ? hasBrokenOut : true;
          const departureDecision = canCheckDeparture
            ? stateMachine.checkDepartureRules(data, nextIdx, strategy)
            : DepartureCheckResult.None;

          // A. 顺势直接离开（出 3买/3卖 或 破GG/DD后确认2s/2b）
          const directOk = isBaseCoreStage
            ? departureDecision === DepartureCheckResult.Direct
            : breaksExtreme &&
              departureDecision === DepartureCheckResult.Direct;

          if (directOk) {
            stateMachine.sealAtCurrent(curr, candidateGg, candidateDd);
            nextIdx++;
            break;
          }

          // B. 旁枝终结信号（外部反向破坏或后续独立构成新核心）
          // 用户铁律：必须回到候选离开笔列表确认真实离开笔并重新计算！
          if (departureDecision === DepartureCheckResult.BranchReversal) {
            if (stateMachine.resolveFinalDepartureOnReversal()) {
              break;
            }
            stateMachine.collapse();
            break;
          }

          // C. 扩展阶段反向 3 卖 / 3 买 确立
          if (!isBaseCoreStage && pullback !== null && nextIdx + 2 < count) {
            const bounce = data[nextIdx + 2];
            if (bounce.trend === curr.trend) {
              const isOpposite3rd = stateMachine.isUp
                ? pullback.low < stateMachine.zd &&
                  bounce.high < stateMachine.zd
                : pullback.high > stateMachine.zg &&
                  bounce.low > stateMachine.zg;
              if (isOpposite3rd) {
                if (stateMachine.resolveFinalDepartureOnReversal()) {
                  break;
                }
                stateMachine.collapse();
                break;
              }
            }
          }

          // D. 反向击穿起笔极值守卫
          const violatesOrigin = stateMachine.isUp
            ? (isBaseCoreStage ? false : curr.low < firstElem.low) ||
              (pullback !== null && pullback.low < firstElem.low)
            : (isBaseCoreStage ? false : curr.high > firstElem.high) ||
              (pullback !== null && pullback.high > firstElem.high);

          if (violatesOrigin) {
            if (
              !isBaseCoreStage &&
              stateMachine.resolveFinalDepartureOnReversal()
            ) {
              break;
            }
            stateMachine.collapse();
            break;
          }

          // E. 未能离开且未击穿起点：成对吸纳进入扩展，或末端单元素触及吸纳
          if (pullback !== null) {
            stateMachine.absorb(curr, pullback);
            nextIdx += 2;
          } else {
            stateMachine.absorb(curr);
            nextIdx++;
            break;
          }
        }
      } else {
        // =====================================================================
        // 段级中枢推进引擎（保持原有对称生命周期推进）
        // =====================================================================
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

          // 触及震荡延伸检验：配对 (curr, nextElem)
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
            // 序列末尾单元素触及吸纳
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
      }

      // 3. 门槛校验与结果记录
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

      // 未完结中枢若未处在数据末端，说明已属于历史走势中未成型的结构，丢弃不输出
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

      // 未触发离开封存且未达成 9 元素扩展时（处于未完成状态）：
      // 检查反向崩塌守卫：若末尾元素已破坏结构（核心笔打穿进入笔起点，或延伸笔打穿反向沿），候选中枢失效作废
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

      // 推进游标至离开单元继续寻找后续中枢
      cursor = cursor + stateMachine.elements.length - 1;
    }

    return { phaseA, sequential };
  }
}
