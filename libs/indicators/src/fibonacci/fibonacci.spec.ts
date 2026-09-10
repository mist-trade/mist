import { IndicatorInputError, IndicatorValueError } from '../errors';
import {
  computeFibonacciLevels,
  computeFibonacciObservation,
  computeFibonacciSeries,
  computeStaticSwingFibonacci,
  TRADINGVIEW_FIB_STYLES,
} from './index';

describe('Fibonacci Indicator Core (Polars Rust Vectorized)', () => {
  describe('computeFibonacciSeries', () => {
    it('computes rolling Fibonacci series via Polars Rust engine aligned to begIndex', () => {
      // 10 bars of synthetic prices
      const highs = [10, 12, 14, 16, 18, 20, 19, 18, 17, 16];
      const lows = [5, 6, 7, 8, 9, 10, 10, 10, 9, 8];
      const closes = [8, 10, 12, 14, 16, 15, 14.5, 14, 13, 12];
      const period = 5;

      const result = computeFibonacciSeries(highs, lows, closes, { period });

      expect(result.begIndex).toBe(4);
      expect(result.rollingHigh.length).toBe(6); // 10 - 4
      expect(result.rollingLow.length).toBe(6);
      expect(result.diff.length).toBe(6);
      expect(result.ratio.length).toBe(6);

      // At index 5 (bar 6): highs in window [12, 14, 16, 18, 20] -> max 20; lows in window [6, 7, 8, 9, 10] -> min 6
      expect(result.rollingHigh[1]).toBe(20);
      expect(result.rollingLow[1]).toBe(6);
      expect(result.diff[1]).toBe(14);

      // Check that levels are populated for standard ratios
      expect(result.levels['0.618']).toBeDefined();
      expect(result.levels['0.5']).toBeDefined();
      expect(result.levels['1']).toBeDefined();

      // For bar 6: high 20, diff 14 -> level 0.5 = 20 - 7 = 13
      expect(result.levels['0.5'][1]).toBe(13);
    });

    it('returns empty arrays with begIndex equal to length when input is insufficient', () => {
      const highs = [10, 12, 14];
      const lows = [5, 6, 7];
      const closes = [8, 10, 12];
      const result = computeFibonacciSeries(highs, lows, closes, { period: 5 });

      expect(result.begIndex).toBe(3);
      expect(result.rollingHigh).toEqual([]);
      expect(result.ratio).toEqual([]);
    });

    it('throws IndicatorInputError when array lengths do not match or period is invalid', () => {
      expect(() =>
        computeFibonacciSeries([10, 12], [5], [8, 10], { period: 2 }),
      ).toThrow(IndicatorInputError);
      expect(() =>
        computeFibonacciSeries([10], [5], [8], { period: 0 }),
      ).toThrow(IndicatorInputError);
      expect(() =>
        computeFibonacciSeries([10], [5], [8], { period: -1 }),
      ).toThrow(IndicatorInputError);
    });
  });

  describe('computeFibonacciObservation', () => {
    it('evaluates trailing scalar observation matching series tail value', () => {
      const highs = [10, 12, 14, 16, 18, 20, 19, 18, 17, 16];
      const lows = [5, 6, 7, 8, 9, 10, 10, 10, 9, 8];
      const closes = [8, 10, 12, 14, 16, 15, 14.5, 14, 13, 12];
      const period = 5;

      const series = computeFibonacciSeries(highs, lows, closes, { period });
      const obs = computeFibonacciObservation(highs, lows, closes, { period });

      expect(obs.high).toBe(series.rollingHigh[series.rollingHigh.length - 1]);
      expect(obs.low).toBe(series.rollingLow[series.rollingLow.length - 1]);
      expect(obs.diff).toBe(series.diff[series.diff.length - 1]);
      expect(obs.ratio).toBeCloseTo(series.ratio[series.ratio.length - 1], 6);
      expect(obs.levels['0.618']).toBeCloseTo(
        series.levels['0.618'][series.levels['0.618'].length - 1],
        6,
      );
    });

    it('correctly identifies Golden Pocket when close is between 0.500 and 0.618', () => {
      // 5 bars where High = 20, Low = 10, Diff = 10
      // 55% pullback: close = 20 - 5.5 = 14.5
      const highs = [15, 16, 18, 20, 19];
      const lows = [10, 12, 11, 10, 12];
      const closes = [12, 14, 16, 18, 14.5];

      const obs = computeFibonacciObservation(highs, lows, closes, {
        period: 5,
      });

      expect(obs.high).toBe(20);
      expect(obs.low).toBe(10);
      expect(obs.diff).toBe(10);
      expect(obs.ratio).toBe(0.55);
      expect(obs.isGoldenPocket).toBe(true);
      expect(obs.zone).toBe('GOLDEN_POCKET');
    });

    it('throws IndicatorInputError on insufficient length and IndicatorValueError on non-finite values', () => {
      expect(() =>
        computeFibonacciObservation([10, 12], [5, 6], [8, 10], { period: 5 }),
      ).toThrow(IndicatorInputError);
      expect(() =>
        computeFibonacciObservation([NaN, 12], [5, 6], [8, 10], { period: 2 }),
      ).toThrow(IndicatorValueError);
    });
  });

  describe('computeFibonacciLevels & computeStaticSwingFibonacci', () => {
    it('calculates deterministic retracement and extension levels for an upward swing', () => {
      const high = 20;
      const low = 10;
      const result = computeFibonacciLevels(high, low, 'up');

      expect(result.high).toBe(20);
      expect(result.low).toBe(10);
      expect(result.direction).toBe('up');
      expect(result.diff).toBe(10);

      expect(result.levelsByRatio['0']).toBe(20);
      expect(result.levelsByRatio['0.236']).toBe(17.64);
      expect(result.levelsByRatio['0.382']).toBe(16.18);
      expect(result.levelsByRatio['0.5']).toBe(15);
      expect(result.levelsByRatio['0.618']).toBe(13.82);
      expect(result.levelsByRatio['0.786']).toBe(12.14);
      expect(result.levelsByRatio['1']).toBe(10);

      expect(result.levelsByRatio['1.272']).toBe(22.72);
      expect(result.levelsByRatio['1.618']).toBe(26.18);
    });

    it('calculates deterministic retracement and extension levels for a downward swing', () => {
      const high = 20;
      const low = 10;
      const result = computeFibonacciLevels(high, low, 'down');

      expect(result.high).toBe(20);
      expect(result.low).toBe(10);
      expect(result.direction).toBe('down');
      expect(result.diff).toBe(10);

      expect(result.levelsByRatio['0']).toBe(10);
      expect(result.levelsByRatio['0.236']).toBe(12.36);
      expect(result.levelsByRatio['0.382']).toBe(13.82);
      expect(result.levelsByRatio['0.5']).toBe(15);
      expect(result.levelsByRatio['0.618']).toBe(16.18);
      expect(result.levelsByRatio['0.786']).toBe(17.86);
      expect(result.levelsByRatio['1']).toBe(20);

      expect(result.levelsByRatio['1.272']).toBe(7.28);
      expect(result.levelsByRatio['1.618']).toBe(3.82);
    });

    it('computeStaticSwingFibonacci classifies zones and golden pocket', () => {
      const swing = computeStaticSwingFibonacci(20, 10, 14.5, 'up');
      expect(swing.retracementRatio).toBe(0.55);
      expect(swing.isGoldenPocket).toBe(true);
      expect(swing.zone).toBe('GOLDEN_POCKET');

      expect(computeStaticSwingFibonacci(20, 10, 21, 'up').zone).toBe(
        'ABOVE_SWING',
      );
      expect(computeStaticSwingFibonacci(20, 10, 18, 'up').zone).toBe(
        'SHALLOW',
      );
      expect(computeStaticSwingFibonacci(20, 10, 16, 'up').zone).toBe(
        'MODERATE',
      );
      expect(computeStaticSwingFibonacci(20, 10, 12, 'up').zone).toBe('DEEP');
      expect(computeStaticSwingFibonacci(20, 10, 9, 'up').zone).toBe(
        'INVALIDATED',
      );
    });

    it('throws IndicatorInputError when high <= low', () => {
      expect(() => computeFibonacciLevels(10, 20, 'up')).toThrow(
        IndicatorInputError,
      );
      expect(() => computeFibonacciLevels(10, 10, 'up')).toThrow(
        IndicatorInputError,
      );
    });
  });

  describe('TRADINGVIEW_FIB_STYLES', () => {
    it('defines official TradingView color codes and translucent fills', () => {
      expect(TRADINGVIEW_FIB_STYLES['0'].color).toBe('#787B86');
      expect(TRADINGVIEW_FIB_STYLES['0.236'].color).toBe('#F23645');
      expect(TRADINGVIEW_FIB_STYLES['0.382'].color).toBe('#FF9800');
      expect(TRADINGVIEW_FIB_STYLES['0.5'].color).toBe('#4CAF50');
      expect(TRADINGVIEW_FIB_STYLES['0.618'].color).toBe('#089981');
      expect(TRADINGVIEW_FIB_STYLES['0.618'].fill).toBe(
        'rgba(8, 153, 129, 0.12)',
      );
      expect(TRADINGVIEW_FIB_STYLES['0.786'].color).toBe('#2962FF');
      expect(TRADINGVIEW_FIB_STYLES['1'].color).toBe('#787B86');
      expect(TRADINGVIEW_FIB_STYLES['1.618'].color).toBe('#9C27B0');
    });
  });
});
