import { TrendDirection } from '../contracts';
import type { ChanBi } from '../contracts';

/**
 * 提取北京时间（UTC+8）的年、月、日、时、分、秒分量
 */
export function getShanghaiDateComponents(d: Date): {
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
export function isDateOnlyTimestamp(d: Date): boolean {
  const comp = getShanghaiDateComponents(d);
  return comp.hours === 0 && comp.minutes === 0 && comp.seconds === 0;
}

/**
 * 获取该时间戳在物理时间上对应的开盘时刻/起始时刻（毫秒）
 */
export function getBarStartTimeMs(d: Date): number {
  return d.getTime();
}

/**
 * 获取该时间戳在物理时间上对应的闭市时刻/结束时刻（毫秒）
 * 若为日线/周线等日期型时间戳（00:00:00），其代表的是该交易日全天，闭市时刻为当天 23:59:59.999
 */
export function getBarEndTimeMs(d: Date): number {
  const ms = d.getTime();
  if (isDateOnlyTimestamp(d)) {
    return ms + 24 * 3600 * 1000 - 1;
  }
  return ms;
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
export function partitionSubBisForMacroBis(
  macroBis: readonly ChanBi[],
  subBis: readonly ChanBi[],
): (readonly ChanBi[])[] {
  if (macroBis.length === 0 || subBis.length === 0) return [];

  const findVertexIndex = (
    vertexTime: Date,
    targetPrice: number,
    isHigh: boolean,
    expectedTrend: TrendDirection,
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
    let bestTrendMatch = false;

    for (let i = searchStartIdx; i < subBis.length; i++) {
      const sb = subBis[i];
      const sMs = sb.startTime.getTime();
      const eMs = sb.endTime.getTime();

      if (eMs >= winStart && sMs <= winEnd) {
        const p = isHigh ? sb.high : sb.low;
        const pDiff = Math.abs(p - targetPrice);
        const tDiff = Math.abs(eMs - vertexTime.getTime());
        const trendMatch = sb.trend === expectedTrend;

        // 候选优劣判断：
        // 1. 价格更接近 targetPrice（误差严格小于 bestPDiff - 1e-4）
        // 2. 价格在 1e-4 误差内并列时：
        //    2.1 顺势趋势匹配（如向上大笔起止为向上小笔，向下大笔起止为向下小笔）优先
        //    2.2 趋势匹配相同时，时间距拐点更近者优先
        const isBetter =
          pDiff < bestPDiff - 1e-4 ||
          (Math.abs(pDiff - bestPDiff) <= 1e-4 &&
            ((!bestTrendMatch && trendMatch) ||
              (bestTrendMatch === trendMatch && tDiff < bestTimeDiff)));

        if (isBetter) {
          bestTrendMatch = trendMatch;
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
    firstM.trend,
    0,
  );

  for (let m = 0; m < macroBis.length; m++) {
    const mb = macroBis[m];
    const isUp = mb.trend === TrendDirection.Up;
    const endVertexIdx = findVertexIndex(
      mb.endTime,
      isUp ? mb.high : mb.low,
      isUp,
      mb.trend,
      currentStartIdx,
    );

    const sliceEnd = Math.max(currentStartIdx, endVertexIdx);
    const slice = subBis.slice(currentStartIdx, sliceEnd + 1);
    slices.push(slice);
    currentStartIdx = sliceEnd;
  }

  return slices;
}
