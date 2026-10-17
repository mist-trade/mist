import {
  computeCalmarRatio,
  computeDailyReturns,
  computeDrawdownSeries,
  computeMaxDrawdown,
  computePerformanceSummary,
  computeSharpeRatio,
} from './performance';

describe('Performance Indicators (Rust Polars SIMD Engine)', () => {
  describe('computeDailyReturns', () => {
    it('returns empty result when NAV series has fewer than 2 data points', () => {
      expect(computeDailyReturns([])).toEqual({ begIndex: 0, returns: [] });
      expect(computeDailyReturns([100])).toEqual({ begIndex: 1, returns: [] });
    });

    it('computes vectorized daily percentage returns correctly', () => {
      const navSeries = [100, 105, 102.9];
      const res = computeDailyReturns(navSeries);
      expect(res.begIndex).toBe(1);
      expect(res.returns).toHaveLength(2);
      expect(res.returns[0]).toBeCloseTo(0.05, 5);
      expect(res.returns[1]).toBeCloseTo(-0.02, 5);
    });
  });

  describe('computeDrawdownSeries & computeMaxDrawdown', () => {
    it('handles empty NAV series gracefully', () => {
      const res = computeDrawdownSeries([]);
      expect(res.maxDrawdown).toBe(0);
      expect(res.drawdownSeries).toHaveLength(0);
      expect(computeMaxDrawdown([])).toBe(0);
    });

    it('returns 0 max drawdown for strictly non-decreasing NAV series', () => {
      const navSeries = [100, 102, 105, 105, 110];
      const res = computeDrawdownSeries(navSeries);
      expect(res.maxDrawdown).toBe(0);
      for (const dd of res.drawdownSeries) {
        expect(dd).toBe(0);
      }
    });

    it('calculates historical peak and max drawdown accurately', () => {
      // 100 -> 120 (peak) -> 96 (trough, -20%) -> 110 -> 130 (new peak)
      const navSeries = [100, 120, 96, 110, 130];
      const res = computeDrawdownSeries(navSeries);
      expect(res.peakSeries).toEqual([100, 120, 120, 120, 130]);
      expect(res.drawdownSeries[2]).toBeCloseTo(0.2, 5);
      expect(res.maxDrawdown).toBeCloseTo(0.2, 5);
      expect(computeMaxDrawdown(navSeries)).toBeCloseTo(0.2, 5);
    });
  });

  describe('computeSharpeRatio', () => {
    it('returns 0 for insufficient data points or zero variance', () => {
      expect(computeSharpeRatio([])).toBe(0);
      expect(computeSharpeRatio([0.01])).toBe(0);
      expect(computeSharpeRatio([0.01, 0.01, 0.01])).toBe(0);
    });

    it('computes annualized Sharpe ratio using sample standard deviation and excess return', () => {
      const returns = [0.01, 0.02, -0.01, 0.015, -0.005];
      const sharpe = computeSharpeRatio(returns, {
        annualRiskFreeRate: 0.02,
        tradingDaysPerYear: 250,
      });
      // Excess mean = 0.006 - (0.02 / 250) = 0.006 - 0.00008 = 0.00592
      // Std = 0.012942...
      // Sharpe = (0.00592 / 0.012942) * sqrt(250) ~ 0.4574 * 15.811388 ~ 7.23
      expect(sharpe).toBeGreaterThan(0);
      expect(sharpe).toBeCloseTo(7.2323, 2);
    });
  });

  describe('computeCalmarRatio', () => {
    it('returns 0 when max drawdown is zero or non-positive', () => {
      expect(computeCalmarRatio(0.15, 0)).toBe(0);
      expect(computeCalmarRatio(0.15, -0.05)).toBe(0);
    });

    it('returns 0 when annualized return is non-positive', () => {
      expect(computeCalmarRatio(0, 0.1)).toBe(0);
      expect(computeCalmarRatio(-0.05, 0.1)).toBe(0);
    });

    it('caps Calmar ratio at 999.0 when max drawdown is near zero (epsilon protection)', () => {
      expect(computeCalmarRatio(0.2, 1e-6)).toBe(999.0);
      expect(computeCalmarRatio(0.5, 0.00001)).toBe(999.0);
    });

    it('computes Calmar ratio as annualizedReturn / maxDrawdown', () => {
      const calmar = computeCalmarRatio(0.2, 0.1);
      expect(calmar).toBe(2.0);
    });
  });

  describe('computePerformanceSummary', () => {
    it('returns default zero statistics for empty NAV inputs', () => {
      const summary = computePerformanceSummary([], []);
      expect(summary.totalReturn).toBe(0);
      expect(summary.tradeCount).toBe(0);
      expect(summary.sharpeRatio).toBe(0);
    });

    it('generates complete performance and trade statistics', () => {
      const navSeries = [10000, 10200, 10100, 10500, 10800];
      const trades = [
        { realizedPnl: 300, returnRatio: 0.03 },
        { realizedPnl: -100, returnRatio: -0.01 },
        { realizedPnl: 400, returnRatio: 0.04 },
      ];

      const summary = computePerformanceSummary(navSeries, trades);
      expect(summary.totalReturn).toBe(0.08); // (10800 - 10000) / 10000 = 8%
      expect(summary.tradeCount).toBe(3);
      expect(summary.winRate).toBeCloseTo(2 / 3, 4); // 2 wins out of 3 = 0.6667
      expect(summary.profitLossRatio).toBe(7.0); // (300 + 400) / 100 = 7.0
      expect(summary.maxDrawdown).toBeGreaterThan(0);
      expect(summary.sharpeRatio).toBeGreaterThan(0);
    });
  });
});
