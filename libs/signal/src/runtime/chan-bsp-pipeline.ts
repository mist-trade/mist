import {
  ChanCore,
  type ChanBiChannel,
  type ChanDivergenceZhongshu,
  type ChanDuanChannel,
} from '@app/chancore';

/**
 * 包装中枢对象为 ChanDivergenceZhongshu 最小定位中枢。
 * 委托至 @app/chancore 纯函数实现。
 */
export function toZhongshu(
  channel: ChanBiChannel | ChanDuanChannel,
): ChanDivergenceZhongshu {
  return ChanCore.toZhongshu(channel);
}
