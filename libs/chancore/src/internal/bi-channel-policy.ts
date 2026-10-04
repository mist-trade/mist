/**
 * 笔级走势中枢生命周期专属策略（BiChannelLifecyclePolicy）
 *
 * ======================================================================================
 * 架构定位与职责契约：
 * ======================================================================================
 * 1. 笔级中枢专属高内聚业务规则，与段级中枢物理解耦、零交叉污染；
 * 2. 100% 保留原有笔中枢的所有历史公理与行为特性：
 *    - 首尾严格同向公理：离开笔必须与进入笔趋势严格一致；
 *    - 奇数内部笔铁律：内部振荡笔强制成对吸纳，始终维持奇数笔（3, 5, 7...）；
 *    - 穿底崩溃行为：反向暴跌击穿进入笔起点且无同向离开笔候选时，严格判为 Collapse 崩塌作废；
 *    - 微观动态收窄：dynamicNarrowing = true，消除微观毛刺；
 *    - 顺势 3买/3卖 与 2s/2b 次级别背驰衰竭离开确认。
 * ======================================================================================
 */

import { ChannelLevel, ChannelStatus, ChannelType } from '../contracts';
import type { ChanBi, ChanBiChannel } from '../contracts';
import {
  type CandidateDeparture,
  type ChannelGeometry,
  type ChannelLifecyclePolicy,
  type ChannelStateMachine,
  type AbsorbResult,
  CHANNEL_MIN_SEALED_LENGTH,
  resolveChannelAnchorIds,
  validateStandardCoreGeometry,
} from './channel-lifecycle';
import { minMaxBy } from './min-max-by';

export interface BiChannelPolicyOptions {
  readonly allowUncomplete?: boolean;
}

