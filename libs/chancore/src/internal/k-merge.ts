import { TrendDirection } from '../contracts';
import type { ChanK, ChanMergedK } from '../contracts';
import { TrendCalculator } from './trend';

import { mergePriceInterval } from './interval-inclusion';

type MutableMergedK = {
  startTime: Date;
  endTime: Date;
  high: number;
  low: number;
  trend: TrendDirection;
  mergedCount: number;
  mergedIds: number[];
  mergedData: ChanK[];
};

export class KMergeCalculator {
  constructor(private readonly trend = new TrendCalculator()) {}

  // 处理包含关系：复用通用包含合并算子
  private handleContainedState(
    current: ChanMergedK,
    next: ChanK,
    trend: TrendDirection,
  ): { merged: boolean; newHigh: number; newLow: number } {
    return mergePriceInterval(current, next, trend);
  }

  // 合并k线
  merge(data: readonly ChanK[]): ChanMergedK[] {
    if (data.length === 0) {
      return [];
    }
    let currentTrend = TrendDirection.None;
    // 基准K线
    let baseData: MutableMergedK = {
      startTime: data[0].time,
      endTime: data[0].time,
      high: data[0].high,
      low: data[0].low,
      trend: currentTrend,
      mergedCount: 1,
      mergedIds: [data[0].id],
      mergedData: [data[0]],
    };
    const mergedKs: ChanMergedK[] = [baseData];
    for (let i = 1; i < data.length; i++) {
      const now = data[i];
      // 使用上一个合并K线来判断趋势
      const lastMergedK = mergedKs[mergedKs.length - 1];

      const lastMergedRange: Pick<ChanK, 'high' | 'low'> = {
        high: lastMergedK.high,
        low: lastMergedK.low,
      };

      currentTrend = this.trend.judgeSimpleTrend(
        lastMergedRange,
        now,
        currentTrend,
      );

      const containedState = this.handleContainedState(
        lastMergedK,
        now,
        currentTrend,
      );

      // 这里说明有包含关系，按照k线进行合并
      if (containedState.merged) {
        // 先处理baseData
        baseData.endTime = now.time;
        baseData.high = containedState.newHigh;
        baseData.low = containedState.newLow;
        baseData.mergedCount += 1;
        baseData.trend = currentTrend;
        baseData.mergedIds.push(now.id);
        baseData.mergedData.push(now);
        // 然后替换上一条k线
        mergedKs[mergedKs.length - 1] = { ...baseData };
      } else {
        const newBaseData: MutableMergedK = {
          startTime: now.time,
          endTime: now.time,
          high: now.high,
          low: now.low,
          trend: currentTrend,
          mergedCount: 1,
          mergedIds: [now.id],
          mergedData: [now],
        };
        baseData = newBaseData;
        mergedKs.push({ ...newBaseData });
      }
    }
    return mergedKs;
  }
}
