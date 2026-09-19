/**
 * 缠论走势中枢计算引擎（ChannelCalculator）
 *
 * ======================================================================================
 * 核心架构与职责定位（第一性原理）：
 * ======================================================================================
 * 1. 本模块是笔级走势中枢构建与生命周期状态机的统一核心门面；
 * 2. 状态机内生推进全生命周期管理，消除外层缝合补丁；
 * 3. 严格遵循缠论走势中枢定义：
 *    - 进入笔与离开笔严格同向（奇偶性公理：5, 7, 9, 11, 13...）；
 *    - 离开笔 Candidate List 备选列表与 3买/3卖 / 2s/2b 离开决断；
 *    - Strict Overlap Guard（No Overlap, No Entry）严格重叠门禁；
 *    - 跨级别宏观大笔切片支持与封闭切片末端离开守卫。
 * ======================================================================================
 */

import {
  BiStatus,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  TrendDirection,
} from '../contracts';
import type {
  ChanBi,
  ChanChannel,
  ChanChannelTwoPhaseResult,
} from '../contracts';

import {
  type BiChannelLifecycleStrategy,
  ChannelLifecycleEngine,
  resolveChannelAnchorIds,
} from './channel-lifecycle';
import { minMaxBy } from './min-max-by';

export class ChannelCalculator {
  /**
   * 笔级走势中枢：入参 = `ChanBi[]`（通常来自 `createBi(k).phaseB`）。
   * 必须严格经过【Phase A（原始候选）+ Phase B（不动点合并）】双阶段输出。
   *
   * @param data Phase B 笔序列
   * @param options.allowUncomplete 是否允许输出末端未完成中枢（默认为 true）
   * @returns 两阶段中枢结果 { phaseA, phaseB }
   */
  createChannels(
    data: readonly ChanBi[],
    options?: { allowUncomplete?: boolean },
  ): ChanChannelTwoPhaseResult {
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
   * 1. 共同前置条件：前后两中枢必须共用连接笔（前离开笔 === 后进入笔），且方向相同；
   * 2. 中枢延伸：两中枢 [ZD, ZG] 有交集，合并替换为单一大中枢，所有构件笔重新计算几何区间；支持链式贪婪吸收；
   * 3. 中枢扩展：两中枢 [ZD, ZG] 无交集但 [DD, GG] 有交集，双层叠加保留，保留两中枢并额外追加外层大框中枢（expanded: true）；
   * 4. 从前往后单向迭代，不走回头路。
   */
  applyBiChannelExtensionAndExpansion(
    channels: readonly ChanChannel[],
  ): ChanChannel[] {
    if (channels.length <= 1) {
      return [...channels];
    }

    const result: ChanChannel[] = [];
    let current = channels[0];

    for (let i = 1; i < channels.length; i++) {
      const next = channels[i];

      // 前置条件1：前后两中枢共用离开笔和进入笔
      const lastBiOfCurrent = current.bis[current.bis.length - 1];
      const firstBiOfNext = next.bis[0];
      const sharesConnectingBi = this.isSameBi(lastBiOfCurrent, firstBiOfNext);

      // 前置条件2：同方向
      const isSameTrend = current.trend === next.trend;

      if (!sharesConnectingBi || !isSameTrend) {
        result.push(current);
        current = next;
        continue;
      }

      // 条件3：中枢延伸判定（[ZD, ZG] 存在真实价格交集）
      const hasCoreOverlap =
        Math.max(current.zd, next.zd) < Math.min(current.zg, next.zg);

      if (hasCoreOverlap) {
        // 执行中枢延伸融合（替换当前中枢，并继续向后贪婪吸收）
        current = this.mergeExtendedChannel(current, next);
        continue;
      }

      // 条件4：中枢扩展判定（[ZD, ZG] 无交集，但 [DD, GG] 存在真实价格交集）
      const hasExtremeOverlap =
        Math.max(current.dd, next.dd) < Math.min(current.gg, next.gg);

      if (hasExtremeOverlap) {
        // 双层叠加保留：保留 current，并生成包含 current 与 next 的外层大框
        result.push(current);
        const expandedBox = this.buildExpandedBoundingBox(current, next);
        result.push(expandedBox);
        current = next;
        continue;
      }

      // 既无延伸也无扩展
      result.push(current);
      current = next;
    }

    result.push(current);
    return result;
  }

  /**
   * 判断两笔是否为同一笔（支持引用相等或起止时间与高低点一致）
   */
  private isSameBi(a: ChanBi, b: ChanBi): boolean {
    if (a === b) return true;
    return (
      a.startTime.getTime() === b.startTime.getTime() &&
      a.endTime.getTime() === b.endTime.getTime() &&
      a.high === b.high &&
      a.low === b.low
    );
  }

  /**
   * 中枢延伸融合：
   * 1. 合并构件笔序列（排除重复的连接笔）；
   * 2. 全量笔重算 GG / DD；
   * 3. 排除进入笔与离开笔，以所有内部构件笔重算公共交集 [ZD, ZG]，极端波动倒挂时保底回退为两中枢原区间交集；
   * 4. 继承未完成/已完成状态与扩展标记。
   */
  private mergeExtendedChannel(c1: ChanChannel, c2: ChanChannel): ChanChannel {
    const mergedBis = [...c1.bis, ...c2.bis.slice(1)];
    const gg = Math.max(...mergedBis.map((b) => b.high));
    const dd = Math.min(...mergedBis.map((b) => b.low));

    let zg: number;
    let zd: number;

    const internalBis = mergedBis.slice(1, -1);
    const intHigh = minMaxBy(internalBis, (b) => b.high);
    const intLow = minMaxBy(internalBis, (b) => b.low);

    if (intHigh && intLow && intHigh.min > intLow.max) {
      zg = intHigh.min;
      zd = intLow.max;
    } else {
      zg = Math.min(c1.zg, c2.zg);
      zd = Math.max(c1.zd, c2.zd);
    }

    const isComplete =
      c1.type === ChannelType.Complete && c2.type === ChannelType.Complete;

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
      displayStartId: c1.displayStartId,
      displayEndId: c2.displayEndId,
      trend: c1.trend,
      extended: true,
      expanded: false,
    };
  }