export class BiChannelLifecyclePolicy
  implements ChannelLifecyclePolicy<ChanBi, ChanBiChannel>
{
  readonly allowUncomplete: boolean;
  readonly dynamicNarrowing = true;

  constructor(options?: BiChannelPolicyOptions) {
    this.allowUncomplete = options?.allowUncomplete ?? true;
  }

  validateCore(
    window: readonly ChanBi[],
  ): { geometry: ChannelGeometry; isUp: boolean } | null {
    return validateStandardCoreGeometry(window);
  }

  evaluateCandidateDeparture(
    curr: ChanBi,
    index: number,
    stateMachine: ChannelStateMachine<ChanBi>,
  ): CandidateDeparture<ChanBi> | null {
    const isTrendAlignedWithEntry = curr.trend === stateMachine.firstElem.trend;
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
  }

  checkDepartureConfirmation(
    curr: ChanBi,
    nextIdx: number,
    pullback: ChanBi | null,
    latestCandidate: CandidateDeparture<ChanBi> | null,
    data: readonly ChanBi[],
    stateMachine: ChannelStateMachine<ChanBi>,
  ): boolean {
    const isTrendAlignedWithEntry = curr.trend === stateMachine.firstElem.trend;
    const hasBrokenOut = stateMachine.isUp
      ? curr.high > stateMachine.zg
      : curr.low < stateMachine.zd;

    const candidateGg = stateMachine.isUp
      ? Math.max(stateMachine.gg, curr.high)
      : stateMachine.gg;
    const candidateDd = !stateMachine.isUp
      ? Math.min(stateMachine.dd, curr.low)
      : stateMachine.dd;

    // 形式 A：3买 / 3卖确认（离开笔就是 3 买笔前面的那一笔）
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

    // 形式 B：2s / 2b 次级别背驰衰竭转折确认（冲破极值后走出次高点转折）
    if (
      latestCandidate &&
      stateMachine.isSecondClassReversal(latestCandidate, data, nextIdx)
    ) {
      stateMachine.sealAtCandidate(latestCandidate);
      return true;
    }

    return false;
  }

  handleOppositePiercing(
    pullback: ChanBi | null,
    stateMachine: ChannelStateMachine<ChanBi>,
  ): boolean {
    if (pullback && stateMachine.piercesOppositeExtreme(pullback)) {
      stateMachine.sealOrCollapseAtBestCandidate();
      return true;
    }
    return false;
  }

  checkTailSealing(
    curr: ChanBi,
    nextIdx: number,
    stateMachine: ChannelStateMachine<ChanBi>,
  ): boolean {
    const isTrendAlignedWithEntry = curr.trend === stateMachine.firstElem.trend;
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
  }

  tryAbsorbExtension(
    curr: ChanBi,
    pullback: ChanBi | null,
    stateMachine: ChannelStateMachine<ChanBi>,
  ): AbsorbResult {
    if (stateMachine.canAbsorbExtension(curr, pullback)) {
      if (pullback && stateMachine.canAbsorbExtension(pullback)) {
        stateMachine.absorb(curr, pullback, this.dynamicNarrowing);
        return { absorbed: true, consumedCount: 2, shouldStop: false };
      } else {
        stateMachine.absorb(curr, undefined, this.dynamicNarrowing);
        return { absorbed: true, consumedCount: 1, shouldStop: true };
      }
    }
    return { absorbed: false, consumedCount: 0 };
  }

  sealOrCollapseOnBreakdown(
    stateMachine: ChannelStateMachine<ChanBi>,
  ): boolean {
    return stateMachine.sealOrCollapseAtBestCandidate();
  }

  buildPhaseAChannel(
    elements: readonly ChanBi[],
    original: readonly ChanBi[],
    startIndex: number,
    coreGeometry: ChannelGeometry,
  ): ChanBiChannel | null {
    return this.buildChannelFromBis(
      elements,
      original,
      startIndex,
      coreGeometry,
      false,
      false,
      elements.length >= CHANNEL_MIN_SEALED_LENGTH,
    );
  }

  buildSealedChannel(
    elements: readonly ChanBi[],
    original: readonly ChanBi[],
    startIndex: number,
    geometry: ChannelGeometry,
    expanded: boolean,
    isComplete = true,
  ): ChanBiChannel {
    return this.buildChannelFromBis(
      elements,
      original,
      startIndex,
      geometry,
      false,
      expanded,
      isComplete,
    );
  }

  private buildChannelFromBis(
    bis: readonly ChanBi[],
    originalBis: readonly ChanBi[],
    startIndex: number,
    geometry: ChannelGeometry,
    extended = false,
    expanded = false,
    isComplete = true,
  ): ChanBiChannel {
    const endIndex = startIndex + bis.length - 1;
    const { startId, endId } = resolveChannelAnchorIds(
      originalBis,
      startIndex,
      endIndex,
    );

    const entryBi = bis[0];
    const isSealed = isComplete && bis.length >= CHANNEL_MIN_SEALED_LENGTH;
    const leaveBi = isSealed ? bis[bis.length - 1] : undefined;

    // 内部笔：已封存且 >= 5 笔时取 [1, -1]；若未完结（如 4 笔）则取 [1..]
    const internalBis = isSealed ? bis.slice(1, -1) : bis.slice(1);

    // 极值 [dd, gg] 仅从内部震荡构件获取，绝不受离开笔污染
    const gg =
      internalBis.length > 0
        ? Math.max(...internalBis.map((b) => b.high))
        : geometry.gg;
    const dd =
      internalBis.length > 0
        ? Math.min(...internalBis.map((b) => b.low))
        : geometry.dd;

    // 动态收窄 [zd, zg]：取内部笔公共重叠区间
    let zg = geometry.zg;
    let zd = geometry.zd;
    if (internalBis.length >= 3) {
      const intHigh = minMaxBy(internalBis, (b) => b.high);
      const intLow = minMaxBy(internalBis, (b) => b.low);
      if (intHigh && intLow && intHigh.min > intLow.max) {
        zg = intHigh.min;
        zd = intLow.max;
      }
    }

    return {
      bis: [...internalBis],
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Bi,
      type: isComplete ? ChannelType.Complete : ChannelType.UnComplete,
      status: ChannelStatus.Valid,
      startId,
      endId,
      trend: entryBi.trend,
      extended,
      expanded,
      entryBi,
      leaveBi,
    };
  }
}
