import { PriceInterval } from './interval-inclusion';

/**
 * 顶极值判定：当前元素高点严格大于前后两侧高点
 */
export function isTopExtremum(
  prev: PriceInterval,
  now: PriceInterval,
  next: PriceInterval,
): boolean {
  return now.high > prev.high && now.high > next.high;
}

/**
 * 底极值判定：当前元素低点严格小于前后两侧低点
 */
export function isBottomExtremum(
  prev: PriceInterval,
  now: PriceInterval,
  next: PriceInterval,
): boolean {
  return now.low < prev.low && now.low < next.low;
}

/**
 * 基础顶分型判定（带低点有效性校验）：
 * 1. now.high > prev.high 且 now.high > next.high
 * 2. now.low > min(prev.low, next.low)
 */
export function isBasicTopFenxing(
  prev: PriceInterval,
  now: PriceInterval,
  next: PriceInterval,
): boolean {
  return (
    isTopExtremum(prev, now, next) && now.low > Math.min(prev.low, next.low)
  );
}

/**
 * 基础底分型判定（带高点有效性校验）：
 * 1. now.low < prev.low 且 now.low < next.low
 * 2. now.high < max(prev.high, next.high)
 */
export function isBasicBottomFenxing(
  prev: PriceInterval,
  now: PriceInterval,
  next: PriceInterval,
): boolean {
  return (
    isBottomExtremum(prev, now, next) &&
    now.high < Math.max(prev.high, next.high)
  );
}
