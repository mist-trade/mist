/**
 * 段级走势中枢生命周期专属策略（DuanChannelLifecyclePolicy）
 *
 * ======================================================================================
 * 架构定位与职责契约（严格遵循缠论原典第 17、18、20、35、57 课公理）：
 * ======================================================================================
 * 1. 离开段方向中立（双向离开与全量 8 大场景全景）：
 *    - 顺势离开（同向）：上涨中枢出 3买（Up 离开），下跌中枢出 3卖（Down 离开）；
 *    - 反向离开（转折）：上涨中枢出 3卖（Down 离开），下跌中枢出 3买（Up 离开）；
 * 2. 内部段数放开为任意整数 >= 3：
 *    - 同向离开：内部段数为奇数（3, 5, 7, 9...）；
 *    - 反向离开：内部段数为偶数（4, 6, 8, 10...）；
 *    - 序列末端未完结：内部段数为当前实际吸纳数（3, 4, 5, 6...）；
 * 3. 精细化反向打穿保护：
 *    - 初生核心（1进 + 前3内部段）确立后，后续向下跌破进入段起点 a.low，属于反向离开破坏，
 *      直接作为反向离开段完满封存（Sealed），绝对禁止判定为 Collapse 崩塌误杀；
 * 4. 恒定区间锁定（Invariant）：
 *    - dynamicNarrowing = false，[ZD, ZG] 严格由前 3 段构件锁定，内部震荡不动态收窄。
 * ======================================================================================
 */

import { ChannelLevel, ChannelStatus, ChannelType } from '../contracts';
import type { ChanDuan, ChanDuanChannel } from '../contracts';
import {
  type CandidateDeparture,
  type ChannelGeometry,
  type ChannelLifecyclePolicy,
  type ChannelStateMachine,
  type AbsorbResult,
  CHANNEL_CORE_LENGTH,
  CHANNEL_MIN_SEALED_LENGTH,
  resolveChannelAnchorIds,
  validateStandardCoreGeometry,
} from './channel-lifecycle';

export interface DuanChannelPolicyOptions {
  readonly allowUncomplete?: boolean;
}

