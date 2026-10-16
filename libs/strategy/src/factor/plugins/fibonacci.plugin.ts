import {
  computeStaticSwingFibonacci,
  RETRACEMENT_ZONES,
  TRADINGVIEW_FIB_STYLES,
} from '@app/indicators';
import { TrendDirection } from '@app/chancore';
import {
  findLastCompletedSwing,
  toChanKSeries,
  type ChanSwingUnitLevel,
} from '../../analysis/chan-derivation';
import {
  CHAN_BSP_UNITS,
  DECISION_ACTIONS,
  DEFAULT_REQUIRED_BARS_BI,
  DEFAULT_REQUIRED_BARS_DUAN,
  DEFAULT_TECHNICAL_FACTOR_CONFIDENCE,
} from '../../strategy.constants';
import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor.types';

export interface FibonacciPluginParams {
  readonly units?: ChanSwingUnitLevel;
  readonly toleranceRatio?: number;
  readonly direction?: 'pullback' | 'rebound' | 'both';
}

const DEFAULT_TOLERANCE_RATIO = 0.008;

/**
 * 斐波那契黄金分割回撤因子插件（缠论笔/段锚点版）
 * 锚定最近一根"已完成且有效"的缠论单元（笔，默认；可选段）端点，复用纯函数
 * `computeStaticSwingFibonacci` 计算回撤比例与黄金口袋区间：
 * - 向上单元：价格回撤进入 Golden Pocket（0.500 ~ 0.618）→ 回调做多买点；
 * - 向下单元：价格反弹进入 Golden Pocket → 反弹做空卖点；
 * - 无已完成单元（或 K 线不足）→ NEUTRAL，绝不回退滚动窗口锚点。
 */
export class FibonacciRetracementPlugin implements FactorPlugin {
  public readonly id = 'plugin.technical.fibonacci';
  public readonly name = '斐波那契黄金分割回撤因子插件';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '2.0.0';
  public readonly description =
    '基于缠论笔/段端点锚定的斐波那契回撤档位，检测价格处于黄金口袋(0.500~0.618)的关键支撑与阻力信号';

