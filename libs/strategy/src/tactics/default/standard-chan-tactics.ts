import { TrendDirection, FenxingType, type ChanK } from '@app/chancore';
import { computeMacdSeries } from '@app/indicators';
import { detectLatestConfirmedFenxing } from '../../analysis/chan-fenxing-trigger';
import {
  ChanFourQuadrantTactics,
  ChanTacticsContext,
  MacroTrendDirection,
  TacticalAction,
  TacticalQuadrant,
  TacticalQuadrantDecision,
} from '../contracts/chan-four-quadrant-tactics.interface';

/**
 * 周期换算比率：
 * - 1m -> 5m (ratio: 5)
 * - 5m -> 30m (ratio: 6)
 * - 15m -> 60m (ratio: 4)
 * - 30m -> 120m (ratio: 4)
 * - 60m -> 240m/日线 (ratio: 4)
 * - 1d -> 周线 (ratio: 5)
 * - 默认 ratio = 4
 */
export function getHigherPeriodRatio(period?: string | number): number {
  if (!period) return 4;
  const p = String(period).toLowerCase().trim();
  if (p === '1m' || p === '1') return 5;
  if (p === '5m' || p === '5') return 6;
  if (p === '15m' || p === '15') return 4;
  if (p === '30m' || p === '30') return 4;
  if (p === '60m' || p === '60' || p === '1h') return 4;
  if (p === '1d' || p === 'day' || p === 'daily') return 5;
  return 4;
}

/**
 * 合成本级别 K 线到上一级别（大级别）K 线
 */
export function resampleToHigherKlines(
  klines: readonly ChanK[],
  period?: string | number,
): readonly ChanK[] {
  if (!klines || klines.length === 0) return [];
  const ratio = getHigherPeriodRatio(period);
  if (klines.length < ratio) return [];

  const resampled: ChanK[] = [];
  const count = Math.floor(klines.length / ratio);
  const remainder = klines.length % ratio;

  for (let i = 0; i < count; i++) {
    const startIdx = remainder + i * ratio;
    const chunk = klines.slice(startIdx, startIdx + ratio);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];

    let high = -Infinity;
    let low = Infinity;
    for (const k of chunk) {
      if (k.high > high) high = k.high;
      if (k.low < low) low = k.low;
    }

    resampled.push({
      id: i + 1,
      symbol: first.symbol,
      time: last.time,
      open: first.open,
      high,
      low,
      close: last.close,
      volume: null,
      amount: null,
    });
  }
  return resampled;
}

/**
 * 依据上一级别 MACD 黄白线（DIF/DEA）金叉/死叉状态推导宏观走势背景
 * - 金叉多头状态 (DIF > DEA): 'UP'
 * - 死叉空头状态 (DIF < DEA): 'DOWN'
 * - 粘合或无数据: 'RANGE'
 */
export function deriveMacroTrendFromHigherMacd(
  ctx: ChanTacticsContext,
): MacroTrendDirection {
  const evaluateMacdPosture = (
    dif: number,
    dea: number,
  ): MacroTrendDirection => {
    if (dif > dea) return 'UP'; // 金叉多头
    if (dif < dea) return 'DOWN'; // 死叉空头
    // 零轴水上/水下辅助判断
    if (dif > 0) return 'UP';
    if (dif < 0) return 'DOWN';
    return 'RANGE';
  };

  // 1. 若外部显式提供了上一级别 K 线数据 parentKlines，直接计算其 MACD
  if (ctx.parentKlines && ctx.parentKlines.length >= 34) {
    const closes = ctx.parentKlines.map((k) => k.close);
    const macdRes = computeMacdSeries(closes);
    if (macdRes.macd.length > 0 && macdRes.signal.length > 0) {
      const lastDif = macdRes.macd[macdRes.macd.length - 1];
      const lastDea = macdRes.signal[macdRes.signal.length - 1];
      return evaluateMacdPosture(lastDif, lastDea);
    }
  }

  // 2. 若未提供 parentKlines，尝试从本级别 klines 重采样合成本级别之上的上一级别 K 线
  if (ctx.klines && ctx.klines.length >= 34) {
    const resampled = resampleToHigherKlines(ctx.klines, ctx.period);
    if (resampled.length >= 34) {
      const closes = resampled.map((k) => k.close);
      const macdRes = computeMacdSeries(closes);
      if (macdRes.macd.length > 0 && macdRes.signal.length > 0) {
        const lastDif = macdRes.macd[macdRes.macd.length - 1];
        const lastDea = macdRes.signal[macdRes.signal.length - 1];
        return evaluateMacdPosture(lastDif, lastDea);
      }
    }

    // 3. 兜底方案：如果合成大级别后根数不足 34，退化采用本级别 MACD 金叉死叉状态判断
    const baseCloses = ctx.klines.map((k) => k.close);
    const baseMacd = computeMacdSeries(baseCloses);
    if (baseMacd.macd.length > 0 && baseMacd.signal.length > 0) {
      const lastDif = baseMacd.macd[baseMacd.macd.length - 1];
      const lastDea = baseMacd.signal[baseMacd.signal.length - 1];
      return evaluateMacdPosture(lastDif, lastDea);
    }
  }

  return 'RANGE';
}

