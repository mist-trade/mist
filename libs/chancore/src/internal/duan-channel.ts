import {
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  DuanStatus,
  TrendDirection,
} from '../contracts';
import type {
  ChanDuan,
  ChanDuanChannel,
  ChanDuanChannelTwoPhaseResult,
} from '../contracts';

import {
  DuanChannelLifecycleEngine,
  type DuanChannelLifecycleStrategy,
  computeSymmetricGeometry,
  resolveChannelAnchorIds,
} from './channel-lifecycle';

/**
 * 段级中枢（Duan-level Channel）—— 以段为构成单元的中枢。缠论原典 17 课：
 * 中枢 = "至少三个连续次级别走势类型所重叠的部分"，是**无方向的区域**。
 *
 * 采用顺序确认生命周期状态机（委托至通用的 ChannelLifecycleEngine）：
 * - 顺序确认扫描：从左至右顺序寻找 3 段基础中枢核心（趋势交替 + 对称重叠 zg > zd）。
 * - 动态区间延伸：内部震荡段保持动态公共交集更新 [ZD, ZG]。
 * - 离开突破与规则 1～4 状态机封存：顺势离开突破极值后，通过 3买/3卖确认、反向击穿或新中枢成立触发旧中枢封存。
 * - 9 段结合扩展：持续震荡满 9 段时触发中枢扩展（expanded: true）并闭合。
 */
export class DuanChannelCalculator {
  createDuanChannels(
    duans: readonly ChanDuan[],
    options?: { allowUncomplete?: boolean },
  ): ChanDuanChannelTwoPhaseResult {
    // 仅确认且有效的段构成中枢（status !== Valid 的未确认尾段不参与：
    // 18 课"次级别前三个走势类型都是完成的才构成中枢"；统一 status 判据，
    // 现时 status=Unknown ⇔ endBi===null；数据层 createDuan 输出不变）。
    const confirmed = duans.filter((d) => d.status === DuanStatus.Valid);
    const { phaseA, sequential } = this.sequentiallyConfirmChannels(
      confirmed,
      options,
    );

    // Phase B：采用顺序确认中枢序列，并应用段中枢延伸（Extension）与扩展（Expansion）算法
    const phaseB = this.applyDuanChannelExtensionAndExpansion(sequential);
    return { phaseA, phaseB };
  }