  public readonly paramSchema = {
    units: {
      type: 'string',
      enum: ['bi', 'duan'],
      default: 'bi',
      description: '摆动锚点级别：bi(笔) / duan(段)',
    },
    toleranceRatio: {
      type: 'number',
      default: DEFAULT_TOLERANCE_RATIO,
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
    const units: ChanSwingUnitLevel =
      rawParams?.units === CHAN_BSP_UNITS.DUAN
        ? CHAN_BSP_UNITS.DUAN
        : CHAN_BSP_UNITS.BI;
    const toleranceRatio =
      typeof rawParams?.toleranceRatio === 'number'
        ? rawParams.toleranceRatio
        : DEFAULT_TOLERANCE_RATIO;
    const direction =
      (rawParams?.direction as 'pullback' | 'rebound' | 'both') ?? 'pullback';
    const unitLabel = units === CHAN_BSP_UNITS.BI ? '笔' : '段';

    const minBars =
      units === CHAN_BSP_UNITS.DUAN
        ? DEFAULT_REQUIRED_BARS_DUAN
        : DEFAULT_REQUIRED_BARS_BI;
    if (context.bars.length < minBars) {
      return {
        action: DECISION_ACTIONS.NEUTRAL,
        confidence: 0.0,
        reason: `K线数量不足(${context.bars.length}/${minBars})，无法确立缠论${unitLabel}结构`,
      };
    }

    const klines = toChanKSeries(context.bars);
    if (klines.length === 0) {
      return {
        action: DECISION_ACTIONS.NEUTRAL,
        confidence: 0.0,
        reason: '有效行情数据为空，未形成缠论K线',
      };
    }

    const unit = findLastCompletedSwing(klines, units);
    if (!unit) {
      return {
        action: DECISION_ACTIONS.NEUTRAL,
        confidence: 0.0,
        reason: `尚未形成已确认的缠论${unitLabel}，斐波那契锚点不可用（不回退滚动窗口）`,
        evidence: {
          units,
          insufficientSwing: true,
        },
      };
    }

    const swingDirection =
      unit.trend === TrendDirection.Up
        ? ('up' as const)
        : unit.trend === TrendDirection.Down
          ? ('down' as const)
          : null;
    if (swingDirection === null) {
      return {
        action: DECISION_ACTIONS.NEUTRAL,
        confidence: 0.0,
        reason: `最近已确认的缠论${unitLabel}方向未知，无法判定斐波那契口径`,
        evidence: {
          units,
          trend: unit.trend,
        },
      };
    }

    const latestClose = klines[klines.length - 1].close;
    const obs = computeStaticSwingFibonacci(
      unit.high,
      unit.low,
      latestClose,
      swingDirection,
      { toleranceRatio },
    );

    const moveLabel = swingDirection === 'up' ? '回撤' : '反弹';
    const ratioPercent = (obs.retracementRatio * 100).toFixed(1);
    const goldenPocketTop = obs.levels.levelsByRatio['0.5']?.toFixed(2) ?? '';
    const goldenPocketBottom =
      obs.levels.levelsByRatio['0.618']?.toFixed(2) ?? '';
    const swingEvidence = {
      units,
      swingDirection,
      swingStartTime: unit.startTime.toISOString(),
      swingEndTime: unit.endTime.toISOString(),
      swingHigh: unit.high,
      swingLow: unit.low,
    };

    // 1. 回调做多判断：向上单元 + 价格回撤进入黄金口袋
    if (
      swingDirection === 'up' &&
      (direction === 'pullback' || direction === 'both')
    ) {
      if (obs.isGoldenPocket) {
        return {
          action: DECISION_ACTIONS.BUY,
          confidence: DEFAULT_TECHNICAL_FACTOR_CONFIDENCE,
          reason: `价格回调至缠论${unitLabel}构成的斐波那契黄金口袋区间 [${goldenPocketBottom} ~ ${goldenPocketTop}] (当前回撤: ${ratioPercent}%)`,
          evidence: {
            ...swingEvidence,
            high: obs.high,
            low: obs.low,
            close: obs.currentPrice,
            diff: obs.diff,
            ratio: obs.retracementRatio,
            zone: obs.zone,
            isGoldenPocket: obs.isGoldenPocket,
            levels: obs.levels.levelsByRatio,
            styles: TRADINGVIEW_FIB_STYLES,
          },
        };
      }
    }

    // 2. 反弹做空判断：向下单元 + 价格反弹进入黄金口袋
    if (
      swingDirection === 'down' &&
      (direction === 'rebound' || direction === 'both')
    ) {
      if (obs.isGoldenPocket) {
        return {
          action: DECISION_ACTIONS.SELL,
          confidence: DEFAULT_TECHNICAL_FACTOR_CONFIDENCE,
          reason: `价格反弹至缠论${unitLabel}构成的斐波那契黄金口袋阻力区 [${goldenPocketBottom} ~ ${goldenPocketTop}] (当前反弹: ${ratioPercent}%)`,
          evidence: {
            ...swingEvidence,
            high: obs.high,
            low: obs.low,
            close: obs.currentPrice,
            diff: obs.diff,
            ratio: obs.retracementRatio,
            zone: obs.zone,
            isGoldenPocket: obs.isGoldenPocket,
            levels: obs.levels.levelsByRatio,
            styles: TRADINGVIEW_FIB_STYLES,
          },
        };
      }
    }

    // 3. 其他非关键位（浅/中/深回撤、突破极值、黄金口袋但方向未启用）
    let zoneDesc = '未到达关键位';
    if (obs.zone === RETRACEMENT_ZONES.SHALLOW) {
      zoneDesc = `浅度${moveLabel}(${ratioPercent}%)`;
    } else if (obs.zone === RETRACEMENT_ZONES.MODERATE) {
      zoneDesc = `中度${moveLabel}(${ratioPercent}%)`;
    } else if (obs.zone === RETRACEMENT_ZONES.DEEP) {
      zoneDesc = `深度${moveLabel}(${ratioPercent}%)`;
    } else if (obs.zone === RETRACEMENT_ZONES.ABOVE_SWING) {
      zoneDesc = swingDirection === 'up' ? '已突破摆动高点' : '已跌破摆动低点';
    } else if (obs.zone === RETRACEMENT_ZONES.INVALIDATED) {
      zoneDesc = '已超出完整回撤位';
    } else if (obs.zone === RETRACEMENT_ZONES.GOLDEN_POCKET) {
      zoneDesc = '黄金口袋区间（当前评估方向未启用）';
    }

    return {
      action: DECISION_ACTIONS.NEUTRAL,
      confidence: 0.0,
      reason: `价格处于缠论${unitLabel}的斐波那契${zoneDesc}，未触发黄金口袋共振`,
      evidence: {
        ...swingEvidence,
        high: obs.high,
        low: obs.low,
        close: obs.currentPrice,
        ratio: obs.retracementRatio,
        zone: obs.zone,
        isGoldenPocket: obs.isGoldenPocket,
        levels: obs.levels.levelsByRatio,
      },
    };
  }
}
