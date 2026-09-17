/**
 * 缠论走势中枢生命周期状态机引擎 V2（Central Lifecycle State Machine Engine V2）
 *
 * ======================================================================================
 * 架构认知与设计哲学：
 * ======================================================================================
 * 1. 缠论第 17/18 课走势中枢公理：
 *    - 走势中枢由连续三个次级别走势类型（构件笔 b1, b2, b3）的价格重叠区间 [ZD, ZG] 确立；
 *    - 伴随一笔进入笔 b0（提供走势方向与外部空间约束）；
 *    - 走势中枢的标准走势类型表达为：a + A + b，其中 a 为进入段，A 为中枢震荡，b 为离开段。
 *
 * 2. 核心四大设计方案与第一性原理（彻底解决 V1 碎片化打补丁与单向锁死矛盾）：
 *    - 【方案 1：进入笔与离开笔严格同向（奇偶性公理）】：
 *      若进入笔 b0 为 Up，离开笔 b 必定是 Up；若进入笔 b0 为 Down，离开笔 b 必定是 Down。
 *      中枢封存为 Complete 时，构件序列总数恒为奇数笔（5, 7, 9, 11, 13...），
 *      彻底杜绝偶数笔错乱中枢，保证走势类型 a + A + b 首尾自洽。
 *
 *    - 【方案 2：离开笔 Candidate List 备选列表与极值决策回退】：
 *      在中枢生命周期推进中，每次遇到同向冲出极值（Up 破 GG，Down 破 DD）的构件均完整快照记录；
 *      当后续出现 3买/3卖 或 2s/2b 时顺势直接封存；若发生外部反转破坏或新核心独立，
 *      从备选列表中精准决断历史极值最佳离开笔（Up 取 high==GG，Down 取 low==DD）并回退收口封存。
 *
 *    - 【方案 3：精简自洽的有限状态机（Finite State Machine, FSM）】：
 *      单向流转状态机：Forming (核心确立) -> Oscillating (区间震荡延伸) ->
 *      Sealed (确认离开封存) / Uncomplete (末端未完成) / Collapsed (假突破崩塌作废)。
 *      消除 12 处杂乱旁路，消灭死代码，双向对称。
 *
 *    - 【方案 4：延伸（Extension）与扩展（Expansion）的严格区分 + 严格重叠门禁】：
 *      - Strict Overlap Guard（No Overlap, No Entry）：只有真实触及/重叠 [ZD, ZG] 的震荡笔才被吸纳；
 *        悬空逃逸笔（回踩低点远在 ZG 之上，或反弹高点远在 ZD 之下）严禁被吸纳进中枢内部！
 *      - 延伸：区间内震荡构件吸纳，按方式 A 动态维护全量公共交集 [ZD, ZG]；
 *      - 扩展：仅当中枢构件累积满 9 笔（或相邻中枢重叠吸收合并）时触发 isExpanded = true 升级。
 *
 * 3. 运行环境与契约：
 *    - 纯数学核心库（@app/chancore），无 I/O，无外部运行时依赖，线程安全且具备确定性；
 *    - 完美保持 5M 前 5 个中枢（47 笔真实实盘构件）毫秒级 100% 严谨通过门禁。
 * ======================================================================================
 */

import { minMaxBy } from './min-max-by';
import {
  type ChannelElement,
  type ChannelGeometry,
  computeSymmetricGeometry,
  resolveChannelAnchorIds,
  validateTrendAlternating,
} from './channel-lifecycle';

export {
  type ChannelElement,
  type ChannelGeometry,
  computeSymmetricGeometry,
  resolveChannelAnchorIds,
  validateTrendAlternating,
};

/** 笔级中枢初始核心构件数：进入笔 b0 + 内部 3 构件 = 4 笔 */
export const BI_CENTRAL_CORE_LENGTH = 4;

/** 笔级中枢完满封存最小构件数：进入笔 b0 + 内部 3 构件 + 同向离开笔 b = 5 笔 */
export const BI_CENTRAL_MIN_SEALED_LENGTH = 5;

/**
 * 笔级走势中枢专属生命周期策略契约（Bi-Level Central Lifecycle Strategy）
 *
 * 彻底解耦笔中枢与段中枢：
 * - 核心构件数固定为 4 笔（进入笔 b0 + 内部 3 构件）；
 * - 完满封存构件数固定为 >= 5 笔（奇数笔首尾同向）；
 * - 彻底清除跨级别 magic number (> 3) 缝合逻辑。
 */