  /**
   * 中枢扩展外层大框构建：
   * 1. 涵盖起止两中枢全部笔；
   * 2. ZG = max(zg1, zg2), ZD = min(zd1, zd2)，视觉上将两小框的核心区间整体包裹；
   * 3. GG = max(gg1, gg2), DD = min(dd1, dd2)；
   * 4. 专属标记 expanded = true，extended = false。
   */
  private buildExpandedBoundingBox(
    c1: ChanChannel,
    c2: ChanChannel,
  ): ChanChannel {
    const mergedBis = [...c1.bis, ...c2.bis.slice(1)];
    const isComplete =
      c1.type === ChannelType.Complete && c2.type === ChannelType.Complete;

    return {
      bis: mergedBis,
      zg: Math.max(c1.zg, c2.zg),
      zd: Math.min(c1.zd, c2.zd),
      gg: Math.max(c1.gg, c2.gg),
      dd: Math.min(c1.dd, c2.dd),
      level: ChannelLevel.Bi,
      type: isComplete ? ChannelType.Complete : ChannelType.UnComplete,
      status: ChannelStatus.Valid,
      startId: c1.startId,
      endId: c2.endId,
      displayStartId: c1.displayStartId,
      displayEndId: c2.displayEndId,
      trend: c1.trend,
      extended: false,
      expanded: true,
    };
  }

