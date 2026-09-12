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
  ChannelLifecycleEngine,
  type ChannelLifecycleStrategy,
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

    // Phase B：直接采用顺序生命周期确认的段中枢序列
    const phaseB = sequential;
    return { phaseA, phaseB };
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
    const strategy: ChannelLifecycleStrategy<ChanDuan, ChanDuanChannel> = {
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

    return ChannelLifecycleEngine.runSequentialLifecycle(duans, strategy);
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