/**
 * 标准公开兜底缠论战术实现
 * 核心逻辑：以“上一级别 MACD 黄白线金叉死叉”作为宏观多空趋势过滤器
 * - 上升趋势段（上一级别金叉）：放行 1 个中枢底背驰（顺势洗盘买入）；
 * - 下跌趋势段（上一级别死叉）：严禁单中枢抄底，强制要求 >= 2 个下跌中枢趋势背驰；
 * - 震荡箱体段（走平/粘合）：放行单中枢箱体边缘底背驰。
 */
export class StandardChanTactics implements ChanFourQuadrantTactics {
  readonly id = 'standard-chan-tactics';
  readonly name = 'Standard Chan Baseline Tactics';
  readonly version = '1.0.0';
  readonly author = 'Mist Open Core';

  /**
   * ① 左侧买点 (Left Buy)：逆势抄底 / 顺势回调
   */
  evaluateLeftBuy(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    const klines = ctx.klines;
    if (!klines || klines.length < 3) {
      return this.emptyDecision(TacticalQuadrant.LeftBuy, ctx, 'K线数量不足');
    }

    // 1. 获取宏观走势背景（优先取 ctx.macroTrend，缺失则通过上一级别 MACD 金叉死叉状态推导）
    const macroTrend = ctx.macroTrend ?? deriveMacroTrendFromHigherMacd(ctx);
    const downZhongshuCount =
      ctx.candidateBsp?.zhongshuCount ??
      this.countConsecutiveDownZhongshus(ctx);

    // 2. 核心风控门禁：大级别 MACD 死叉（下跌趋势段）严禁单中枢抄底，必须等待 >= 2 个下跌中枢趋势背驰
    if (macroTrend === 'DOWN' && downZhongshuCount < 2) {
      return this.emptyDecision(
        TacticalQuadrant.LeftBuy,
        ctx,
        `上一级别MACD处于死叉(下跌趋势段)，严禁单中枢抄底(当前仅${downZhongshuCount}个中枢)，需等待第2中枢衰竭背驰`,
      );
    }

    // 3. 候选形态检查：若有 candidateBsp 则检验，无则检查本级别底分型
    if (ctx.candidateBsp) {
      if (ctx.candidateBsp.type !== 'first_buy') {
        return this.emptyDecision(
          TacticalQuadrant.LeftBuy,
          ctx,
          `候选买卖点类型为${ctx.candidateBsp.type}，非一买`,
        );
      }
    } else {
      const fenxing = detectLatestConfirmedFenxing(klines);
      if (!fenxing || fenxing.type !== FenxingType.Bottom) {
        return this.emptyDecision(
          TacticalQuadrant.LeftBuy,
          ctx,
          '未形成有效底分型',
        );
      }
    }

    const price =
      ctx.candidateBsp?.price ??
      ctx.lastPrice ??
      klines[klines.length - 1].close;

    const reason =
      macroTrend === 'UP'
        ? `上一级别MACD金叉(顺势良性回调)，${downZhongshuCount}中枢底背驰买入`
        : macroTrend === 'DOWN'
          ? `上一级别MACD死叉(空头大趋势)，${downZhongshuCount}中枢终极衰竭趋势背驰抄底`
          : `震荡行情箱体边缘，${downZhongshuCount}中枢底背驰买入`;

    return {
      triggered: true,
      quadrant: TacticalQuadrant.LeftBuy,
      price,
      time: ctx.candidateBsp?.time ?? ctx.timestamp,
      confidence: macroTrend === 'UP' ? 90 : 80,
      action: TacticalAction.OpenLong,
      reason,
      stopLossPrice: klines[klines.length - 2]?.low ?? price * 0.98,
    };
  }