  /**
   * 顺序确认扫描与生命周期状态机推进（委托至通用的 ChannelLifecycleEngine）
   */
  private sequentiallyConfirmChannels(
    data: readonly ChanBi[],
    options?: { allowUncomplete?: boolean },
  ): {
    phaseA: ChanChannel[];
    sequential: ChanChannel[];
  } {
    const strategy: BiChannelLifecycleStrategy<ChanBi, ChanChannel> = {
      allowUncomplete: options?.allowUncomplete,
      validateCore: (window) => {
        const geo = this.validateCoreGeometry(window);
        if (!geo) return null;
        const firstBi = window[0];
        const gg = Math.max(firstBi.high, geo.gg);
        const dd = Math.min(firstBi.low, geo.dd);
        return {
          geometry: { ...geo, gg, dd },
          isUp: firstBi.trend === TrendDirection.Up,
        };
      },
      buildPhaseAChannel: (elements, original, startIndex, coreGeometry) => {
        const baseFive = elements.slice(0, 5);
        return this.buildChannelFromBis(
          baseFive,
          original,
          startIndex,
          coreGeometry,
          false,
          false,
        );
      },
      buildSealedChannel: (
        elements,
        original,
        startIndex,
        geometry,
        _expanded,
        isComplete = true,
      ) => {
        return this.buildChannelFromBis(
          elements,
          original,
          startIndex,
          geometry,
          false,
          false,
          isComplete,
        );
      },
    };

    return ChannelLifecycleEngine.runSequentialLifecycle(data, strategy);
  }

  /**
   * 从 N 笔构件序列和几何参数构建输出标准的 ChanChannel 对象
   */
  private buildChannelFromBis(
    bis: readonly ChanBi[],
    originalBis: readonly ChanBi[],
    startIndex: number,
    geometry: { zg: number; zd: number; gg: number; dd: number },
    extended = false,
    expanded = false,
    isComplete = true,
  ): ChanChannel {
    const endIndex = startIndex + bis.length - 1;
    const { startId, endId, displayStartId, displayEndId } =
      resolveChannelAnchorIds(originalBis, startIndex, endIndex);

    return {
      bis: [...bis],
      zg: geometry.zg,
      zd: geometry.zd,
      gg: geometry.gg,
      dd: geometry.dd,
      level: ChannelLevel.Bi,
      type: isComplete ? ChannelType.Complete : ChannelType.UnComplete,
      status: ChannelStatus.Valid,
      startId,
      endId,
      trend: bis[0].trend,
      extended,
      expanded,
      displayStartId,
      displayEndId,
    };
  }

  /**
   * 验证候选中枢是否有效
   */
  isCandidateChannelValid(channel: ChanChannel): boolean {
    const minLength = channel.type === ChannelType.UnComplete ? 4 : 5;
    return channel.bis.length >= minLength && channel.zg > channel.zd;
  }

  /**
   * 计算并验证 3 笔核心 (+ 进入笔 b0 = 4 笔) 的几何参数与进入笔约束
   */
  private validateCoreGeometry(fourBis: readonly ChanBi[]): {
    zg: number;
    zd: number;
    gg: number;
    dd: number;
  } | null {
    if (fourBis.length < 4) {
      return null;
    }

    const firstBi = fourBis[0];
    const isUp = firstBi.trend === TrendDirection.Up;

    let zg: number, zd: number, gg: number, dd: number;
    if (isUp) {
      const frontHigh = minMaxBy(fourBis, (bi) => bi.high);
      const backLow = minMaxBy(fourBis.slice(1), (bi) => bi.low);
      if (!frontHigh || !backLow) return null;
      zg = frontHigh.min;
      gg = frontHigh.max;
      zd = backLow.max;
      dd = backLow.min;
    } else {
      const backHigh = minMaxBy(fourBis.slice(1), (bi) => bi.high);
      const frontLow = minMaxBy(fourBis, (bi) => bi.low);
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

    // 约束2：进入笔外部端点必须在中枢 [ZD, ZG] 之外（即进入笔确实从外部进入中枢）
    if (isUp) {
      if (firstBi.low >= zd) {
        return null;
      }
      // 约束3：上涨中枢进入笔起点必须是最低点（内部构件最低不得跌破进入笔起点）
      if (dd < firstBi.low) {
        return null;
      }
    } else {
      if (firstBi.high <= zg) {
        return null;
      }
      // 约束3：下跌中枢进入笔起点必须是最高点（内部构件最高不得突破进入笔起点）
      if (gg > firstBi.high) {
        return null;
      }
    }

    return { zg, zd, gg, dd };
  }
}
