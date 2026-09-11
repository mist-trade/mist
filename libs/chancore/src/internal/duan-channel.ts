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

import { minMaxBy } from './min-max-by';

/**
 * 段级中枢（Duan-level Channel）—— 以段为构成单元的中枢。缠论原典 17 课：
 * 中枢 = "至少三个连续次级别走势类型所重叠的部分"，是**无方向的区域**。
 *
 * 采用顺序确认生命周期状态机 + 假定离开突破确认机制：
 * - 顺序确认扫描：从左至右顺序寻找 3 段基础中枢（趋势交替 + 对称重叠 zg > zd）。
 * - 动态区间延伸：内部震荡段保持动态公共交集更新 [ZD, ZG]。
 * - 假定离开突破与 3买/3s 确认：出现顺势突破离开段后，后续 3买/3s 试探开启新结构，中枢确认闭合。
 * - 9 段结合扩展：持续震荡满 9 段时触发中枢扩展（expanded: true）并闭合。
 * - Phase C：相邻同级别独立中枢满足中心定理二时进行扩张归并。
 */
export class DuanChannelCalculator {
  createDuanChannels(
    duans: readonly ChanDuan[],
  ): ChanDuanChannelTwoPhaseResult {
    // 仅确认且有效的段构成中枢（status !== Valid 的未确认尾段不参与：
    // 18 课"次级别前三个走势类型都是完成的才构成中枢"；统一 status 判据，
    // 现时 status=Unknown ⇔ endBi===null；数据层 createDuan 输出不变）。
    const confirmed = duans.filter((d) => d.status === DuanStatus.Valid);
    const { phaseA, sequential } = this.sequentiallyConfirmChannels(confirmed);

    // Phase B：直接采用顺序生命周期确认的段中枢序列
    const phaseB = sequential;
    return { phaseA, phaseB };
  }

  /**
   * 顺序确认扫描与生命周期状态机推进
   */
  private sequentiallyConfirmChannels(duans: readonly ChanDuan[]): {
    phaseA: ChanDuanChannel[];
    sequential: ChanDuanChannel[];
  } {
    const phaseA: ChanDuanChannel[] = [];
    const sequential: ChanDuanChannel[] = [];
    const duanCount = duans.length;

    if (duanCount < 3) {
      return { phaseA, sequential };
    }

    let cursor = 0;
    while (cursor <= duanCount - 3) {
      const candidateWindow = duans.slice(cursor, cursor + 3);
      const baseChannel = this.detectChannel(candidateWindow, duans, cursor);

      if (!baseChannel) {
        cursor++;
        continue;
      }

      const stampedBase: ChanDuanChannel = {
        ...baseChannel,
        status: ChannelStatus.Valid,
      };
      phaseA.push(stampedBase);

      const channelDuans = [...candidateWindow];
      let curZg = baseChannel.zg;
      let curZd = baseChannel.zd;
      const allLows = candidateWindow.map((d) => d.low);
      const allHighs = candidateWindow.map((d) => d.high);
      let curGg = Math.max(...allHighs);
      let curDd = Math.min(...allLows);
      let isExpanded = false;

      const firstDuan = candidateWindow[0];
      const isUp = firstDuan.trend === TrendDirection.Up;

      let nextIdx = cursor + 3;
      while (nextIdx < duanCount) {
        const curr = duans[nextIdx];
        const isTrendDir =
          (isUp && curr.trend === TrendDirection.Up) ||
          (!isUp && curr.trend === TrendDirection.Down);
        const hasBrokenOut =
          isTrendDir && (isUp ? curr.high > curZg : curr.low < curZd);

        if (hasBrokenOut) {
          // 假定离开段顺势突破吸纳入中枢
          channelDuans.push(curr);
          curGg = Math.max(curGg, curr.high);
          curDd = Math.min(curDd, curr.low);
          nextIdx++;
          if (channelDuans.length >= 9) {
            isExpanded = true;
          }
          // 出现突破离开段，后续折返为 3买/3s 试探（作为新结构开启），中枢在此确认闭合
          break;
        }

        // curr 为内部震荡段，需与下一段配对 (curr, nextDuan) 检验延伸
        if (nextIdx + 1 < duanCount) {
          const nextDuan = duans[nextIdx + 1];
          const nextIsTrendDir =
            (isUp && nextDuan.trend === TrendDirection.Up) ||
            (!isUp && nextDuan.trend === TrendDirection.Down);
          const nextBrokenOut =
            nextIsTrendDir &&
            (isUp ? nextDuan.high > curZg : nextDuan.low < curZd);

          if (nextBrokenOut) {
            // curr 为内部回拉段，nextDuan 为顺势突破离开段
            channelDuans.push(curr, nextDuan);
            // 内部段动态更新中枢区间
            curZg = Math.min(curZg, curr.high);
            curZd = Math.max(curZd, curr.low);
            curGg = Math.max(curGg, curr.high, nextDuan.high);
            curDd = Math.min(curDd, curr.low, nextDuan.low);
            nextIdx += 2;
            if (channelDuans.length >= 9) {
              isExpanded = true;
            }
            break;
          }

          // 两段均为内部震荡：检验动态公共交集
          const testWindow = [...channelDuans, curr, nextDuan];
          const allHighMinMax = minMaxBy(testWindow, (d) => d.high);
          const allLowMinMax = minMaxBy(testWindow, (d) => d.low);

          if (
            allHighMinMax &&
            allLowMinMax &&
            allHighMinMax.min > allLowMinMax.max
          ) {
            channelDuans.push(curr, nextDuan);
            curZg = allHighMinMax.min;
            curZd = allLowMinMax.max;
            curGg = allHighMinMax.max;
            curDd = allLowMinMax.min;
            nextIdx += 2;

            if (channelDuans.length >= 9) {
              isExpanded = true;
            }
            continue;
          } else {
            break;
          }
        } else {
          // 处理末尾仅剩的单段（数据序列最后一段）
          if (curr.high >= curZd && curr.low <= curZg) {
            const newZg = Math.min(curZg, curr.high);
            const newZd = Math.max(curZd, curr.low);
            if (newZg > newZd) {
              channelDuans.push(curr);
              curZg = newZg;
              curZd = newZd;
              curGg = Math.max(curGg, curr.high);
              curDd = Math.min(curDd, curr.low);
              nextIdx++;
              if (channelDuans.length >= 9) {
                isExpanded = true;
              }
            }
          }
          break;
        }
      }

      const sealedChannel = this.buildChannelFromDuans(
        channelDuans,
        duans,
        cursor,
        { zg: curZg, zd: curZd, gg: curGg, dd: curDd },
        isExpanded,
      );
      sequential.push(sealedChannel);

      // 指针后移至离开段（末段），使离开段作为下一个走势结构的起点
      cursor = cursor + channelDuans.length - 1;
    }

    return { phaseA, sequential };
  }