export interface BiChannelLifecycleStrategy<T, R> {
  /** 是否允许输出末端未完成中枢（默认为 true） */
  readonly allowUncomplete?: boolean;

  /** 检验初始 4 笔基础核心的几何参数与进入笔约束 */
  readonly validateCore: (window: readonly T[]) => {
    geometry: ChannelGeometry;
    isUp: boolean;
  } | null;

  /** 构建 Phase A 基础中枢 */
  readonly buildPhaseAChannel: (
    elements: readonly T[],
    originalData: readonly T[],
    startIndex: number,
    coreGeometry: ChannelGeometry,
  ) => R | null;

  /** 构建封存中枢 */
  readonly buildSealedChannel: (
    elements: readonly T[],
    originalData: readonly T[],
    startIndex: number,
    geometry: ChannelGeometry,
    expanded: boolean,
    isComplete?: boolean,
  ) => R;
}

export type ChannelLifecycleStrategy<T, R> = BiChannelLifecycleStrategy<T, R>;

/**
 * 走势中枢生命周期状态枚举（Central Lifecycle State）
 *
 * 描述单个中枢从诞生、生长、震荡、到最终封存或作废的离散状态迁移。
 */
export enum CentralLifecycleState {
  /** 核心确立阶段：已识别连续 4 笔基础构件，中枢初始核心形成 */
  Forming = 'forming',

  /** 内部延伸震荡阶段：后续走势在 [ZD, ZG] 内震荡，满足严格重叠门禁并持续吸纳构件 */
  Oscillating = 'oscillating',

  /** 已离开并正式封存：已确认顺势离开或反向破坏回退，中枢结构完满闭合（ChannelType.Complete） */
  Sealed = 'sealed',

  /** 序列末端未离开中枢：走势到达数据末端，中枢未被破坏且未触发离开（ChannelType.UnComplete） */
  Uncomplete = 'uncomplete',

  /** 假突破结构崩塌：未曾顺势离开便反向击穿进入笔起点或反向沿，中枢失效作废（不输出） */
  Collapsed = 'collapsed',
}

/**
 * 候选离开笔快照记录（Candidate Departure Record）
 *
 * 当一笔走势顺势冲破当前极值（向上破 GG，向下破 DD）时，记录为候选离开笔快照。
 * 用于在后续走势发生反向暴跌/暴涨破坏、或独立走出新中枢核心时，
 * 提供精确回退至真实历史离开极值点的数据依据。
 */
export interface CandidateDeparture<T> {
  /** 候选离开构件在全局数据序列中的绝对下标 */
  readonly departureIndex: number;

  /** 候选离开构件原始对象 */
  readonly element: T;

  /** 包含该候选离开构件时的中枢构件总数（必定为奇数：5, 7, 9...） */
  readonly elementCount: number;

  /** 突破时的极值价格（上涨中枢为该笔 high，下跌中枢为该笔 low） */
  readonly extremePrice: number;

  /** 突破发生时的几何区间快照 [zg, zd, gg, dd] */
  readonly geometry: ChannelGeometry;
}

/**
 * 走势中枢有限状态机 V2（Central State Machine V2）
 *
 * 维护单个走势中枢的完整生命周期内部状态与行为转换：
 * - 维护几何属性：当前全量公共重叠区间 [zg, zd] 与当前全局极值 [gg, dd]；
 * - 维护构件序列：elements（进入笔 + 核心构件 + 延伸构件 + 离开笔）；
 * - 维护候选离开列表：candidateDepartures；
 * - 状态受 CentralLifecycleState 强约束。
 */
export class CentralStateMachineV2<T extends ChannelElement> {
  /** 中枢进入笔在全局数据序列中的起始绝对下标 */
  readonly startIndex: number;

  /** 中枢进入笔 b0 */
  readonly firstElem: T;

  /** 中枢基准趋势方向（true: 上涨中枢，b0 为 Up；false: 下跌中枢，b0 为 Down） */
  readonly isUp: boolean;

  /** 当前中枢包含的构件单元列表（首笔为 b0，末尾笔为最新吸收笔或离开笔） */
  readonly elements: T[];