  /**
   * ② 右侧买点 (Right Buy)：顺势追强（二买与三买）
   */
  evaluateRightBuy(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    const macroTrend = ctx.macroTrend ?? deriveMacroTrendFromHigherMacd(ctx);

    // 优先消费结构性候选二买/三买
    if (ctx.candidateBsp) {
      const type = ctx.candidateBsp.type;
      if (type === 'second_buy' || type === 'third_buy') {
        const isSecond = type === 'second_buy';
        return {
          triggered: true,
          quadrant: TacticalQuadrant.RightBuy,
          price: ctx.candidateBsp.price,
          time: ctx.candidateBsp.time,
          confidence: macroTrend === 'UP' ? 95 : 88,
          action: TacticalAction.OpenLong,
          reason: isSecond
            ? `二买确认：一买后次次回抽不破前低 (上一级别MACD: ${macroTrend})`
            : `三买确认：强势突破中枢后回抽不破ZG (上一级别MACD: ${macroTrend})`,
        };
      }
    }

    // 次级基于笔序列推导二买
    const bis = ctx.bis;
    if (bis && bis.length >= 3) {
      const b0 = bis[bis.length - 3];
      const b1 = bis[bis.length - 2];
      const b2 = bis[bis.length - 1];

      // 下降笔 b0 -> 上升笔 b1 -> 下降笔 b2（不破 b0.low）且当根 Bar 确认底分型
      if (
        b0.trend === TrendDirection.Down &&
        b1.trend === TrendDirection.Up &&
        b2.trend === TrendDirection.Down &&
        b2.low > b0.low
      ) {
        const fenxing = detectLatestConfirmedFenxing(ctx.klines);
        if (!fenxing || fenxing.type !== FenxingType.Bottom) {
          return this.emptyDecision(
            TacticalQuadrant.RightBuy,
            ctx,
            '二买形态观察中，等待底分型扳机确立',
          );
        }

        return {
          triggered: true,
          quadrant: TacticalQuadrant.RightBuy,
          price: ctx.lastPrice ?? fenxing.extremumPrice,
          time: fenxing.confirmedTime,
          confidence: macroTrend === 'UP' ? 92 : 82,
          action: TacticalAction.OpenLong,
          reason: `标准二买形态：次次回抽低点(${b2.low})抬高不破前低(${b0.low})且底分型确立 (上一级别MACD: ${macroTrend})`,
          stopLossPrice: fenxing.stopLossPrice,
        };
      }
    }

    return this.emptyDecision(TacticalQuadrant.RightBuy, ctx);
  }

  /**
   * ③ 左侧卖点 (Left Sell)：冲高减仓 / 逃顶
   */
  evaluateLeftSell(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    const klines = ctx.klines;
    if (!klines || klines.length < 3) {
      return this.emptyDecision(TacticalQuadrant.LeftSell, ctx, 'K线数量不足');
    }

    const macroTrend = ctx.macroTrend ?? deriveMacroTrendFromHigherMacd(ctx);
    const upZhongshuCount =
      ctx.candidateBsp?.zhongshuCount ?? this.countConsecutiveUpZhongshus(ctx);

    // 上一级别 MACD 金叉（上升趋势段）中，单中枢冲高往往是中继，严禁过早轻易卖飞，需 >= 2 中枢背驰
    if (macroTrend === 'UP' && upZhongshuCount < 2) {
      return this.emptyDecision(
        TacticalQuadrant.LeftSell,
        ctx,
        `上一级别MACD处于金叉(强上升趋势)，单中枢易主升延伸(当前仅${upZhongshuCount}中枢)，防过早卖飞`,
      );
    }

    if (ctx.candidateBsp) {
      if (ctx.candidateBsp.type !== 'first_sell') {
        return this.emptyDecision(
          TacticalQuadrant.LeftSell,
          ctx,
          `候选买卖点类型为${ctx.candidateBsp.type}，非一卖`,
        );
      }
    } else {
      const fenxing = detectLatestConfirmedFenxing(klines);
      if (!fenxing || fenxing.type !== FenxingType.Top) {
        return this.emptyDecision(
          TacticalQuadrant.LeftSell,
          ctx,
          '未形成有效顶分型',
        );
      }
    }

    const price =
      ctx.candidateBsp?.price ??
      ctx.lastPrice ??
      klines[klines.length - 1].close;

    const reason =
      macroTrend === 'DOWN'
        ? `上一级别MACD死叉(顺势空头压制)，${upZhongshuCount}中枢反弹承压一卖`
        : macroTrend === 'UP'
          ? `上一级别MACD金叉(强势多头)，${upZhongshuCount}中枢极度超买高位背驰止盈一卖`
          : `震荡行情箱体上轨，${upZhongshuCount}中枢顶背驰一卖`;

    return {
      triggered: true,
      quadrant: TacticalQuadrant.LeftSell,
      price,
      time: ctx.candidateBsp?.time ?? ctx.timestamp,
      confidence: macroTrend === 'DOWN' ? 92 : 85,
      action: TacticalAction.CloseLong,
      reason,
    };
  }

