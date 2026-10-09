/**
 * 段级走势中枢计算引擎（DuanChannelCalculator）
 *
 * ======================================================================================
 * 核心架构与职责定位（缠论第一性原理与 a + 3 + b 同构架构）：
 * ======================================================================================
 * 1. 本模块是段级走势中枢构建与生命周期状态机的统一核心门面；
 * 2. 状态机内生推进全生命周期管理，笔与段完全共享 ChannelLifecycleEngine 统一内核；
 * 3. 严格遵循缠论第 17、18、20 课公理：
 *    - 宏观结构：1 段进入（entryDuan）+ 中间内部振荡段（duans，3, 4, 5... 段）+ 1 段离开（leaveDuan，封存时确立）；
 *    - duans 构件数组严格只放纯内部振荡段（>= 3 段），进入段与离开段独立解耦挂载；
 *    - 内部段动态收窄（Dynamic Narrowing）：取内部段公共重叠区间；
 *    - 极值 [DD, GG] 仅取内部振荡构件极值，绝不受离开段冲高冲低污染；
 *    - trend: 中枢形成方向（回升形成 Up 或 回调形成 Down，遵循第 20 课 Z 走势段逻辑）；
 *    - 彻底物理剔除废弃的 displayStartId 与 displayEndId。
 * ======================================================================================
 */

import {
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  DuanStatus,
} from '../contracts';
import type {
  ChanDuan,
  ChanDuanChannel,
  ChanDuanChannelTwoPhaseResult,
} from '../contracts';
import {
  ChannelLifecycleEngine,
  isSameChannelElement,
} from './channel-lifecycle';
import { DuanChannelLifecyclePolicy } from './duan-channel-policy';

export class DuanChannelCalculator {
  /**
   * 段级走势中枢：入参 = `ChanDuan[]`（通常来自 `createDuan`）。
   * 必须严格经过【Phase A（原始候选）+ Phase B（延伸合并）】双阶段输出。
   */
  createDuanChannels(
    duans: readonly ChanDuan[],
    options?: { allowUncomplete?: boolean },
  ): ChanDuanChannelTwoPhaseResult {
    // 缠论第 18 课："次级别前三个走势类型都是完成的才构成中枢"
    // 仅确认且有效的段参与中枢运算
    const confirmed = duans.filter((d) => d.status === DuanStatus.Valid);

    const { phaseA, sequential } = this.sequentiallyConfirmChannels(
      confirmed,
      options,
    );

    // Phase B：采用状态机全生命周期自洽确认的中枢序列，并应用段中枢延伸算法
    const phaseB = this.applyDuanChannelExtensionAndExpansion(sequential);

    return { phaseA, phaseB };
  }