  /**
   * 对顺序生成的段中枢应用延伸（Extension）与扩展（Expansion）逻辑：
   * 1. 延伸合并：相邻段中枢 [ZD, ZG] 存在真实价格重叠且相连，链式贪婪吸收合并为单一延伸段中枢；
   * 2. 扩展大框：相邻段中枢 [ZD, ZG] 无交集但 [DD, GG] 存在极值价格交集，双层叠加生成 expanded: true 的外层大框。
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

      // 阶段 1：向后贪婪吸收满足延伸条件（[ZD, ZG] 存在真实价格交集）的段中枢
      while (i + 1 < channels.length) {
        const next = channels[i + 1];
        const lastDuan = current.duans[current.duans.length - 1];
        const firstDuan = next.duans[0];
        const isConnected =
          this.isSameDuan(lastDuan, firstDuan) ||
          lastDuan.endTime.getTime() === firstDuan.startTime.getTime();

        if (!isConnected) {
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

      // 阶段 2：检查是否满足扩展条件（[DD, GG] 存在极值价格交集）
      if (i + 1 < channels.length) {
        const next = channels[i + 1];
        const hasExtremeOverlap =
          Math.max(current.dd, next.dd) < Math.min(current.gg, next.gg);

        if (hasExtremeOverlap) {
          const expansionGroup: ChanDuanChannel[] = [current, next];
          let commonDD = Math.max(current.dd, next.dd);
          let commonGG = Math.min(current.gg, next.gg);
          i++;

          while (i + 1 < channels.length) {
            const cand = channels[i + 1];
            const candCommonDD = Math.max(commonDD, cand.dd);
            const candCommonGG = Math.min(commonGG, cand.gg);
            if (candCommonDD >= candCommonGG) {
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

  private isSameDuan(a: ChanDuan, b: ChanDuan): boolean {
    return (
      a.startTime.getTime() === b.startTime.getTime() &&
      a.endTime.getTime() === b.endTime.getTime()
    );
  }

  private mergeExtendedDuanChannel(
    c1: ChanDuanChannel,
    c2: ChanDuanChannel,
  ): ChanDuanChannel {
    const mergedDuans: ChanDuan[] = [...c1.duans];
    for (const d of c2.duans) {
      if (!mergedDuans.some((existing) => this.isSameDuan(existing, d))) {
        mergedDuans.push(d);
      }
    }

    const zg = Math.min(c1.zg, c2.zg);
    const zd = Math.max(c1.zd, c2.zd);
    const gg = Math.max(c1.gg, c2.gg);
    const dd = Math.min(c1.dd, c2.dd);

    return {
      duans: mergedDuans,
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
      displayStartId: c1.displayStartId,
      displayEndId: c2.displayEndId,
      expanded: false,
    };
  }

  private buildExpandedBoundingBox(
    channels: readonly ChanDuanChannel[],
  ): ChanDuanChannel {
    const first = channels[0];
    const last = channels[channels.length - 1];

    const mergedDuans: ChanDuan[] = [...first.duans];
    for (let c = 1; c < channels.length; c++) {
      for (const d of channels[c].duans) {
        if (!mergedDuans.some((existing) => this.isSameDuan(existing, d))) {
          mergedDuans.push(d);
        }
      }
    }

    const zg = Math.max(first.zg, last.zd);
    const zd = Math.min(first.zg, last.zd);
    const gg = Math.max(...channels.map((c) => c.gg));
    const dd = Math.min(...channels.map((c) => c.dd));

    return {
      duans: mergedDuans,
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Duan,
      type: ChannelType.Complete,
      status: ChannelStatus.Valid,
      startId: first.startId,
      endId: last.endId,
      displayStartId: first.displayStartId,
      displayEndId: last.displayEndId,
      expanded: true,
    };
  }

  /**
   * 顺序确认扫描与生命周期状态机推进（委托至通用的 ChannelLifecycleEngine）
   */
  private sequentiallyConfirmChannels(
    duans: readonly ChanDuan[],
    options?: { allowUncomplete?: boolean },
  ): {
    phaseA: ChanDuanChannel[];
    sequential: ChanDuanChannel[];
  } {
    const strategy: DuanChannelLifecycleStrategy<ChanDuan, ChanDuanChannel> = {
      minCoreLength: 3,
      minSealedLength: 3,
      allowUncomplete: options?.allowUncomplete,
      validateCore: (window) => {
        const geo = computeSymmetricGeometry(window);
        if (!geo) return null;
        return {
          geometry: geo,
          isUp: window[0].trend === TrendDirection.Up,
        };
      },
      buildPhaseAChannel: (elements, original, startIndex, coreGeometry) => {
        const baseThree = elements.slice(0, 3);
        return this.buildChannelFromDuans(
          baseThree,
          original,
          startIndex,
          coreGeometry,
          false,
        );
      },
      buildSealedChannel: (
        elements,
        original,
        startIndex,
        geometry,
        expanded,
        isComplete = true,
      ) => {
        return this.buildChannelFromDuans(
          elements,
          original,
          startIndex,
          geometry,
          expanded,
          isComplete,
        );
      },
    };

    return DuanChannelLifecycleEngine.runSequentialLifecycle(duans, strategy);
  }

  /**
   * 从 N 段序列和几何参数构建 ChanDuanChannel。
   */
  private buildChannelFromDuans(
    duans: readonly ChanDuan[],
    originalDuans: readonly ChanDuan[],
    startIndex: number,
    geometry: { zg: number; zd: number; gg: number; dd: number },
    expanded = false,
    isComplete = true,
  ): ChanDuanChannel {
    const endIndex = startIndex + duans.length - 1;
    const { startId, endId, displayStartId, displayEndId } =
      resolveChannelAnchorIds(originalDuans, startIndex, endIndex);

    return {
      duans: [...duans],
      zg: geometry.zg,
      zd: geometry.zd,
      gg: geometry.gg,
      dd: geometry.dd,
      level: ChannelLevel.Duan,
      type: isComplete ? ChannelType.Complete : ChannelType.UnComplete,
      status: ChannelStatus.Valid,
      expanded,
      startId,
      endId,
      displayStartId,
      displayEndId,
    };
  }

  isCandidateChannelValid(channel: ChanDuanChannel): boolean {
    return channel.duans.length >= 3 && channel.zg > channel.zd;
  }
}
