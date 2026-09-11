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

import { minMaxBy } from './min-max-by';

export class ChannelCalculator {
  /**
   * 主函数：识别笔级中枢（顺序确认生命周期状态机 + 缠论第 20 课中心定理二扩张归并）
   *
   * 算法流程：
   * 1. 顺序确认扫描：从左至右顺序寻找 5 笔基础中枢，确立 [ZD, ZG]；
   * 2. 缠论第 20 课触及延伸：后续笔对触及 [ZD, ZG] 且保持公共交集有效则并入延伸；
   * 3. 第三类买卖点终结：离开且回抽不回中枢区间时立即密封（Seal）闭合当前中枢；
   * 4. 9 笔结合扩展：持续震荡满 9 笔时触发中枢扩展（expanded: true）并闭合；
   * 5. Phase C：相邻同级别独立中枢满足中心定理二时进行扩张归并（Pairwise Expansion）。
   *
   * @param data Phase B 笔序列
   * @returns 两阶段中枢结果 { phaseA, phaseB }
   */
  createChannels(data: readonly ChanBi[]): ChanChannelTwoPhaseResult {
    // 仅确认且有效的笔构成中枢（status !== Valid 的 Invalid/Unknown 单元不参与：
    // 18 课"次级别前三个走势类型都是完成的才构成中枢"；统一 status 判据，
    // 数据层 createBi 输出不变）。
    const confirmed = data.filter((b) => b.status === BiStatus.Valid);

    const { phaseA, sequential } = this.sequentiallyConfirmChannels(confirmed);

    // Phase B：直接采用顺序生命周期确认的中枢序列（保留独立性，避免贪婪级联吞并）
    const phaseB = sequential;

    return { phaseA, phaseB };
  }