  /**
   * 对顺序生成的段中枢应用延伸（Extension）逻辑（原典第 35 课定理三）：
   * 相邻段中枢 [ZD, ZG] 存在真实价格重叠且相连，链式吸收合并为单一延伸段中枢。
   */
  applyDuanChannelExtensionAndExpansion(
    channels: readonly ChanDuanChannel[],
  ): ChanDuanChannel[] {
    if (channels.length <= 1) {
      return [...channels];
    }

    const result: ChanDuanChannel[] = [];
    let i = 0;

    while (i < channels.length) {
      let current = channels[i];

      // 向后贪婪吸收满足延伸条件（[ZD, ZG] 存在真实价格交集）的段中枢
      while (i + 1 < channels.length) {
        const next = channels[i + 1];
        if (next.type !== ChannelType.Complete) {
          break;
        }

        const lastDuan =
          current.leaveDuan ?? current.duans[current.duans.length - 1];
        const firstDuan = next.entryDuan ?? next.duans[0];
        const isConnected =
          isSameChannelElement(lastDuan, firstDuan) ||
          lastDuan.endTime.getTime() === firstDuan.startTime.getTime();

        if (!isConnected || current.trend !== next.trend) {
          break;
        }

        const hasCoreOverlap =
          Math.max(current.zd, next.zd) < Math.min(current.zg, next.zg);
        if (!hasCoreOverlap) {
          break;
        }

        current = this.mergeExtendedDuanChannel(current, next);
        i++;
      }

      // 阶段 2：检查是否与后续中枢满足扩展条件（[DD, GG] 存在极值价格交集，原典第 35 课定理二/三）
      // 用户核心规则：
      // 1. 如果前一个中枢是 Macro，后一个中枢是普通的，就不进行中枢扩展
      // 2. 如果两个中枢都是普通的，再判断中枢扩展，如果扩展了，就把两个中枢一起框起来，单独生成一个玫红色
      // 3. 所有参与扩展的内容均被消耗，不进入下一次判断扩展
      const isCurrentMacro =
        current.upgradedLevel === ChannelLevel.Macro ||
        current.duans.length >= 9;

      if (!isCurrentMacro && i + 1 < channels.length) {
        const next = channels[i + 1];
        const isNextMacro =
          next.upgradedLevel === ChannelLevel.Macro || next.duans.length >= 9;

        if (!isNextMacro) {
          const connectingCurrent =
            current.leaveDuan ?? current.duans[current.duans.length - 1];
          const connectingNext = next.entryDuan ?? next.duans[0];
          const sharesConnectingDuan = isSameChannelElement(
            connectingCurrent,
            connectingNext,
          );
          const isSameTrend = current.trend === next.trend;

          const hasExtremeOverlap =
            sharesConnectingDuan &&
            isSameTrend &&
            Math.max(current.dd, next.dd) < Math.min(current.gg, next.gg);

          if (hasExtremeOverlap) {
            const expansionGroup: ChanDuanChannel[] = [current, next];
            let commonDD = Math.max(current.dd, next.dd);
            let commonGG = Math.min(current.gg, next.gg);
            i++;

            // 尝试向后连续扩展（候选必须同样为非 Macro 普通中枢）
            while (i + 1 < channels.length) {
              const cand = channels[i + 1];
              const isCandMacro =
                cand.upgradedLevel === ChannelLevel.Macro ||
                cand.duans.length >= 9;
              if (isCandMacro) {
                break;
              }

              const prevInGroup = expansionGroup[expansionGroup.length - 1];
              const prevConn =
                prevInGroup.leaveDuan ??
                prevInGroup.duans[prevInGroup.duans.length - 1];
              const candConn = cand.entryDuan ?? cand.duans[0];

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

            const absorbedGroup = expansionGroup.map((c) => ({
              ...c,
              absorbed: true,
            }));
            const expandedBox =
              this.buildExpandedDuanBoundingBox(expansionGroup);
            result.push(absorbedGroup[0]);
            result.push(expandedBox);
            for (let k = 1; k < absorbedGroup.length; k++) {
              result.push(absorbedGroup[k]);
            }

            i++;
            continue;
          }
        }
      }

      result.push(current);
      i++;
    }

    return result;
  }

  /**
   * 构造段中枢扩展外层大框（原典第 35 课高一级宏观中枢，标记为 Macro 级别）
   */
  private buildExpandedDuanBoundingBox(
    channels: readonly ChanDuanChannel[],
  ): ChanDuanChannel {
    const first = channels[0];
    const last = channels[channels.length - 1];

    const mergedDuans: ChanDuan[] = [...first.duans];
    for (let i = 1; i < channels.length; i++) {
      const prev = channels[i - 1];
      const next = channels[i];
      const connectingDuan = prev.leaveDuan ?? next.entryDuan;
      if (
        connectingDuan &&
        !mergedDuans.some((d) => isSameChannelElement(d, connectingDuan))
      ) {
        mergedDuans.push(connectingDuan);
      }
      for (const d of next.duans) {
        if (
          !mergedDuans.some((existing) => isSameChannelElement(existing, d))
        ) {
          mergedDuans.push(d);
        }
      }
    }

    const isComplete = channels.every((c) => c.type === ChannelType.Complete);
    const zg = Math.max(...channels.map((c) => c.zg));
    const zd = Math.min(...channels.map((c) => c.zd));
    const gg = Math.max(...channels.map((c) => c.gg));
    const dd = Math.min(...channels.map((c) => c.dd));

    return {
      duans: mergedDuans,
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Duan,
      type: isComplete ? ChannelType.Complete : ChannelType.UnComplete,
      status: ChannelStatus.Valid,
      startId: first.startId,
      endId: last.endId,
      trend: first.trend,
      extended: false,
      expanded: true,
      absorbed: false,
      upgradedLevel: ChannelLevel.Macro,
      entryDuan: first.entryDuan,
      leaveDuan: last.leaveDuan ?? first.leaveDuan,
    };
  }

  private mergeExtendedDuanChannel(
    c1: ChanDuanChannel,
    c2: ChanDuanChannel,
  ): ChanDuanChannel {
    const mergedDuans: ChanDuan[] = [...c1.duans];
    if (
      c1.leaveDuan &&
      !mergedDuans.some((d) => isSameChannelElement(d, c1.leaveDuan!))
    ) {
      mergedDuans.push(c1.leaveDuan);
    }
    for (const d of c2.duans) {
      if (!mergedDuans.some((existing) => isSameChannelElement(existing, d))) {
        mergedDuans.push(d);
      }
    }

    const zg = Math.min(c1.zg, c2.zg);
    const zd = Math.max(c1.zd, c2.zd);
    const gg = Math.max(c1.gg, c2.gg);
    const dd = Math.min(c1.dd, c2.dd);

    const isNineDuans = mergedDuans.length >= 9;
    const isExpanded = c1.expanded || c2.expanded;

    return {
      duans: mergedDuans,
      entryDuan: c1.entryDuan,
      leaveDuan: c2.leaveDuan ?? c1.leaveDuan,
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Duan,
      type:
        c1.type === ChannelType.Complete && c2.type === ChannelType.Complete
          ? ChannelType.Complete
          : ChannelType.UnComplete,
      status: ChannelStatus.Valid,
      startId: c1.startId,
      endId: c2.endId,
      trend: c1.trend,
      extended: true,
      expanded: isExpanded,
      upgradedLevel:
        c1.upgradedLevel ||
        c2.upgradedLevel ||
        (isNineDuans ? ChannelLevel.Macro : undefined),
    };
  }

  /**
   * 顺序确认扫描与通用生命周期状态机推进
   */
  private sequentiallyConfirmChannels(
    data: readonly ChanDuan[],
    options?: { allowUncomplete?: boolean },
  ): {
    phaseA: ChanDuanChannel[];
    sequential: ChanDuanChannel[];
  } {
    const policy = new DuanChannelLifecyclePolicy({
      allowUncomplete: options?.allowUncomplete,
    });
    return ChannelLifecycleEngine.runSequentialLifecycle(data, policy);
  }

  isCandidateChannelValid(channel: ChanDuanChannel): boolean {
    if (channel.zg <= channel.zd) {
      return false;
    }
    if (
      channel.status !== undefined &&
      channel.status !== ChannelStatus.Valid
    ) {
      return false;
    }
    if (channel.duans.length < 3) {
      return false;
    }
    if (channel.type === ChannelType.Complete && !channel.leaveDuan) {
      return false;
    }
    return true;
  }
}