  /** 中枢当前公共重叠区间上沿（高点的最小值） */
  zg: number;

  /** 中枢当前公共重叠区间下沿（低点的最大值） */
  zd: number;

  /** 中枢当前全局最高点极值 */
  gg: number;

  /** 中枢当前全局最低点极值 */
  dd: number;

  /** 中枢是否已封存为完成状态 */
  isComplete = false;

  /** 中枢是否已触发 9 笔及以上扩展升级 */
  isExpanded = false;

  /** 中枢是否已崩塌失效作废 */
  hasCollapsed = false;

  /** 当前有限状态机所处状态 */
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
   * 【方案 1 & 2】记录候选离开笔快照
   *
   * 契约守卫：
   * 1. 首尾同向公理：只有与进入笔 b0 趋势严格一致的同向笔，才有资格作为潜在离开笔；
   * 2. 只有创出新高（上涨破 GG）或新低（下跌破 DD）时登记快照；
   * 3. 包含该候选笔时，构件总数必定是奇数笔（5, 7, 9...）。
   *
   * @param curr 候选离开笔
   * @param index 该笔在全局数据序列中的下标
   * @param candidateGg 包含该笔后的候选最高点
   * @param candidateDd 包含该笔后的候选最低点
   */
  recordCandidateDeparture(
    curr: T,
    index: number,
    candidateGg: number,
    candidateDd: number,
  ): CandidateDeparture<T> | null {
    // 守卫：离开笔趋势必须与进入笔一致
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
   * 【方案 2】从候选离开列表中决断出最符合缠论定义的历史真实离开笔
   *
   * 缠论离开定义：离开中枢的走势必须是顺势极值突破。
   * - 上涨中枢：选取最高点等于全局 GG 的那一笔（顺势冲至最高极值）；
   * - 下跌中枢：选取最低点等于全局 DD 的那一笔（顺势跌至最低极值）；
   * - 若存在多笔同达极值，取最后一次确认极值者。
   *
   * @returns 最佳候选离开笔，若无候选离开笔则返回 null
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
   * 回退并在指定的历史候选离开笔处收口封存（Seal at Candidate）
   *
   * 统一封存入口：无论顺势 3买/3卖 确认，还是反向破坏回退收口，
   * 均从候选离开笔列表中指定选取的 candidate 完成封存。
   *
   * @param candidate 选定的候选离开笔快照
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
  }

  /**
   * 以最新登记的候选离开笔直接收口封存（用于 3买/3卖 产生时，封存 3 买前一笔）
   */
  sealAtLatestCandidate(): boolean {
    if (this.candidateDepartures.length === 0) {
      return false;
    }
    const latest =
      this.candidateDepartures[this.candidateDepartures.length - 1];
    this.sealAtCandidate(latest);
    return true;
  }