  /**
   * 跨级别邻近笔约束中枢求值（Adjacent Timeframe Pair Bounded Central）
   *
   * 算法契约：
   * 1. 过滤出已确认且有效的父级别大笔序列（macroBis）；
   * 2. 依据大级别起止分型窗口（顶/底分型时段），在次级别中精确锚定大级别极值发生时的起止笔：
   *    - 向上大笔：在起点分型时段找次级别最低点（低点向上笔），在终点分型时段找次级别最高点（高点向上笔）；
   *    - 向下大笔：在起点分型时段找次级别最高点（高点向下笔），在终点分型时段找次级别最低点（低点向下笔）；
   *    消除周期离散化（如 30m 封盘与 5m 极值相差 5~25 分钟）带来的边缘次级别笔被误伤切除问题；
   * 3. 在每个切片内部独立运行状态机求值中枢，保证次级别中枢的生长与闭合完全封闭于大笔内；
   * 4. 汇总各切片结果，按时序输出。
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

    const slices = this.partitionSubBisForMacroBis(validMacroBis, subBis);

    for (const slice of slices) {
      if (slice.length < 5) {
        continue;
      }

      const sliceResult = this.createChannels(slice);
      allPhaseA.push(...sliceResult.phaseA);
      allPhaseB.push(...sliceResult.phaseB);
    }

    return {
      phaseA: allPhaseA,
      phaseB: allPhaseB,
    };
  }

  /**
   * 基于宏观拐点首尾相接拓扑对齐，将次级别笔序列无缝划分（Partition）给各宏观大笔
   *
   * 算法契约：
   * 1. 首尾相接无缝切片：大笔是连续折线链条 M0 -> M1 -> M2 ...，相邻宏观笔在拐点处首尾相接；
   * 2. 拐点极值对齐：每个宏观拐点（分型极值）在次级别小笔中唯一对应一个极值拐点笔索引；
   * 3. 杜绝时间窗口渗透：彻底抛弃 72 小时等跨多日的大窗口，按宏观 K 线分型窗口精准锚定，单调推进；
   * 4. 消除包不住与包多了：切片覆盖整个序列（不漏包），且每个切片封闭于宏观大笔（不越界、不重复）。
   */
  private partitionSubBisForMacroBis(
    macroBis: readonly ChanBi[],
    subBis: readonly ChanBi[],
  ): (readonly ChanBi[])[] {
    if (macroBis.length === 0 || subBis.length === 0) return [];

    const findVertexIndex = (
      vertexTime: Date,
      targetPrice: number,
      isHigh: boolean,
      searchStartIdx: number,
    ): number => {
      const isDaily = isDateOnlyTimestamp(vertexTime);
      let winStart: number;
      let winEnd: number;

      if (isDaily) {
        winStart = getBarStartTimeMs(vertexTime) - 4 * 3600 * 1000;
        winEnd = getBarEndTimeMs(vertexTime) + 4 * 3600 * 1000;
      } else {
        const vMs = vertexTime.getTime();
        // 分时级别：90 分钟（即 3 根 30m K 线分型窗口）足以覆盖 5m 极值笔时间偏移
        winStart = vMs - 90 * 60 * 1000;
        winEnd = vMs + 90 * 60 * 1000;
      }

      let bestIdx = searchStartIdx;
      let bestPDiff = Infinity;
      let bestTimeDiff = Infinity;

      for (let i = searchStartIdx; i < subBis.length; i++) {
        const sb = subBis[i];
        const sMs = sb.startTime.getTime();
        const eMs = sb.endTime.getTime();

        if (eMs >= winStart && sMs <= winEnd) {
          const p = isHigh ? sb.high : sb.low;
          const pDiff = Math.abs(p - targetPrice);
          const tDiff = Math.abs(eMs - vertexTime.getTime());

          if (
            pDiff < bestPDiff - 1e-4 ||
            (Math.abs(pDiff - bestPDiff) <= 1e-4 && tDiff < bestTimeDiff)
          ) {
            bestPDiff = pDiff;
            bestTimeDiff = tDiff;
            bestIdx = i;
          }
        } else if (sMs > winEnd && bestPDiff < Infinity) {
          break;
        }
      }

      if (bestPDiff === Infinity) {
        let minT = Infinity;
        for (let i = searchStartIdx; i < subBis.length; i++) {
          const diff = Math.abs(
            subBis[i].endTime.getTime() - vertexTime.getTime(),
          );
          if (diff < minT) {
            minT = diff;
            bestIdx = i;
          }
        }
      }

      return bestIdx;
    };

    const slices: (readonly ChanBi[])[] = [];
    let currentStartIdx = 0;

    const firstM = macroBis[0];
    const firstIsUp = firstM.trend === TrendDirection.Up;
    currentStartIdx = findVertexIndex(
      firstM.startTime,
      firstIsUp ? firstM.low : firstM.high,
      !firstIsUp,
      0,
    );

    for (let m = 0; m < macroBis.length; m++) {
      const mb = macroBis[m];
      const isUp = mb.trend === TrendDirection.Up;
      const endVertexIdx = findVertexIndex(
        mb.endTime,
        isUp ? mb.high : mb.low,
        isUp,
        currentStartIdx,
      );

      const sliceEnd = Math.max(currentStartIdx, endVertexIdx);
      const slice = subBis.slice(currentStartIdx, sliceEnd + 1);
      slices.push(slice);
      currentStartIdx = sliceEnd;
    }

    return slices;
  }

