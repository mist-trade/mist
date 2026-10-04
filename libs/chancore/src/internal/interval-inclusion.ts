import { TrendDirection } from '../contracts';

/**
 * 价格区间接口（K线、合并K线、笔、特征元素等具有高低价的几何对象均满足此接口）
 */
export interface PriceInterval {
  readonly high: number;
  readonly low: number;
}

/**
 * 包含关系检查结果
 */
export interface IntervalInclusionResult {
  readonly hasInclusion: boolean;
  readonly aContainsB: boolean;
  readonly bContainsA: boolean;
}

/**
 * 检查两个价格区间是否存在包含关系（缠论第65课）
 */
export function checkIntervalInclusion(
  a: PriceInterval,
  b: PriceInterval,
): IntervalInclusionResult {
  const aContainsB = a.high >= b.high && a.low <= b.low;
  const bContainsA = b.high >= a.high && b.low <= a.low;
  return {
    hasInclusion: aContainsB || bContainsA,
    aContainsB,
    bContainsA,
  };
}

/**
 * 确定有效的趋势方向：若当前趋势为 None，依据两区间中心点相对高低确立方向
 */
export function resolveEffectiveTrend(
  current: PriceInterval,
  next: PriceInterval,
  trend: TrendDirection,
): TrendDirection {
  if (trend !== TrendDirection.None) {
    return trend;
  }
  const currentMiddle = (current.high + current.low) / 2;
  const nextMiddle = (next.high + next.low) / 2;

  if (nextMiddle < currentMiddle) {
    return TrendDirection.Down;
  }
  if (nextMiddle > currentMiddle) {
    return TrendDirection.Up;
  }
  return TrendDirection.None;
}

/**
 * 价格区间包含合并结果
 */
export interface MergePriceIntervalResult {
  readonly merged: boolean;
  readonly newHigh: number;
  readonly newLow: number;
}

/**
 * 统一价格区间包含合并纯算子（缠论第65课结合律 + 第67课标准特征序列）
 *
 * - 向上趋势/序列：取高高（max(high), max(low)）
 * - 向下趋势/序列：取低低（min(high), min(low)）
 *
 * @param current 当前区间
 * @param next 下一个区间
 * @param trend 趋势方向（若为 None，按中心点判定）
 */
export function mergePriceInterval(
  current: PriceInterval,
  next: PriceInterval,
  trend: TrendDirection,
): MergePriceIntervalResult {
  const { hasInclusion } = checkIntervalInclusion(current, next);
  if (!hasInclusion) {
    return { merged: false, newHigh: 0, newLow: 0 };
  }

  const actualTrend = resolveEffectiveTrend(current, next, trend);
  if (actualTrend === TrendDirection.None) {
    return { merged: false, newHigh: 0, newLow: 0 };
  }

  if (actualTrend === TrendDirection.Up) {
    return {
      merged: true,
      newHigh: Math.max(current.high, next.high),
      newLow: Math.max(current.low, next.low),
    };
  }

  return {
    merged: true,
    newHigh: Math.min(current.high, next.high),
    newLow: Math.min(current.low, next.low),
  };
}

/**
 * 特征序列物理缺口检测算子（严格遵循缠论第 67 课基准）
 *
 * 缠论第 67 课：“所谓特征序列的缺口，就是相邻两个特征序列元素之间没有任何重合的区间，
 * 这和 K 线分型中缺口的定义是一模一样的，只是把 K 线换成了特征序列的元素。”
 *
 * 特征序列元素本身即为笔，区间为 [low, high]。若两笔价格区间无交集，则存在缺口；若有重合，则无缺口。
 *
 * @param firstBi 起始笔/特征元素
 * @param secondBi 目标笔/特征元素
 */
export function hasTruePhysicalGap(
  firstBi: { readonly high: number; readonly low: number },
  secondBi: { readonly high: number; readonly low: number },
): boolean {
  // 基础特征序列笔区间无重合，天然是缺口 (第 67 课基准)
  return firstBi.high < secondBi.low || secondBi.high < firstBi.low;
}
