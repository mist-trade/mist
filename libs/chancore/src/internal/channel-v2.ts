/**
 * 缠论笔中枢计算引擎 V2（ChannelCalculatorV2）
 *
 * ======================================================================================
 * 核心架构与职责定位：
 * ======================================================================================
 * 1. 本模块是笔级走势中枢构建与生命周期状态机的核心门面（Facade）；
 * 2. 大道至简、第一性原理：
 *    - 彻底剔除任何跨级别物理时间戳依赖（无 90分钟/30分钟/时区等外部杂质）；
 *    - 纯基于次级别走势构件（ChanBi）的价格区间拓扑几何与有限状态机推进；
 * 3. 核心职责分工：
 *    - 笔级别数据校验与有效性过滤（BiStatus.Valid 闸门）；
 *    - 委托生命周期状态机完成 Phase A（初始基础中枢）与 Sequential（顺序生命周期确认中枢）；
 *    - Phase B 相邻同向且价格区间重叠中枢的吸收合并（方案 1：吸收为延伸）。
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
import { minMaxBy } from './min-max-by';

export class ChannelCalculatorV2 {
  /**
   * 主函数：识别笔级中枢（纯基于笔序列几何与 V2 状态机推进）
   *
   * 算法流程：
   * 1. 过滤有效笔：仅确认且有效的笔构成中枢（status === Valid，排除宽笔失败的 Invalid 单元）；
   * 2. 顺序生命周期确认：由 ChannelLifecycleEngineV2 执行滑动窗口核心识别、严格重叠延伸吸纳与规则 1～4 离开确认；
   * 3. 相邻同向延伸吸收合并：对 Phase B 产出的连续同向且 [ZD, ZG] 重叠的中枢执行吸收合并。
   *
   * @param data Phase B 笔序列
   * @param options.allowUncomplete 是否允许输出末端未完成中枢（默认为 true；若为 false，则为封闭历史走势切片，绝不产生 UnComplete）
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
    // 中枢内部延伸由 CentralStateMachineV2 内部第一性原理严格推进，禁止在外层打补丁缝合
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
          expanded,
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
   *
   * 缠论笔中枢构件公理：
   * - 走势类型为 a + A + b（进入笔 b0 + 内部构件 + 离开笔 b4）；
   * - 完整的完成中枢（Complete）至少由 5 笔构成（进入笔 + 3构件 + 离开笔），构件数必须 >= 5（且为奇数）；
   * - 序列末端未完成中枢（UnComplete）至少包含进入笔与初始核心构件（4 笔）；
   * - 价格重叠区间必须严格有效：zg > zd。
   *
   * 历史注记：V1 老代码中残留的 `>= 3` 系将段中枢（3段无进入笔）逻辑错带入笔中枢，V2 彻底纠正为 >= 5（末端未完成 >= 4）。
   */
  isCandidateChannelValid(channel: ChanChannel): boolean {
    const minLength = channel.type === ChannelType.UnComplete ? 4 : 5;
    return channel.bis.length >= minLength && channel.zg > channel.zd;
  }

  /**
   * 计算并验证 3 笔核心 (+ 进入笔 b0 = 4 笔) 的几何参数与进入笔约束
   *
   * 缠论标准定义：走势中枢由连续 3 个次级别走势类型（构件笔 b1, b2, b3）的重叠部分构成。
   * - 向上走势（b0 向上进入）：
   *   b0 (Up, low < zd), b1 (Down), b2 (Up), b3 (Down)
   *   zg = min(b0.high, b1.high, b2.high, b3.high)
   *   zd = max(b1.low, b2.low, b3.low)
   *   约束：zg > zd 且 b0.low < zd 且 dd >= b0.low
   * - 向下走势（b0 向下进入）：
   *   b0 (Down, high > zg), b1 (Up), b2 (Down), b3 (Up)
   *   zg = min(b1.high, b2.high, b3.high)
   *   zd = max(b0.low, b1.low, b2.low, b3.low)
   *   约束：zg > zd 且 b0.high > zg 且 gg <= b0.high
   *
   * @param fourBis 连续 4 笔序列 [b0, b1, b2, b3]
   * @returns 合法返回几何参数快照，不满足则返回 null
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
