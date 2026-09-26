import { ChanCore, FenxingType, type ChanK } from '@app/chancore';

/**
 * 确认成立的分型事件数据
 */
export interface ConfirmedFenxingResult {
  readonly type: FenxingType.Top | FenxingType.Bottom;
  /** 分型极值价格（底分型最低价 / 顶分型最高价） */
  readonly extremumPrice: number;
  /** 分型极值点对应的时间戳（中间 K 线的时间） */
  readonly extremumTime: Date;
  /** 确认该分型的时刻（右侧第 3 根 K 线的结束时间） */
  readonly confirmedTime: Date;
  /** 建议止损参考价位（底分型最低价 / 顶分型最高价） */
  readonly stopLossPrice: number;
  /** 中间极值 K 线合并包含的原始 K 线数量 */
  readonly mergedCount: number;
}

/**
 * 委托 @app/chancore 原生 findFenxings 实现的最新 K 线分型边缘确立检测器。
 * 直接复用 chancore 权威的包含合并与交替分型算法，杜绝重复实现。
 *
 * @param orderedK 按时间升序排列的原始 K 线切片
 * @returns 确立的分型结果，若当根未确立任何新分型则返回 null
 */
export function detectLatestConfirmedFenxing(
  orderedK: readonly ChanK[],
): ConfirmedFenxingResult | null {
  if (!orderedK || orderedK.length < 3) {
    return null;
  }

  // 1. 直接复用 chancore 权威的原生分型识别（包含合并 + 交错序列）
  const fenxings = ChanCore.findFenxings(orderedK);
  if (!fenxings || fenxings.length === 0) {
    return null;
  }

  const lastFx = fenxings[fenxings.length - 1];
  const latestRawK = orderedK[orderedK.length - 1];

  // 2. 边缘触发契约：最新这根原始 K 线必须属于分型的右侧确认集合（rightIds）
  if (!lastFx.rightIds.includes(latestRawK.id)) {
    return null;
  }

  const isBottom = lastFx.type === FenxingType.Bottom;
  const extremumPrice = isBottom ? lastFx.low : lastFx.high;
  const middleK =
    orderedK.find((k) => k.id === lastFx.middleOriginId) ?? latestRawK;

  return {
    type: lastFx.type as FenxingType.Top | FenxingType.Bottom,
    extremumPrice,
    extremumTime: middleK.time,
    confirmedTime: latestRawK.time,
    stopLossPrice: extremumPrice,
    mergedCount: lastFx.middleIds.length,
  };
}