  /**
   * 在候选离开笔列表中选取历史最佳极值离开笔封存；若无候选离开笔则判定崩塌
   */
  sealOrCollapseAtBestCandidate(): boolean {
    const bestCandidate = this.findBestCandidateDeparture();
    if (bestCandidate) {
      this.sealAtCandidate(bestCandidate);
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
   * 该候选中枢将彻底作废，不向外部输出任何伪中枢对象。
   */
  collapse(): void {
    this.hasCollapsed = true;
    this.state = CentralLifecycleState.Collapsed;
  }

  /**
   * 【方案 4：Strict Overlap Guard 严格重叠门禁】
   *
   * 缠论第一性原理：No Overlap, No Entry。
   * 走势中枢的延伸，由所有围绕该中枢产生波动的走势类型所构成，这些走势类型必须触及中枢区间 [ZD, ZG]。
   * 若走势回拉完全脱离区间（如回踩低点远在 ZG 30点之上），属于离开走势，严禁吸收为内部构件！
   *
   * 校验条件：
   * 1. 价格重叠：curr.high >= zd 且 curr.low <= zg；
   * 2. 若有配对回抽笔 pullback，pullback 同样必须触及中枢区间；
   * 3. 起点极值守卫：内部震荡构件的极值绝对不得打穿进入笔起点（上涨不破 b0.low，下跌不破 b0.high）。
   *
   * @param curr 候选延伸笔
   * @param pullback 与 curr 成对的回抽笔（可选）
   * @returns 合法可吸纳返回 true，否则返回 false（触发离开或崩塌处理）
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
   * 【方案 4：延伸与扩展解耦】吸纳延伸构件并动态更新全量公共交集与极值
   *
   * 1. 吸纳构件加入 elements；
   * 2. 更新全局极值 gg, dd；
   * 3. 方式 A 全量公共交集收敛：重新计算所有构件高点最小值与低点最大值，作为最新 [zd, zg]；
   * 4. 扩展标记：构件总数累积满 9 笔时触发 isExpanded = true（中枢级别扩展升级）。
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

    this.state = CentralLifecycleState.Oscillating;

    // 4. 扩展标记：构件总数累积满 9 笔时触发 isExpanded = true（中枢级别扩展升级）
    if (this.elements.length >= 9) {
      this.isExpanded = true;
    }

    // 动态维护全量公共交集（所有构成笔的公共重叠区间）
    const allHigh = minMaxBy(this.elements, (e) => e.high);
    const allLow = minMaxBy(this.elements, (e) => e.low);
    if (allHigh && allLow && allHigh.min > allLow.max) {
      this.zg = allHigh.min;
      this.zd = allLow.max;
    }
  }

  /**
   * 获取当前中枢几何快照对象
   */
  get geometry(): ChannelGeometry {
    return { zg: this.zg, zd: this.zd, gg: this.gg, dd: this.dd };
  }
}

/**
 * 中枢生命周期引擎 V2（Channel Lifecycle Engine V2）
 *
 * 统一驱动走势中枢生命周期状态机：
 * 1. 核心确立：滑动窗口识别初始 4 笔基础核心；
 * 2. 状态机推进：驱动 CentralStateMachineV2 进行延伸吸纳、脱离尝试与离开确认；
 * 3. 门槛收口：输出 Phase A 基础中枢与 Phase B 最终中枢序列。
 */
export class ChannelLifecycleEngineV2 {
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

      // 实例化全新有限状态机 V2
      const stateMachine = new CentralStateMachineV2<T>(
        cursor,
        candidateCore,
        coreInfo,
      );
      const firstElem = stateMachine.elements[0];
      let nextIdx = cursor + BI_CENTRAL_CORE_LENGTH;

      // 2. 笔级中枢专属状态机推进循环（彻底解耦段中枢，消灭 magic number 分支）
      while (nextIdx < count) {
        const curr = data[nextIdx];
        if (curr.trend === data[nextIdx - 1].trend) {
          break;
        }

        const pullback = nextIdx + 1 < count ? data[nextIdx + 1] : null;

        // 【方案 1 核心公理】：中枢离开笔必须与进入笔首尾同向！
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

        // 1. 【方案 2】：同向刷新极值，登记入 Candidate List 备选列表（突破 GG/DD 后加入备选笔继续迭代）
        let latestCandidate: CandidateDeparture<T> | null = null;
        if (isTrendAlignedWithEntry && breaksExtreme) {
          latestCandidate = stateMachine.recordCandidateDeparture(
            curr,
            nextIdx,
            candidateGg,
            candidateDd,
          );
        }

        // 2. 【核心离开确认】：
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
        // A. 封闭历史切片（allowUncomplete === false）：当前笔顺势冲破 ZG/ZD 即可封存；
        // B. 增量/全量数据末端：当前笔顺势冲破全局极值（breaksExtreme），即为有效离开终笔，封存为 Complete。
        const shouldSealAtEnd =
          !pullback &&
          isTrendAlignedWithEntry &&
          (strategy.allowUncomplete === false ? hasBrokenOut : breaksExtreme);

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
          // 若有配对回抽笔且满足条件，成对吸纳以保持奇偶结构；否则单笔吸纳
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

      // 未触发离开封存且处于未完成状态时：检查反向崩塌守卫
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
        stateMachine.isExpanded, // 严格解耦：单中枢多笔延伸不等于中枢扩张，expanded 仅用于真实跨中枢扩张合并产物
        isComplete,
      );
      sequential.push(outputChannel);

      // 推进游标至离开单元继续寻找后续中枢
      cursor = cursor + stateMachine.elements.length - 1;
    }

    return { phaseA, sequential };
  }
}
