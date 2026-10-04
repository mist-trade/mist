/**
 * 笔级走势中枢计算引擎（BiChannelCalculator）
 *
 * ======================================================================================
 * 核心架构与职责定位（第一性原理与白皮书 v11.0 规范）：
 * ======================================================================================
 * 1. 本模块是笔级走势中枢构建与生命周期状态机的统一核心门面；
 * 2. 状态机内生推进全生命周期管理，消除外层缝合补丁；
 * 3. 严格遵循缠论笔中枢定义：
 *    - 宏观结构：1 笔进入（entryBi）+ 中间内部振荡笔（bis，3, 5, 7... 笔）+ 1 笔离开（leaveBi，封存时确立）；
 *    - bis 构件数组严格只放纯内部振荡笔，进入笔与离开笔独立解耦挂载；
 *    - 内部笔动态收窄（Dynamic Narrowing）过滤微观毛刺；
 *    - 极值 [DD, GG] 仅取内部振荡构件极值，绝不被离开笔冲高冲低污染；
 *    - 彻底物理剔除废弃的 displayStartId 与 displayEndId。
 * ======================================================================================
 */

import {
  BiStatus,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
} from '../contracts';
import type {
  ChanBi,
  ChanBiChannel,
  ChanBiChannelTwoPhaseResult,
} from '../contracts';

import {
  ChannelLifecycleEngine,
  isSameChannelElement,
} from './channel-lifecycle';
import { BiChannelLifecyclePolicy } from './bi-channel-policy';
import { minMaxBy } from './min-max-by';

export class BiChannelCalculator {
  /**
   * 笔级走势中枢：入参 = `ChanBi[]`（通常来自 `createBi(k).phaseB`）。
   * 必须严格经过【Phase A（原始候选）+ Phase B（不动点合并）】双阶段输出。
   *
   * @param data Phase B 笔序列
   * @param options.allowUncomplete 是否允许输出末端未完成中枢（默认为 true）
   * @returns 两阶段中枢结果 { phaseA, phaseB }
   */
  createBiChannels(
    data: readonly ChanBi[],
    options?: { allowUncomplete?: boolean },
  ): ChanBiChannelTwoPhaseResult {
    // 缠论第 18 课："次级别前三个走势类型都是完成的才构成中枢"
    // 仅确认且有效的笔参与中枢运算
    const confirmed = data.filter((b) => b.status === BiStatus.Valid);

    const { phaseA, sequential } = this.sequentiallyConfirmChannels(
      confirmed,
      options,
    );

    // Phase B：采用状态机全生命周期自洽确认的中枢序列，并应用笔中枢延伸与扩展算法
    const phaseB = this.applyBiChannelExtensionAndExpansion(sequential);

    return { phaseA, phaseB };
  }

