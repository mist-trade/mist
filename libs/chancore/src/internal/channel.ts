/**
 * 缠论走势中枢计算引擎（ChannelCalculator）
 *
 * ======================================================================================
 * 核心架构与职责定位（基于状态机 V2 第一性原理）：
 * ======================================================================================
 * 1. 本模块是笔级走势中枢构建与生命周期状态机的统一核心门面；
 * 2. 彻底废除 V1 外层拼接缝合补丁（mergeAdjacentOverlappingChannels），由 CentralStateMachineV2 内生推进；
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
  ChannelLifecycleEngineV2,
  resolveChannelAnchorIds,
} from './channel-lifecycle-v2';
import { partitionSubBisForMacroBis } from './channel-partition';
import { minMaxBy } from './min-max-by';

export class ChannelCalculator {
  /**
   * 跨级别邻近笔约束中枢求值（Adjacent Timeframe Pair Bounded Channels）
   *
   * @param subBis 次级别笔序列（构成中枢的构件）
   * @param macroBis 父级别笔序列（提供时空边界）
   */
  getAdjacentBoundedChannels(
    subBis: readonly ChanBi[],
    macroBis: readonly ChanBi[],
  ): ChanChannelTwoPhaseResult {
    const validMacroBis = macroBis.filter((b) => b.status === BiStatus.Valid);
    if (validMacroBis.length === 0 || subBis.length < 5) {
      return { phaseA: [], phaseB: [] };
    }

    const allPhaseA: ChanChannel[] = [];
    const allPhaseB: ChanChannel[] = [];

    const slices = partitionSubBisForMacroBis(validMacroBis, subBis);

    for (let sliceIdx = 0; sliceIdx < slices.length; sliceIdx++) {
      const slice = slices[sliceIdx];
      if (slice.length < 5) {
        continue;
      }

      const isLastSlice = sliceIdx === slices.length - 1;
      const sliceResult = this.createChannels(slice, {
        allowUncomplete: isLastSlice,
      });
      allPhaseA.push(...sliceResult.phaseA);
      allPhaseB.push(...sliceResult.phaseB);
    }

    return {
      phaseA: allPhaseA,
      phaseB: allPhaseB,
    };
  }

  /**
   * 主函数：识别笔级中枢（纯基于笔序列几何与状态机推进）
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

    // Phase B：直接采用状态机全生命周期自洽确认的中枢序列（彻底消除外层缝合补丁）
    const phaseB = sequential;

    return { phaseA, phaseB };
  }

  /**
   * 顺序确认扫描与生命周期状态机推进（委托至通用的 ChannelLifecycleEngineV2）
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
        return this.buildChannelFromBis(
          elements,
          original,
          startIndex,
          geometry,
          expanded || elements.length >= 9,
          isComplete,
        );
      },
    };

    return ChannelLifecycleEngineV2.runSequentialLifecycle(data, strategy);
  }

  /**
   * 从 N 笔构件序列和几何参数构建输出标准的 ChanChannel 对象
   */
  private buildChannelFromBis(
    bis: readonly ChanBi[],
    originalBis: readonly ChanBi[],
    startIndex: number,
    geometry: { zg: number; zd: number; gg: number; dd: number },
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

export { ChannelCalculator as ChannelCalculatorV2 };
