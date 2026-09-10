import {
  computeFibonacciObservation,
  TRADINGVIEW_FIB_STYLES,
} from '@app/indicators';
import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor.types';

export interface FibonacciPluginParams {
  readonly period?: number;
  readonly toleranceRatio?: number;
  readonly direction?: 'pullback' | 'rebound' | 'both';
}

/**
 * 斐波那契黄金分割回撤因子插件
 * 基于 Rust nodejs-polars 纯向量化引擎计算波段极值与黄金分割档位，
 * 捕捉价格回调进入 Golden Pocket (0.500 ~ 0.618) 黄金口袋区间的共振买点，
 * 以及弱势反弹至 0.500 ~ 0.618 阻力位的高抛做空点。
 */
export class FibonacciRetracementPlugin implements FactorPlugin {
  public readonly id = 'plugin.technical.fibonacci';
  public readonly name = '斐波那契黄金分割回撤因子插件';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '1.0.0';
  public readonly description =
    '基于Rust向量化Polars计算滑动波段斐波那契回撤档位，检测价格处于黄金口袋(0.500~0.618)的关键支撑与阻力信号';

  public readonly paramSchema = {
    period: {
      type: 'number',
      default: 50,
      description: '斐波那契波段回溯K线数',
    },
    toleranceRatio: {
      type: 'number',
      default: 0.008,
      description: '黄金口袋容差比率(默认±0.8%)',
    },
    direction: {
      type: 'string',
      enum: ['pullback', 'rebound', 'both'],
      default: 'pullback',
      description:
        '评估方向：pullback(回调做多), rebound(反弹做空), both(双向)',
    },
  };

  public async evaluate(
    context: FactorContext,
    rawParams?: Record<string, unknown>,
  ): Promise<FactorOpinion> {
    const period =
      typeof rawParams?.period === 'number' && rawParams.period > 0
        ? rawParams.period
        : 50;
    const toleranceRatio =
      typeof rawParams?.toleranceRatio === 'number'
        ? rawParams.toleranceRatio
        : 0.008;
    const direction =
      (rawParams?.direction as 'pullback' | 'rebound' | 'both') ?? 'pullback';

    const highs: number[] = [];
    const lows: number[] = [];
    const closes: number[] = [];

    for (let i = 0; i < context.bars.length; i++) {
      const b = context.bars[i];
      const ohlc = b.ohlc.effective;
      if (!ohlc) continue;
      highs.push(ohlc.high);
      lows.push(ohlc.low);
      closes.push(ohlc.close);
    }

    if (closes.length < period) {
      return {
        action: 'NEUTRAL',
        confidence: 0.0,
        reason: `K线数量不足(${closes.length}/${period})，无法计算斐波那契波段`,
      };
    }

    const obs = computeFibonacciObservation(highs, lows, closes, {
      period,
      toleranceRatio,
    });

    const ratioPercent = (obs.ratio * 100).toFixed(1);
    const goldenPocketTop = obs.levels['0.5']?.toFixed(2) ?? '';
    const goldenPocketBottom = obs.levels['0.618']?.toFixed(2) ?? '';

    // 1. 回调做多判断 (Pullback into Golden Pocket: 0.500 ~ 0.618 from high)
    if (direction === 'pullback' || direction === 'both') {
      if (obs.isGoldenPocket) {
        return {
          action: 'BUY',
          confidence: 0.75,
          reason: `价格回调至斐波那契黄金口袋区间 [${goldenPocketBottom} ~ ${goldenPocketTop}] (当前回撤: ${ratioPercent}%)`,
          evidence: {
            high: obs.high,
            low: obs.low,
            close: obs.close,
            diff: obs.diff,
            ratio: obs.ratio,
            zone: obs.zone,
            isGoldenPocket: obs.isGoldenPocket,
            levels: obs.levels,
            styles: TRADINGVIEW_FIB_STYLES,
          },
        };
      }
    }

    // 2. 反弹做空判断 (Rebound into Golden Pocket: 0.500 ~ 0.618 from low)
    if (direction === 'rebound' || direction === 'both') {
      const reboundRatio =
        obs.diff === 0 ? 0.5 : (obs.close - obs.low) / obs.diff;
      const isReboundGoldenPocket =
        reboundRatio >= 0.5 - toleranceRatio &&
        reboundRatio <= 0.618 + toleranceRatio;

      if (isReboundGoldenPocket) {
        const reboundPercent = (reboundRatio * 100).toFixed(1);
        return {
          action: 'SELL',
          confidence: 0.75,
          reason: `价格反弹至斐波那契黄金口袋阻力区 (当前反弹: ${reboundPercent}%)`,
          evidence: {
            high: obs.high,
            low: obs.low,
            close: obs.close,
            diff: obs.diff,
            ratio: obs.ratio,
            reboundRatio,
            levels: obs.levels,
            styles: TRADINGVIEW_FIB_STYLES,
          },
        };
      }
    }

    // 3. 其他非关键位 (浅回调/中度/深回调)
    let zoneDesc = '未到达关键位';
    if (obs.zone === 'SHALLOW') zoneDesc = `浅度回调(${ratioPercent}%)`;
    else if (obs.zone === 'MODERATE') zoneDesc = `中度回调(${ratioPercent}%)`;
    else if (obs.zone === 'DEEP') zoneDesc = `深度回调(${ratioPercent}%)`;
    else if (obs.zone === 'ABOVE_SWING') zoneDesc = '突破波段新高';

    return {
      action: 'NEUTRAL',
      confidence: 0.0,
      reason: `价格处于斐波那契${zoneDesc}，未触发黄金口袋共振`,
      evidence: {
        high: obs.high,
        low: obs.low,
        close: obs.close,
        ratio: obs.ratio,
        zone: obs.zone,
        isGoldenPocket: obs.isGoldenPocket,
        levels: obs.levels,
      },
    };
  }
}