  /**
   * ④ 右侧卖点 (Right Sell)：破位止损 / 清仓
   */
  evaluateRightSell(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    const macroTrend = ctx.macroTrend ?? deriveMacroTrendFromHigherMacd(ctx);

    if (ctx.candidateBsp) {
      const type = ctx.candidateBsp.type;
      if (type === 'second_sell' || type === 'third_sell') {
        const isSecond = type === 'second_sell';
        return {
          triggered: true,
          quadrant: TacticalQuadrant.RightSell,
          price: ctx.candidateBsp.price,
          time: ctx.candidateBsp.time,
          confidence: macroTrend === 'DOWN' ? 95 : 88,
          action: TacticalAction.CloseLong,
          reason: isSecond
            ? `二卖确认：反弹不过前高 (上一级别MACD: ${macroTrend})`
            : `三卖确认：破位跌穿中枢反抽不过ZD (上一级别MACD: ${macroTrend})`,
        };
      }
    }

    const bis = ctx.bis;
    if (bis && bis.length >= 3) {
      const b0 = bis[bis.length - 3];
      const b1 = bis[bis.length - 2];
      const b2 = bis[bis.length - 1];

      // 上升笔 b0 -> 下降笔 b1 -> 上升笔 b2（不过 b0.high）且当根 Bar 确认顶分型
      if (
        b0.trend === TrendDirection.Up &&
        b1.trend === TrendDirection.Down &&
        b2.trend === TrendDirection.Up &&
        b2.high < b0.high
      ) {
        const fenxing = detectLatestConfirmedFenxing(ctx.klines);
        if (!fenxing || fenxing.type !== FenxingType.Top) {
          return this.emptyDecision(
            TacticalQuadrant.RightSell,
            ctx,
            '二卖形态观察中，等待顶分型扳机确立',
          );
        }

        return {
          triggered: true,
          quadrant: TacticalQuadrant.RightSell,
          price: ctx.lastPrice ?? fenxing.extremumPrice,
          time: fenxing.confirmedTime,
          confidence: macroTrend === 'DOWN' ? 90 : 82,
          action: TacticalAction.CloseLong,
          reason: `标准二卖形态：反弹高点(${b2.high})不过前高(${b0.high})且顶分型确立 (上一级别MACD: ${macroTrend})`,
          stopLossPrice: fenxing.stopLossPrice,
        };
      }
    }

    return this.emptyDecision(TacticalQuadrant.RightSell, ctx);
  }

  /**
   * 统计最近连续下跌中枢数量（重心递降且不扩张的中枢链）
   */
  private countConsecutiveDownZhongshus(ctx: ChanTacticsContext): number {
    const zs = ctx.zhongshus;
    if (!zs || zs.length === 0) return 1;

    let count = 1;
    for (let i = zs.length - 1; i > 0; i--) {
      const curr = zs[i];
      const prev = zs[i - 1];
      if (curr.zg < prev.zd || (curr.zg < prev.zg && curr.zd < prev.zd)) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * 统计最近连续上涨中枢数量（重心递增且不扩张的中枢链）
   */
  private countConsecutiveUpZhongshus(ctx: ChanTacticsContext): number {
    const zs = ctx.zhongshus;
    if (!zs || zs.length === 0) return 1;

    let count = 1;
    for (let i = zs.length - 1; i > 0; i--) {
      const curr = zs[i];
      const prev = zs[i - 1];
      if (curr.zd > prev.zg || (curr.zg > prev.zg && curr.zd > prev.zd)) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  private emptyDecision(
    quadrant: TacticalQuadrant,
    ctx: ChanTacticsContext,
    reason = '未触发战术条件',
  ): TacticalQuadrantDecision {
    return {
      triggered: false,
      quadrant,
      price: ctx.lastPrice ?? 0,
      time: ctx.timestamp,
      confidence: 0,
      action: TacticalAction.None,
      reason,
    };
  }
}
