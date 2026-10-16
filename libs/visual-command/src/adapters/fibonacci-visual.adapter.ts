import {
  computeFibonacciLevels,
  TRADINGVIEW_FIB_STYLES,
} from '@app/indicators';
import { TrendDirection, type ChanK } from '@app/chancore';
import { findLastCompletedSwing, type ChanSwingLevel } from './chan-swing.util';
import type {
  BandVisualCommand,
  LineVisualCommand,
  TextVisualCommand,
  VisualCommand,
} from '../visual-command.types';

export interface FibonacciVisualOptions {
  /** Chan swing level used as the Fibonacci anchor: bi by default. */
  readonly units?: ChanSwingLevel;
  /** Whether to include shaded TradingView color bands between levels (default true) */
  readonly includeBands?: boolean;
  /** Whether to include text price labels on lines (default true) */
  readonly includeLabels?: boolean;
}

/**
 * 斐波那契视觉指令适配器
 * 锚定最近一根"已完成且有效"的缠论单元（笔/段）端点（与因子插件同源），
 * 基于 TradingView 官方工业级色谱与半透明色带规范，将摆动区间转换为标准绘图原语。
 * 无已完成摆动时输出空指令集（不回退滚动窗口锚点）。
 */
export class FibonacciVisualAdapter {
  static convert(
    klines: readonly ChanK[],
    options: FibonacciVisualOptions = {},
  ): readonly VisualCommand[] {
    const units = options.units ?? 'bi';
    if (!klines || klines.length === 0) {
      return [];
    }

    const unit = findLastCompletedSwing(klines, units);
    if (!unit || !(unit.high > unit.low)) {
      return [];
    }

    const direction = unit.trend === TrendDirection.Up ? 'up' : 'down';
    const levelsResult = computeFibonacciLevels(unit.high, unit.low, direction);
    const levels = levelsResult.levelsByRatio;

    const { includeBands = true, includeLabels = true } = options;

    const commands: VisualCommand[] = [];
    const endIndex = klines.length - 1;
    const foundStart = klines.findIndex(
      (k) => k.time.getTime() === unit.startTime.getTime(),
    );
    const startIndex = Math.max(0, foundStart);
    const startTime = klines[startIndex].time.toISOString();
    const endTime = klines[endIndex].time.toISOString();

    const standardRatios = [
      '0',
      '0.236',
      '0.382',
      '0.5',
      '0.618',
      '0.786',
      '1',
    ] as const;

    // 1. TradingView 官方半透明填充色带 (Bands between adjacent levels)
    if (includeBands) {
      const bandPairs = [
        { upper: '0.236', lower: '0.382' },
        { upper: '0.382', lower: '0.5' },
        { upper: '0.5', lower: '0.618' }, // Golden Pocket
        { upper: '0.618', lower: '0.786' },
        { upper: '0.786', lower: '1' },
      ];

      for (const pair of bandPairs) {
        const topPrice = levels[pair.upper];
        const bottomPrice = levels[pair.lower];
        const style = TRADINGVIEW_FIB_STYLES[pair.lower];

        if (
          topPrice !== undefined &&
          bottomPrice !== undefined &&
          style?.fill
        ) {
          const bandCmd: BandVisualCommand = {
            id: `fib_band_${pair.upper}_${pair.lower}_${endIndex}`,
            type: 'band',
            layer: 'fibonacci',
            fromIndex: startIndex,
            toIndex: endIndex,
            fromTime: startTime,
            toTime: endTime,
            top: topPrice,
            bottom: bottomPrice,
            color: style.fill,
            fill: true,
          };
          commands.push(bandCmd);
        }
      }
    }

    // 2. 斐波那契水平位虚线与右侧标签 (Lines and Labels)
    for (const ratioStr of standardRatios) {
      const price = levels[ratioStr];
      const style = TRADINGVIEW_FIB_STYLES[ratioStr];
      if (price === undefined || !style) continue;

      const lineCmd: LineVisualCommand = {
        id: `fib_line_${ratioStr}_${endIndex}`,
        type: 'line',
        layer: 'fibonacci',
        startIndex,
        endIndex,
        startTime,
        endTime,
        startPrice: price,
        endPrice: price,
        color: style.color,
        style: style.lineStyle,
        width: ratioStr === '0' || ratioStr === '1' ? 1.5 : 1,
      };
      commands.push(lineCmd);

      if (includeLabels) {
        const textCmd: TextVisualCommand = {
          id: `fib_text_${ratioStr}_${endIndex}`,
          type: 'text',
          layer: 'fibonacci',
          index: endIndex,
          time: endTime,
          price,
          text: `${ratioStr} (${price.toFixed(2)})`,
          color: style.color,
          position: 'above',
        };
        commands.push(textCmd);
      }
    }

    return Object.freeze(commands);
  }
}