  /**
   * 对顺序生成的笔中枢应用延伸（Extension）与扩展（Expansion）逻辑：
   * 1. 共同前置条件：前后两中枢共用连接笔（前离开笔 === 后进入笔），且方向相同；
   * 2. 中枢延伸：两中枢 [ZD, ZG] 有交集，合并替换为单一大中枢；
   * 3. 中枢扩展：两中枢 [ZD, ZG] 无交集但 [DD, GG] 有交集，追加外层大框中枢（expanded: true）；
   * 4. 从前往后单向迭代，不走回头路。
   */
  applyBiChannelExtensionAndExpansion(
    channels: readonly ChanBiChannel[],
  ): ChanBiChannel[] {
    if (channels.length <= 1) {
      return [...channels];
    }

    const result: ChanBiChannel[] = [];
    let i = 0;

    while (i < channels.length) {
      let current = channels[i];

      // 阶段 1：向后贪婪吸收满足延伸条件（[ZD, ZG] 存在真实价格交集）的中枢
      while (i + 1 < channels.length) {
        const next = channels[i + 1];

        // 前置条件：连接笔判断（current 的离开笔与 next 的进入笔对齐，或末笔与首笔对齐）
        const connectingCurrent =
          current.leaveBi ?? current.bis[current.bis.length - 1];
        const connectingNext = next.entryBi ?? next.bis[0];
        if (
          !isSameChannelElement(connectingCurrent, connectingNext) ||
          current.trend !== next.trend
        ) {
          break;
        }

        // 延伸判定（[ZD, ZG] 存在真实价格交集）
        const hasCoreOverlap =
          Math.max(current.zd, next.zd) < Math.min(current.zg, next.zg);

        if (!hasCoreOverlap) {
          break;
        }

        current = this.mergeExtendedChannel(current, next);
        i++;
      }

      // 阶段 2：检查是否与后续中枢满足扩展条件（[DD, GG] 存在极值价格交集）
      if (i + 1 < channels.length) {
        const next = channels[i + 1];
        const connectingCurrent =
          current.leaveBi ?? current.bis[current.bis.length - 1];
        const connectingNext = next.entryBi ?? next.bis[0];
        const sharesConnectingBi = isSameChannelElement(
          connectingCurrent,
          connectingNext,
        );
        const isSameTrend = current.trend === next.trend;

        const hasExtremeOverlap =
          sharesConnectingBi &&
          isSameTrend &&
          Math.max(current.dd, next.dd) < Math.min(current.gg, next.gg);

        if (hasExtremeOverlap) {
          const expansionGroup: ChanBiChannel[] = [current, next];
          let commonDD = Math.max(current.dd, next.dd);
          let commonGG = Math.min(current.gg, next.gg);
          i++;

          // 尝试向后连续扩展
          while (i + 1 < channels.length) {
            const cand = channels[i + 1];
            const prevInGroup = expansionGroup[expansionGroup.length - 1];
            const prevConn =
              prevInGroup.leaveBi ??
              prevInGroup.bis[prevInGroup.bis.length - 1];
            const candConn = cand.entryBi ?? cand.bis[0];

            if (
              !isSameChannelElement(prevConn, candConn) ||
              cand.trend !== expansionGroup[0].trend
            ) {
              break;
            }

            const candCommonDD = Math.max(commonDD, cand.dd);
            const candCommonGG = Math.min(commonGG, cand.gg);
            const canContinuouslyExpand = candCommonDD < candCommonGG;

            if (!canContinuouslyExpand) {
              break;
            }

            expansionGroup.push(cand);
            commonDD = candCommonDD;
            commonGG = candCommonGG;
            i++;
          }

          result.push(expansionGroup[0]);
          const expandedBox = this.buildExpandedBoundingBox(expansionGroup);
          result.push(expandedBox);
          for (let k = 1; k < expansionGroup.length; k++) {
            result.push(expansionGroup[k]);
          }

          i++;
          continue;
        }
      }

      result.push(current);
      i++;
    }

    return result;
  }