export class DuanChannelLifecyclePolicy
  implements ChannelLifecyclePolicy<ChanDuan, ChanDuanChannel>
{
  readonly allowUncomplete: boolean;
  readonly dynamicNarrowing = false;

  constructor(options?: DuanChannelPolicyOptions) {
    this.allowUncomplete = options?.allowUncomplete ?? true;
  }

  validateCore(
    window: readonly ChanDuan[],
  ): { geometry: ChannelGeometry; isUp: boolean } | null {
    return validateStandardCoreGeometry(window);
  }

  /**
   * 候选离开段检测与登记（方向中立契约）
   * - 同向：冲破极值（Up破GG，Down破DD）；
   * - 反向：脱离中枢下沿或上沿（Up中枢Down段破ZD/DD，Down中枢Up段破ZG/GG）。
   */
  evaluateCandidateDeparture(
    curr: ChanDuan,
    index: number,
    stateMachine: ChannelStateMachine<ChanDuan>,
  ): CandidateDeparture<ChanDuan> | null {
    const isSameTrend = curr.trend === stateMachine.firstElem.trend;

    if (isSameTrend) {
      // 同向顺势突破
      const breaksExtreme = stateMachine.isUp
        ? curr.high > stateMachine.gg
        : curr.low < stateMachine.dd;
      if (breaksExtreme) {
        const candidateGg = stateMachine.isUp
          ? Math.max(stateMachine.gg, curr.high)
          : stateMachine.gg;
        const candidateDd = !stateMachine.isUp
          ? Math.min(stateMachine.dd, curr.low)
          : stateMachine.dd;
        return stateMachine.recordCandidateDeparture(
          curr,
          index,
          candidateGg,
          candidateDd,
          true,
        );
      }
    } else {
      // 反向转折脱离中枢
      const breaksOpposite = stateMachine.isUp
        ? curr.low < stateMachine.zd
        : curr.high > stateMachine.zg;
      if (breaksOpposite) {
        const candidateGg = !stateMachine.isUp
          ? Math.max(stateMachine.gg, curr.high)
          : stateMachine.gg;
        const candidateDd = stateMachine.isUp
          ? Math.min(stateMachine.dd, curr.low)
          : stateMachine.dd;
        return stateMachine.recordCandidateDeparture(
          curr,
          index,
          candidateGg,
          candidateDd,
          true,
        );
      }
    }

    return null;
  }

  /**
   * 核心离开确认裁决（支持全量 8 大场景全景）
   */
  checkDepartureConfirmation(
    curr: ChanDuan,
    nextIdx: number,
    pullback: ChanDuan | null,
    latestCandidate: CandidateDeparture<ChanDuan> | null,
    data: readonly ChanDuan[],
    stateMachine: ChannelStateMachine<ChanDuan>,
  ): boolean {
    const isSameTrend = curr.trend === stateMachine.firstElem.trend;

    // 场景 1：第 3 类买卖点确立离开
    if (pullback) {
      if (isSameTrend) {
        // 1.1 & 1.2 同向离开确认：Up 出 3买，Down 出 3卖
        const hasBrokenOut = stateMachine.isUp
          ? curr.high > stateMachine.zg
          : curr.low < stateMachine.zd;
        const isThirdBsp = stateMachine.isThirdBuyOrSellPoint(pullback);
        if (hasBrokenOut && isThirdBsp) {
          this.ensureAndSealCandidate(
            curr,
            nextIdx,
            stateMachine,
            latestCandidate,
          );
          return true;
        }
      } else {
        // 1.3 & 1.4 反向离开确认：Up 出 3卖（反抽不破 ZD），Down 出 3买（回试不破 ZG）
        const hasBrokenOpposite = stateMachine.isUp
          ? curr.low < stateMachine.zd
          : curr.high > stateMachine.zg;
        const isOppositeThirdBsp = stateMachine.isUp
          ? pullback.high < stateMachine.zd // Up 中枢反抽不升破 ZD -> 3卖！
          : pullback.low > stateMachine.zg; // Down 中枢次回试不跌破 ZG -> 3买！
        if (hasBrokenOpposite && isOppositeThirdBsp) {
          this.ensureAndSealCandidate(
            curr,
            nextIdx,
            stateMachine,
            latestCandidate,
          );
          return true;
        }
      }
    }

    // 场景 2：次级别衰竭转折（2s / 2b）
    if (
      latestCandidate &&
      stateMachine.isSecondClassReversal(latestCandidate, data, nextIdx)
    ) {
      stateMachine.sealAtCandidate(latestCandidate);
      return true;
    }

    // 场景 3：新中枢独立成型（原典第 20 课定理二，走势脱离后在不重叠区间走出新核心）
    if (nextIdx + CHANNEL_CORE_LENGTH <= data.length) {
      // 若回拉段仍触及当前中枢 [ZD, ZG]，说明走势尚未脱离当前中枢，不可作为新中枢切分
      const pullbackTouches =
        pullback &&
        pullback.high >= stateMachine.zd &&
        pullback.low <= stateMachine.zg;
      if (!pullbackTouches) {
        const nextCore = data.slice(nextIdx, nextIdx + CHANNEL_CORE_LENGTH);
        const isNextCoreValid = validateStandardCoreGeometry(nextCore);
        if (isNextCoreValid) {
          const nextCoreHasNoOverlap = stateMachine.isUp
            ? isNextCoreValid.geometry.zg < stateMachine.zd ||
              isNextCoreValid.geometry.zd > stateMachine.zg
            : isNextCoreValid.geometry.zd > stateMachine.zg ||
              isNextCoreValid.geometry.zg < stateMachine.zd;
          if (nextCoreHasNoOverlap) {
            // 在脱离点 curr 处收口封存前中枢
            this.ensureAndSealCandidate(
              curr,
              nextIdx,
              stateMachine,
              latestCandidate,
            );
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 场景 4 & 极端反向打穿起点处理：
   * 只要中枢核心已确立，反向暴跌击穿 a.low 属于反向离开破坏，以反向离开段完满封存，绝不崩塌！
   */
  handleOppositePiercing(
    pullback: ChanDuan | null,
    stateMachine: ChannelStateMachine<ChanDuan>,
  ): boolean {
    if (!pullback) return false;

    const isPiercing = stateMachine.piercesOppositeExtreme(pullback);
    if (!isPiercing) return false;

    // 若 pullback 触及中枢核心区间 [ZD, ZG]，按中心定理一属于内部延伸震荡，绝非反向离开
    if (pullback.high >= stateMachine.zd && pullback.low <= stateMachine.zg) {
      return false;
    }

    // 若存在已登记的候选离开段（如向上假突破后被下一段反向下穿），优先封存于候选离开段
    const best = stateMachine.findBestCandidateDeparture();
    if (best) {
      stateMachine.sealAtCandidate(best);
      return true;
    }

    // 若尚未登记 candidate departure，说明当前正在中枢内部震荡，
    // 该 pullback 即将作为下一轮迭代的 curr（反向脱离段）进行评估与封存，
    // 因此此处不拦截、不崩塌，放行由后续循环将其作为反向离开段处理。
    return false;
  }

  /**
   * 场景 7：序列末端顺势或反向离开段封存守卫
   */
  checkTailSealing(
    curr: ChanDuan,
    nextIdx: number,
    stateMachine: ChannelStateMachine<ChanDuan>,
  ): boolean {
    const isSameTrend = curr.trend === stateMachine.firstElem.trend;

    if (isSameTrend) {
      // 同向突破极值
      const breaksExtreme = stateMachine.isUp
        ? curr.high > stateMachine.gg
        : curr.low < stateMachine.dd;
      if (breaksExtreme) {
        this.ensureAndSealCandidate(curr, nextIdx, stateMachine);
        return true;
      }
    } else {
      // 反向跌破/突破中枢区间
      const breaksOpposite = stateMachine.isUp
        ? curr.low < stateMachine.zd
        : curr.high > stateMachine.zg;
      if (breaksOpposite) {
        this.ensureAndSealCandidate(curr, nextIdx, stateMachine);
        return true;
      }
    }

    return false;
  }

  /**
   * 内部延伸震荡阶段：
   * 逐段单段吸纳！只要当前段触及 [ZD, ZG]，推入 elements，consumedCount = 1。
   * 内部段数平滑支持 3, 4, 5, 6, 7... 任意整数！
   */
  tryAbsorbExtension(
    curr: ChanDuan,
    _pullback: ChanDuan | null,
    stateMachine: ChannelStateMachine<ChanDuan>,
  ): AbsorbResult {
    // 触及中枢 [ZD, ZG] 门禁
    const currTouches =
      curr.high >= stateMachine.zd && curr.low <= stateMachine.zg;
    if (currTouches) {
      stateMachine.absorb(curr, undefined, this.dynamicNarrowing);
      return { absorbed: true, consumedCount: 1, shouldStop: false };
    }
    return { absorbed: false, consumedCount: 0 };
  }

  /**
   * 场景 8：走势断裂脱离收口
   */
  sealOrCollapseOnBreakdown(
    stateMachine: ChannelStateMachine<ChanDuan>,
  ): boolean {
    return stateMachine.sealOrCollapseAtBestCandidate();
  }

  buildPhaseAChannel(
    elements: readonly ChanDuan[],
    original: readonly ChanDuan[],
    startIndex: number,
    coreGeometry: ChannelGeometry,
  ): ChanDuanChannel | null {
    return this.buildChannelFromDuans(
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
    elements: readonly ChanDuan[],
    original: readonly ChanDuan[],
    startIndex: number,
    geometry: ChannelGeometry,
    expanded: boolean,
    isComplete = true,
  ): ChanDuanChannel {
    return this.buildChannelFromDuans(
      elements,
      original,
      startIndex,
      geometry,
      false,
      expanded,
      isComplete,
    );
  }

  private ensureAndSealCandidate(
    curr: ChanDuan,
    nextIdx: number,
    stateMachine: ChannelStateMachine<ChanDuan>,
    latestCandidate?: CandidateDeparture<ChanDuan> | null,
  ): void {
    if (!latestCandidate) {
      const candidateGg = Math.max(stateMachine.gg, curr.high);
      const candidateDd = Math.min(stateMachine.dd, curr.low);
      stateMachine.recordCandidateDeparture(
        curr,
        nextIdx,
        candidateGg,
        candidateDd,
        true,
      );
    }
    stateMachine.sealAtLatestCandidate();
  }

  private buildChannelFromDuans(
    duans: readonly ChanDuan[],
    originalDuans: readonly ChanDuan[],
    startIndex: number,
    geometry: ChannelGeometry,
    extended = false,
    expanded = false,
    isComplete = true,
  ): ChanDuanChannel {
    const endIndex = startIndex + duans.length - 1;
    const entryDuan = duans[0];
    const isSealed = isComplete && duans.length >= CHANNEL_MIN_SEALED_LENGTH;
    const leaveDuan = isSealed ? duans[duans.length - 1] : undefined;

    const startId = resolveChannelAnchorIds(
      originalDuans,
      startIndex + 1,
      endIndex,
    ).startId;
    const endId = resolveChannelAnchorIds(
      originalDuans,
      startIndex,
      isSealed ? endIndex - 1 : endIndex,
    ).endId;

    // 内部段：已封存且 >= 5 段时取纯内部段 [1, -1]；未完成时取 [1..]
    const internalDuans = isSealed ? duans.slice(1, -1) : duans.slice(1);

    // 极值 [dd, gg] 仅从内部震荡构件获取，绝不受离开段污染
    const gg =
      internalDuans.length > 0
        ? Math.max(...internalDuans.map((d) => d.high))
        : geometry.gg;
    const dd =
      internalDuans.length > 0
        ? Math.min(...internalDuans.map((d) => d.low))
        : geometry.dd;

    const zg = geometry.zg;
    const zd = geometry.zd;

    const isNineDuans = internalDuans.length >= 9;
    const isExpanded = expanded || isNineDuans;

    return {
      duans: [...internalDuans],
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Duan,
      type: isComplete ? ChannelType.Complete : ChannelType.UnComplete,
      status: ChannelStatus.Valid,
      startId,
      endId,
      trend: entryDuan.trend,
      extended,
      expanded: isExpanded,
      upgradedLevel: isExpanded ? ChannelLevel.Macro : undefined,
      entryDuan,
      leaveDuan,
    };
  }
}