  /** 检测 3 段基础段级中枢（趋势交替 + 对称重叠有效）。 */
  private detectChannel(
    threeDuans: readonly ChanDuan[],
    originalDuans: readonly ChanDuan[],
    startIndex: number,
  ): ChanDuanChannel | null {
    if (threeDuans.length < 3) {
      return null;
    }

    if (!this.validateTrendAlternating(threeDuans)) {
      return null;
    }

    const geometry = this.validateChannelGeometry(threeDuans);
    if (!geometry) {
      return null;
    }
    const { zg, zd, gg, dd } = geometry;

    const firstDuan = originalDuans[startIndex];
    const lastDuan = originalDuans[startIndex + 2];
    const firstMiddleIndex = Math.floor(firstDuan.originIds.length / 2);
    const displayStartId = firstDuan.originIds[firstMiddleIndex];
    const lastMiddleIndex = Math.floor(lastDuan.originIds.length / 2);
    const displayEndId = lastDuan.originIds[lastMiddleIndex];

    return {
      duans: [...threeDuans],
      zg,
      zd,
      gg,
      dd,
      level: ChannelLevel.Duan,
      type: ChannelType.Complete,
      status: ChannelStatus.Valid,
      expanded: false,
      startId: firstDuan.originIds[0],
      endId: lastDuan.originIds[lastDuan.originIds.length - 1],
      displayStartId,
      displayEndId,
    };
  }

  /**
   * 对称重叠几何（无方向）：对构成段（N ≥ 3），
   * zg = min(段高点)、zd = max(段低点)、gg = max(段高点)、dd = min(段低点)。
   * 有效条件：N ≥ 3 且 zg > zd（存在重叠区间）。无首末段突破约束、无进入/离开方向
   * （原典：中枢 = "至少三个连续次级别走势类型所重叠的部分"，是区域本身）。
   */
  private validateChannelGeometry(duans: readonly ChanDuan[]): {
    zg: number;
    zd: number;
    gg: number;
    dd: number;
  } | null {
    if (duans.length < 3) {
      return null;
    }
    const highMinMax = minMaxBy(duans, (d) => d.high);
    const lowMinMax = minMaxBy(duans, (d) => d.low);
    if (!highMinMax || !lowMinMax) {
      return null;
    }
    const zg = highMinMax.min;
    const gg = highMinMax.max;
    const zd = lowMinMax.max;
    const dd = lowMinMax.min;
    if (zg <= zd) {
      return null;
    }
    return { zg, zd, gg, dd };
  }

  isCandidateChannelValid(channel: ChanDuanChannel): boolean {
    return channel.duans.length >= 3 && channel.zg > channel.zd;
  }

  private validateTrendAlternating(duans: readonly ChanDuan[]): boolean {
    for (let i = 0; i < duans.length - 1; i++) {
      if (duans[i].trend === duans[i + 1].trend) {
        return false;
      }
    }
    return true;
  }

  /** 从 N 段序列和几何参数构建 ChanDuanChannel。 */
  private buildChannelFromDuans(
    duans: readonly ChanDuan[],
    originalDuans: readonly ChanDuan[],
    startIndex: number,
    geometry: { zg: number; zd: number; gg: number; dd: number },
    expanded = false,
  ): ChanDuanChannel {
    const endIndex = startIndex + duans.length - 1;
    const firstDuan = originalDuans[startIndex];
    const firstMiddleIndex = Math.floor(firstDuan.originIds.length / 2);
    const displayStartId = firstDuan.originIds[firstMiddleIndex];

    const lastDuan = originalDuans[endIndex];
    const lastMiddleIndex = Math.floor(lastDuan.originIds.length / 2);
    const displayEndId = lastDuan.originIds[lastMiddleIndex];

    return {
      duans: [...duans],
      zg: geometry.zg,
      zd: geometry.zd,
      gg: geometry.gg,
      dd: geometry.dd,
      level: ChannelLevel.Duan,
      type: ChannelType.Complete,
      status: ChannelStatus.Valid,
      expanded,
      startId: firstDuan.originIds[0],
      endId: lastDuan.originIds[lastDuan.originIds.length - 1],
      displayStartId,
      displayEndId,
    };
  }
}
