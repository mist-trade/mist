/**
 * Standard Fibonacci ratios used in retracement and extension analysis.
 */
export const FIBONACCI_RETRACEMENT_RATIOS = [
  0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0,
] as const;

export const FIBONACCI_EXTENSION_RATIOS = [
  1.272, 1.382, 1.618, 2.0, 2.618,
] as const;

export type FibonacciDirection = 'up' | 'down';

export type RetracementZone =
  | 'ABOVE_SWING'
  | 'SHALLOW'
  | 'MODERATE'
  | 'GOLDEN_POCKET'
  | 'DEEP'
  | 'INVALIDATED';

/**
 * TradingView official Fibonacci Retracement theme colors and opacity values.
 */
export interface TradingViewFibStyle {
  readonly color: string;
  readonly fill?: string;
  readonly lineStyle: 'solid' | 'dashed';
}

export const TRADINGVIEW_FIB_STYLES: Readonly<
  Record<string, TradingViewFibStyle>
> = Object.freeze({
  '0': { color: '#787B86', lineStyle: 'solid' },
  '0.236': {
    color: '#F23645',
    fill: 'rgba(242, 54, 69, 0.08)',
    lineStyle: 'dashed',
  },
  '0.382': {
    color: '#FF9800',
    fill: 'rgba(255, 152, 0, 0.08)',
    lineStyle: 'dashed',
  },
  '0.5': {
    color: '#4CAF50',
    fill: 'rgba(76, 175, 80, 0.08)',
    lineStyle: 'dashed',
  },
  '0.618': {
    color: '#089981',
    fill: 'rgba(8, 153, 129, 0.12)', // Golden Pocket highlight
    lineStyle: 'dashed',
  },
  '0.786': {
    color: '#2962FF',
    fill: 'rgba(41, 98, 255, 0.08)',
    lineStyle: 'dashed',
  },
  '1': {
    color: '#787B86',
    fill: 'rgba(120, 123, 134, 0.08)',
    lineStyle: 'solid',
  },
  '1.272': { color: '#E91E63', lineStyle: 'dashed' },
  '1.618': { color: '#9C27B0', lineStyle: 'dashed' },
  '2': { color: '#673AB7', lineStyle: 'dashed' },
});

export interface FibonacciParams {
  /** Rolling lookback window W (default 50) */
  readonly period?: number;
  readonly customRetracements?: readonly number[];
  readonly customExtensions?: readonly number[];
  readonly toleranceRatio?: number; // default 0.008 (±0.8%)
}

export interface FibonacciSeriesResult {
  readonly begIndex: number;
  readonly rollingHigh: number[];
  readonly rollingLow: number[];
  readonly diff: number[];
  /** Retracement ratio array: (rollingHigh - close) / diff */
  readonly ratio: number[];
  /** Levels keyed by ratio string (e.g. '0.618') */
  readonly levels: Record<string, number[]>;
}

export interface FibonacciObservation {
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly diff: number;
  readonly ratio: number;
  readonly levels: Record<string, number>;
  readonly zone: RetracementZone;
  readonly isGoldenPocket: boolean;
}

export interface FibonacciLevelItem {
  readonly ratio: number;
  readonly price: number;
  readonly label: string;
}

export interface FibonacciLevelsOptions {
  readonly customRetracements?: readonly number[];
  readonly customExtensions?: readonly number[];
  readonly precision?: number;
}

export interface FibonacciLevelsResult {
  readonly high: number;
  readonly low: number;
  readonly direction: FibonacciDirection;
  readonly diff: number;
  readonly retracements: readonly FibonacciLevelItem[];
  readonly extensions: readonly FibonacciLevelItem[];
  readonly levelsByRatio: Readonly<Record<string, number>>;
}

export interface StaticSwingFibonacciResult {
  readonly high: number;
  readonly low: number;
  readonly currentPrice: number;
  readonly direction: FibonacciDirection;
  readonly diff: number;
  readonly retracementRatio: number;
  readonly zone: RetracementZone;
  readonly isGoldenPocket: boolean;
  readonly levels: FibonacciLevelsResult;
}