  /**
   * 顺序确认扫描与生命周期状态机推进
   *
   * 算法契约（3 笔核心 + 触及延伸 + 顺势离开，最终确认严格执行 >= 5 笔门槛）：
   * 1. 核心确立：以 3 笔构件 (+ 进入笔 b0 = 4 笔) 确立基础中枢核心 [ZD, ZG]；
   * 2. 状态机推进：
   *    - 顺势突破（离开笔）：若出现顺势突破中枢区间 (isUp: high > curZg, !isUp: low < curZd)，
   *      作为离开笔吸纳；若后续无回抽维持重叠则密封终结；
   *    - 触及延伸（内部震荡）：若未突破，则需成对 (curr, nextBi) 检验极值守卫与公共重叠交集；
   * 3. 最终门槛：中枢必须满足 channelBis.length >= 5 且满足极值结构守卫等条件才可确认为完成中枢；
   * 4. 9 笔结合扩展：持续震荡满 9 笔时触发中枢扩展（expanded: true）并闭合。
   */
  private sequentiallyConfirmChannels(data: readonly ChanBi[]): {
    phaseA: ChanChannel[];
    sequential: ChanChannel[];
  } {
    const phaseA: ChanChannel[] = [];
    const sequential: ChanChannel[] = [];
    const biCount = data.length;

    if (biCount < 5) {
      return { phaseA, sequential };
    }

    let cursor = 0;
    while (cursor <= biCount - 5) {
      // 1. 尝试从 cursor 开始确立 3 笔构件 (+ 进入笔 b0 = 4 笔) 的中枢核心
      const candidateCore = data.slice(cursor, cursor + 4);
      if (!this.validateTrendAlternating(candidateCore)) {
        cursor++;
        continue;
      }

      const coreGeometry = this.validateCoreGeometry(candidateCore);
      if (!coreGeometry) {
        cursor++;
        continue;
      }

      const firstBi = candidateCore[0];
      const isUp = firstBi.trend === TrendDirection.Up;

      // 核心确立，进入生命周期延伸与顺势离开状态机
      const channelBis = [...candidateCore];
      let curZg = coreGeometry.zg;
      let curZd = coreGeometry.zd;
      let curGg = Math.max(firstBi.high, coreGeometry.gg);
      let curDd = Math.min(firstBi.low, coreGeometry.dd);
      let isExpanded = false;

      let nextIdx = cursor + 4;
      while (nextIdx < biCount) {
        // 当 channelBis.length 为偶数时（4, 6, 8...），nextIdx 处的笔与进入笔 firstBi 同向
        if (channelBis.length % 2 === 0) {
          const curr = data[nextIdx];
          if (curr.trend === data[nextIdx - 1].trend) {
            break;
          }

          // 极值破坏守卫：顺势笔不得跌破向上起点 DD 或冲破向下起点 GG
          if (isUp && curr.low < curDd) {
            break;
          }
          if (!isUp && curr.high > curGg) {
            break;
          }

          const hasBrokenOut = isUp ? curr.high > curZg : curr.low < curZd;

          if (hasBrokenOut) {
            // 假定离开笔顺势突破吸纳入中枢
            channelBis.push(curr);
            curGg = Math.max(curGg, curr.high);
            curDd = Math.min(curDd, curr.low);
            nextIdx++;
            if (channelBis.length >= 9) {
              isExpanded = true;
            }
            // 出现突破离开笔，后续折返为 3买/3s 试探（作为新结构开启），中枢在此确认闭合
            break;
          }

          // 未突破中枢区间：此笔为中枢内部震荡笔（延伸半环）
          // 需与下一笔配对 (curr, nextBi) 作为延伸环检验
          if (nextIdx + 1 >= biCount) {
            // 序列末尾单笔：若触及重叠区间且有效则吸纳
            if (curr.high >= curZd && curr.low <= curZg) {
              const newZg = Math.min(curZg, curr.high);
              const newZd = Math.max(curZd, curr.low);
              if (newZg > newZd) {
                channelBis.push(curr);
                curZg = newZg;
                curZd = newZd;
                curGg = Math.max(curGg, curr.high);
                curDd = Math.min(curDd, curr.low);
                nextIdx++;
                if (channelBis.length >= 9) {
                  isExpanded = true;
                }
              }
            }
            break;
          }

          const nextBi = data[nextIdx + 1];
          if (nextBi.trend === curr.trend) {
            break;
          }

          // 极值守卫
          if (isUp && (curr.low < curDd || nextBi.low < curDd)) {
            break;
          }
          if (!isUp && (curr.high > curGg || nextBi.high > curGg)) {
            break;
          }

          const testWindow = [...channelBis, curr, nextBi];
          const allHighMinMax = minMaxBy(testWindow, (b) => b.high);
          const allLowMinMax = minMaxBy(testWindow, (b) => b.low);

          if (
            allHighMinMax &&
            allLowMinMax &&
            allHighMinMax.min > allLowMinMax.max
          ) {
            channelBis.push(curr, nextBi);
            curZg = allHighMinMax.min;
            curZd = allLowMinMax.max;
            curGg = Math.max(curGg, curr.high, nextBi.high);
            curDd = Math.min(curDd, curr.low, nextBi.low);
            nextIdx += 2;
            if (channelBis.length >= 9) {
              isExpanded = true;
            }
            continue;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // 末尾单笔保底检查（当 channelBis 停在倒数第1笔且已达成延伸）
      if (nextIdx === biCount - 1) {
        const single = data[nextIdx];
        if (
          single.trend !== data[nextIdx - 1].trend &&
          single.high >= curZd &&
          single.low <= curZg
        ) {
          const newZg = Math.min(curZg, single.high);
          const newZd = Math.max(curZd, single.low);
          if (newZg > newZd) {
            channelBis.push(single);
            curZg = newZg;
            curZd = newZd;
            curGg = Math.max(curGg, single.high);
            curDd = Math.min(curDd, single.low);
            nextIdx++;
            if (channelBis.length >= 9) {
              isExpanded = true;
            }
          }
        }
      }

      // 硬性门槛：最终确认中枢必须大于等于 5 笔且满足其他条件
      if (channelBis.length < 5) {
        cursor++;
        continue;
      }

      // Phase A 记录前 5 笔基础中枢
      const baseFive = channelBis.slice(0, 5);
      const baseChannel = this.buildChannelFromBis(
        baseFive,
        data,
        cursor,
        { zg: coreGeometry.zg, zd: coreGeometry.zd, gg: curGg, dd: curDd },
        false,
      );
      phaseA.push(baseChannel);

      // Phase B 记录已密封的最终确认中枢
      const sealedChannel = this.buildChannelFromBis(
        channelBis,
        data,
        cursor,
        { zg: curZg, zd: curZd, gg: curGg, dd: curDd },
        isExpanded,
      );
      sequential.push(sealedChannel);

      // 指针后移至当前中枢的离开笔（尾笔），使离开笔作为下一个中枢的进入笔参与计算
      cursor = cursor + channelBis.length - 1;
    }

    return { phaseA, sequential };
  }

  /**
   * 从 N 笔序列和已算好的几何参数构建中枢对象。
   */
  private buildChannelFromBis(
    bis: readonly ChanBi[],
    originalBis: readonly ChanBi[],
    startIndex: number,
    geometry: { zg: number; zd: number; gg: number; dd: number },
    expanded = false,
  ): ChanChannel {
    const endIndex = startIndex + bis.length - 1;
    const firstBi = originalBis[startIndex];
    const firstBiMiddleIndex = Math.floor(firstBi.originIds.length / 2);
    const displayStartId = firstBi.originIds[firstBiMiddleIndex];

    const lastBi = originalBis[endIndex];
    const lastBiMiddleIndex = Math.floor(lastBi.originIds.length / 2);
    const displayEndId = lastBi.originIds[lastBiMiddleIndex];

    return {
      bis: [...bis],
      zg: geometry.zg,
      zd: geometry.zd,
      gg: geometry.gg,
      dd: geometry.dd,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      status: ChannelStatus.Valid,
      startId: originalBis[startIndex].originIds[0],
      endId: lastBi.originIds[lastBi.originIds.length - 1],
      trend: bis[0].trend,
      expanded,
      displayStartId,
      displayEndId,
    };
  }

  /**
   * 验证候选中枢是否有效（标准缠论定义）。
   */
  isCandidateChannelValid(channel: ChanChannel): boolean {
    return channel.bis.length >= 3 && channel.zg > channel.zd;
  }

  /**
   * 计算并验证 3 笔核心 (+ 进入笔 b0 = 4 笔) 的几何参数（zg/zd/gg/dd）与进入笔约束。
   *
   * 缠论标准定义：走势中枢由连续 3 个次级别走势类型（构件笔 b1, b2, b3）的重叠部分构成。
   * - 向上走势（b0 向上进入）：
   *   b0 (Up, low < zd), b1 (Down), b2 (Up), b3 (Down)
   *   zg = min(b0.high, b2.high)
   *   zd = max(b1.low, b3.low)
   *   gg = max(b0.high, b2.high)
   *   dd = min(b1.low, b3.low)
   *   约束：zg > zd 且 b0.low < zd
   * - 向下走势（b0 向下进入）：
   *   b0 (Down, high > zg), b1 (Up), b2 (Down), b3 (Up)
   *   zg = min(b1.high, b3.high)
   *   zd = max(b0.low, b2.low)
   *   gg = max(b1.high, b3.high)
   *   dd = min(b0.low, b2.low)
   *   约束：zg > zd 且 b0.high > zg
   *
   * @param fourBis 4 笔序列 [b0, b1, b2, b3]（已保证趋势交替）
   * @returns 合法时返回几何参数，否则返回 null
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

    // 约束1：zg > zd（中枢核心必须存在有效重叠区间）
    if (zg <= zd) {
      return null;
    }

    // 约束2：进入笔外部端点必须在中枢 [ZD, ZG] 之外（即进入笔确实从外部进入）
    if (isUp) {
      if (firstBi.low >= zd) {
        return null;
      }
    } else {
      if (firstBi.high <= zg) {
        return null;
      }
    }

    return { zg, zd, gg, dd };
  }

  /**
   * 验证笔的趋势是否交替
   */
  private validateTrendAlternating(bis: readonly ChanBi[]): boolean {
    for (let i = 0; i < bis.length - 1; i++) {
      if (bis[i].trend === bis[i + 1].trend) {
        return false;
      }
    }
    return true;
  }
}

/**
 * 提取北京时间（UTC+8）的年、月、日、时、分、秒分量
 */
function getShanghaiDateComponents(d: Date): {
  year: number;
  month: number;
  date: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const ms = d.getTime();
  const shanghaiMs = ms + 8 * 3600 * 1000;
  const sDate = new Date(shanghaiMs);
  return {
    year: sDate.getUTCFullYear(),
    month: sDate.getUTCMonth(),
    date: sDate.getUTCDate(),
    hours: sDate.getUTCHours(),
    minutes: sDate.getUTCMinutes(),
    seconds: sDate.getUTCSeconds(),
  };
}

/**
 * 判断是否为日期型时间戳（即北京时间下的时、分、秒均为 0，如日线、周线、月线）
 */
function isDateOnlyTimestamp(d: Date): boolean {
  const comp = getShanghaiDateComponents(d);
  return comp.hours === 0 && comp.minutes === 0 && comp.seconds === 0;
}

/**
 * 获取该时间戳在物理时间上对应的开盘时刻/起始时刻（毫秒）
 */
function getBarStartTimeMs(d: Date): number {
  return d.getTime();
}

/**
 * 获取该时间戳在物理时间上对应的闭市时刻/结束时刻（毫秒）
 * 若为日线/周线等日期型时间戳（00:00:00），其代表的是该交易日全天，闭市时刻为当天 23:59:59.999
 */
function getBarEndTimeMs(d: Date): number {
  const ms = d.getTime();
  if (isDateOnlyTimestamp(d)) {
    return ms + 24 * 3600 * 1000 - 1;
  }
  return ms;
}