  /**
   * 中枢延伸融合
   */
  private mergeExtendedChannel(
    c1: ChanBiChannel,
    c2: ChanBiChannel,
  ): ChanBiChannel {
    const isComplete =
      c1.type === ChannelType.Complete && c2.type === ChannelType.Complete;

    // 区分测试/旧版全量构件模式（bis 包含 entryBi 与 leaveBi）与生产纯内部构件解耦模式（bis 仅包含内部震荡构件）
    const hasFullBis = Boolean(
      (c1.entryBi &&
        c1.bis.length > 0 &&
        isSameChannelElement(c1.bis[0], c1.entryBi)) ||
        (c2.entryBi &&
          c2.bis.length > 0 &&
          isSameChannelElement(c2.bis[0], c2.entryBi)),
    );

    let mergedBis: ChanBi[];
    let internalBis: readonly ChanBi[];

    if (hasFullBis) {
      const shouldSlice =
        c1.bis.length > 0 &&
        c2.bis.length > 0 &&
        isSameChannelElement(c1.bis[c1.bis.length - 1], c2.bis[0]);
      mergedBis = shouldSlice
        ? [...c1.bis, ...c2.bis.slice(1)]
        : [...c1.bis, ...c2.bis];

      internalBis =
        isComplete && mergedBis.length >= 5
          ? mergedBis.slice(1, -1)
          : mergedBis.length > 1
            ? mergedBis.slice(1)
            : mergedBis;
    } else {
      // 纯内部构件模式：c1.bis 仅含内部笔，c1.leaveBi (或 c2.entryBi) 是连接笔，c2.bis 仅含内部笔
      mergedBis = [...c1.bis];
      const connectingBi = c1.leaveBi ?? c2.entryBi;
      if (
        connectingBi &&
        !mergedBis.some((b) => isSameChannelElement(b, connectingBi))
      ) {
        mergedBis.push(connectingBi);
      }
      for (const b of c2.bis) {
        if (!mergedBis.some((existing) => isSameChannelElement(existing, b))) {
          mergedBis.push(b);
        }
      }
      // 连接笔与两侧内部构件共同构成融合中枢的全量内部震荡笔，无需二次 slice(1, -1)
      internalBis = mergedBis;
    }

    const gg =
      internalBis.length > 0
        ? Math.max(...internalBis.map((b) => b.high))
        : Math.max(c1.gg, c2.gg);
    const dd =
      internalBis.length > 0
        ? Math.min(...internalBis.map((b) => b.low))
        : Math.min(c1.dd, c2.dd);

    let zg: number;
    let zd: number;

    const intHigh = minMaxBy(internalBis, (b) => b.high);
    const intLow = minMaxBy(internalBis, (b) => b.low);

    if (intHigh && intLow && intHigh.min > intLow.max) {
      zg = intHigh.min;
      zd = intLow.max;
    } else {
      zg = Math.min(c1.zg, c2.zg);
      zd = Math.max(c1.zd, c2.zd);
    }

    return {
      bis: mergedBis,
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Bi,
      type: isComplete ? ChannelType.Complete : ChannelType.UnComplete,
      status: ChannelStatus.Valid,
      startId: c1.startId,
      endId: c2.endId,
      trend: c1.trend,
      extended: true,
      expanded: c1.expanded || c2.expanded,
      entryBi: c1.entryBi,
      leaveBi: c2.leaveBi ?? c1.leaveBi,
    };
  }

  /**
   * 构造中枢扩展外层大框
   */
  private buildExpandedBoundingBox(
    channels: readonly ChanBiChannel[],
  ): ChanBiChannel {
    const first = channels[0];
    const last = channels[channels.length - 1];

    const mergedBis: ChanBi[] = [...first.bis];
    for (let i = 1; i < channels.length; i++) {
      const nextBis = channels[i].bis;
      if (
        mergedBis.length > 0 &&
        nextBis.length > 0 &&
        isSameChannelElement(mergedBis[mergedBis.length - 1], nextBis[0])
      ) {
        mergedBis.push(...nextBis.slice(1));
      } else {
        mergedBis.push(...nextBis);
      }
    }

    const isComplete = channels.every((c) => c.type === ChannelType.Complete);
    const zg = Math.max(...channels.map((c) => c.zg));
    const zd = Math.min(...channels.map((c) => c.zd));
    const gg = Math.max(...channels.map((c) => c.gg));
    const dd = Math.min(...channels.map((c) => c.dd));

    return {
      bis: mergedBis,
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Bi,
      type: isComplete ? ChannelType.Complete : ChannelType.UnComplete,
      status: ChannelStatus.Valid,
      startId: first.startId,
      endId: last.endId,
      trend: first.trend,
      extended: false,
      expanded: true,
      entryBi: first.entryBi,
      leaveBi: last.leaveBi,
    };
  }

  /**
   * 顺序确认扫描与生命周期状态机推进
   */
  private sequentiallyConfirmChannels(
    data: readonly ChanBi[],
    options?: { allowUncomplete?: boolean },
  ): { phaseA: ChanBiChannel[]; sequential: ChanBiChannel[] } {
    const policy = new BiChannelLifecyclePolicy({
      allowUncomplete: options?.allowUncomplete,
    });
    return ChannelLifecycleEngine.runSequentialLifecycle(data, policy);
  }

  isCandidateChannelValid(channel: ChanBiChannel): boolean {
    if (channel.zg <= channel.zd) {
      return false;
    }
    if (
      channel.status !== undefined &&
      channel.status !== ChannelStatus.Valid
    ) {
      return false;
    }
    if (channel.leaveBi) {
      return channel.bis.length >= 3;
    }
    const minLength = channel.type === ChannelType.UnComplete ? 4 : 5;
    return channel.bis.length >= minLength;
  }
}
