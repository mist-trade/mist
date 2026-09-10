import {
  computeFibonacciObservation,
  TRADINGVIEW_FIB_STYLES,
} from '@app/indicators';
import type {
  BandVisualCommand,
  LineVisualCommand,
  TextVisualCommand,
  VisualCommand,
} from '../visual-command.types';

export interface FibonacciVisualKLine {
  readonly time: Date;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface FibonacciVisualOptions {
  /** Rolling window for Fibonacci swing anchor (default 50) */
  readonly period?: number;
  /** Whether to include shaded TradingView color bands between levels (default true) */
  readonly includeBands?: boolean;
  /** Whether to include text price labels on lines (default true) */
  readonly includeLabels?: boolean;
}

/**
 * 斐波那契视觉指令适配器
 * 基于 TradingView 官方工业级色谱与半透明色带规范，将行情序列转换为标准绘图原语
 */
export class FibonacciVisualAdapter {
  static convert(
    klines: readonly FibonacciVisualKLine[],
    options: FibonacciVisualOptions = {},
  ): readonly VisualCommand[] {
    const period = options.period ?? 50;
    if (!klines || klines.length < period) {
      return [];
    }

    const { includeBands = true, includeLabels = true } = options;

    const highs: number[] = [];
    const lows: number[] = [];
    const closes: number[] = [];

    for (let i = 0; i < klines.length; i++) {
      highs.push(klines[i].high);
      lows.push(klines[i].low);
      closes.push(klines[i].close);
    }

    let obs;
    try {
      obs = computeFibonacciObservation(highs, lows, closes, { period });
    } catch {
      return [];
    }

    const commands: VisualCommand[] = [];
    const endIndex = klines.length - 1;
    const startIndex = Math.max(0, klines.length - period);
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
        const topPrice = obs.levels[pair.upper];
        const bottomPrice = obs.levels[pair.lower];
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
      const price = obs.levels[ratioStr];
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
