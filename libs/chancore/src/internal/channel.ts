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
    let i = 0;

    while (i < channels.length) {
      let current = channels[i];

      // 阶段 1：向后贪婪吸收满足延伸条件（[ZD, ZG] 存在真实价格交集）的中枢
      while (i + 1 < channels.length) {
        const next = channels[i + 1];

        // 前置条件：前后两中枢共用离开笔和进入笔，且方向相同
        const lastBi = current.bis[current.bis.length - 1];
        const firstBi = next.bis[0];
        if (!this.isSameBi(lastBi, firstBi) || current.trend !== next.trend) {
          break;
        }

        // 延伸判定（[ZD, ZG] 存在真实价格交集）
        const hasCoreOverlap =
          Math.max(current.zd, next.zd) < Math.min(current.zg, next.zg);

        if (!hasCoreOverlap) {
          break;
        }

        // 执行中枢延伸融合并推进
        current = this.mergeExtendedChannel(current, next);
        i++;
      }

      // 阶段 2：检查是否与后续中枢满足扩展条件（[DD, GG] 存在极值价格交集）
      // 扩展状态机准则：
      // 1. 若当前中枢与后续中枢满足极值交集，捆绑为扩展组 [A, B]；
      // 2. 除非后续中枢与已捆绑全量中枢满足全量公共极值重叠（A+B+C 连续扩展），
      //    否则已捆绑的中枢具有排他性，禁止剥离 B 单独与 C 做 B+C 扩展；
      // 3. 连续扩展可无限向后贪婪吸收满足全量极值公共交集的新中枢。
      if (i + 1 < channels.length) {
        const next = channels[i + 1];
        const lastBi = current.bis[current.bis.length - 1];
        const firstBi = next.bis[0];
        const sharesConnectingBi = this.isSameBi(lastBi, firstBi);
        const isSameTrend = current.trend === next.trend;

        const hasExtremeOverlap =
          sharesConnectingBi &&
          isSameTrend &&
          Math.max(current.dd, next.dd) < Math.min(current.gg, next.gg);

        if (hasExtremeOverlap) {
          // 开启扩展组绑定（A + B）
          const expansionGroup: ChanChannel[] = [current, next];
          let commonDD = Math.max(current.dd, next.dd);
          let commonGG = Math.min(current.gg, next.gg);
          i++; // 已消费 channels[i+1] (即 next)

          // 尝试向后连续扩展（A + B + C + ...）
          while (i + 1 < channels.length) {
            const cand = channels[i + 1];
            const prevInGroup = expansionGroup[expansionGroup.length - 1];
            const prevLastBi = prevInGroup.bis[prevInGroup.bis.length - 1];
            const candFirstBi = cand.bis[0];

            if (
              !this.isSameBi(prevLastBi, candFirstBi) ||
              cand.trend !== expansionGroup[0].trend
            ) {
              break;
            }

            // 全量公共极值交集判定：必须与组内所有已捆绑中枢保持公共极值重叠
            const candCommonDD = Math.max(commonDD, cand.dd);
            const candCommonGG = Math.min(commonGG, cand.gg);
            const canContinuouslyExpand = candCommonDD < candCommonGG;

            if (!canContinuouslyExpand) {
              // 无法与已捆绑扩展组构成 A+B+C 连续扩展，终止扩展组吸收
              break;
            }

            // 成功加入连续扩展组
            expansionGroup.push(cand);
            commonDD = candCommonDD;
            commonGG = candCommonGG;
            i++;
          }

          // 产出扩展组：输出首个基础中枢、外层扩展大框、以及组内后续子中枢
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

      // 普通独立中枢（既无扩展也无未尽延伸）
      result.push(current);
      i++;
    }

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
    const isComplete =
      c1.type === ChannelType.Complete && c2.type === ChannelType.Complete;
    const internalBis =
      isComplete && mergedBis.length >= 5
        ? mergedBis.slice(1, -1)
        : mergedBis.slice(1);

    const gg =
      internalBis.length > 0
        ? Math.max(...internalBis.map((b) => b.high))
        : Math.max(...mergedBis.map((b) => b.high));
    const dd =
      internalBis.length > 0
        ? Math.min(...internalBis.map((b) => b.low))
        : Math.min(...mergedBis.map((b) => b.low));

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
      displayStartId: c1.displayStartId,
      displayEndId: c2.displayEndId,
      trend: c1.trend,
      extended: true,
      expanded: false,
    };
  }

  /**
   * 中枢扩展外层大框构建：
   * 1. 涵盖起止各子中枢全部构件笔（去重相邻连接笔）；
   * 2. ZG = max(...zg), ZD = min(...zd)，视觉上将各小框的核心区间整体包裹；
   * 3. GG = max(...gg), DD = min(...dd)；
   * 4. 专属标记 expanded = true，extended = false。
   */
  private buildExpandedBoundingBox(
    channels: readonly ChanChannel[],
  ): ChanChannel {
    const first = channels[0];
    const last = channels[channels.length - 1];

    const mergedBis: ChanBi[] = [...first.bis];
    for (let i = 1; i < channels.length; i++) {
      mergedBis.push(...channels[i].bis.slice(1));
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
      displayStartId: first.displayStartId,
      displayEndId: last.displayEndId,
      trend: first.trend,
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
        return {
          geometry: geo,
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

    const internalBis =
      isComplete && bis.length >= 5 ? bis.slice(1, -1) : bis.slice(1);
    const gg =
      internalBis.length > 0
        ? Math.max(...internalBis.map((b) => b.high))
        : geometry.gg;
    const dd =
      internalBis.length > 0
        ? Math.min(...internalBis.map((b) => b.low))
        : geometry.dd;

    return {
      bis: [...bis],
      zg: geometry.zg,
      zd: geometry.zd,
      gg,
      dd,
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
