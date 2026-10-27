import { IndicatorInputError } from '../errors';
import {
  computeCalmarRatio,
  computeComprehensiveRiskPerformance,
  computeConditionalVaR,
  computeDailyReturns,
  computeDrawdownSeries,
  computeLiquidityDelayPenalty,
  computeMaxDrawdown,
  computeOverfittingRatio,
  computePerformanceSummary,
  computePortfolioSharpeRatio,
  computeSharpeRatio,
  computeUnderwaterDuration,
  computeValueAtRisk,
  MAX_CALMAR_RATIO_CAP,
} from './risk-performance';
import type { PortfolioSharpeInput } from './risk-performance.types';

describe('Risk & Performance Analytics Engine (Rust Polars SIMD)', () => {
  describe('computeDailyReturns', () => {
    it('returns empty result when nav length is less than 2', () => {
      expect(computeDailyReturns([])).toEqual({ begIndex: 0, returns: [] });
      expect(computeDailyReturns([100])).toEqual({ begIndex: 1, returns: [] });
    });

    it('computes daily return series with double-track offset alignment', () => {
      const navSeries = [100, 105, 102.9, 108.045];
      const res = computeDailyReturns(navSeries);
      expect(res.begIndex).toBe(1);
      expect(res.returns).toHaveLength(3);
      expect(res.returns[0]).toBeCloseTo(0.05, 4);
      expect(res.returns[1]).toBeCloseTo(-0.02, 4);
      expect(res.returns[2]).toBeCloseTo(0.05, 4);
    });
  });

  describe('computeDrawdownSeries & computeMaxDrawdown', () => {
    it('handles empty NAV series', () => {
      const res = computeDrawdownSeries([]);
      expect(res.maxDrawdown).toBe(0);
      expect(res.peakSeries).toEqual([]);
      expect(res.drawdownSeries).toEqual([]);
      expect(computeMaxDrawdown([])).toBe(0);
    });

    it('computes running peaks and drawdowns for fluctuating NAV', () => {
      const navSeries = [100, 120, 90, 110, 80, 130];
      const res = computeDrawdownSeries(navSeries);
      expect(res.peakSeries).toEqual([100, 120, 120, 120, 120, 130]);
      expect(res.drawdownSeries[0]).toBeCloseTo(0, 4);
      expect(res.drawdownSeries[1]).toBeCloseTo(0, 4);
      expect(res.drawdownSeries[2]).toBeCloseTo(0.25, 4); // (120 - 90) / 120 = 0.25
      expect(res.drawdownSeries[4]).toBeCloseTo(0.3333, 4); // (120 - 80) / 120 = 0.3333
      expect(res.maxDrawdown).toBeCloseTo(0.3333, 4);
      expect(computeMaxDrawdown(navSeries)).toBeCloseTo(0.3333, 4);
    });
  });

  describe('computeSharpeRatio', () => {
    it('returns 0 when returns length is less than 2 or std is 0', () => {
      expect(computeSharpeRatio([])).toBe(0);
      expect(computeSharpeRatio([0.01])).toBe(0);
      expect(computeSharpeRatio([0.01, 0.01, 0.01])).toBe(0);
    });

    it('computes annualized Sharpe ratio with default 2% risk-free rate', () => {
      const returns = [0.01, -0.005, 0.02, 0.015, -0.01, 0.025, 0.005];
      const sharpe = computeSharpeRatio(returns);
      expect(sharpe).toBeGreaterThan(0);
      expect(Number.isFinite(sharpe)).toBe(true);
    });
  });

  describe('computePortfolioSharpeRatio (多品种协方差口径综合夏普)', () => {
    it('degenerates to single-series Sharpe when N=1 (exact equality)', () => {
      const returns = [0.01, -0.005, 0.02, 0.015, -0.01, 0.025, 0.005];
      const series: PortfolioSharpeInput[] = [
        { securityCode: '000001.SZ', returns },
      ];
      expect(computePortfolioSharpeRatio(series)).toBe(
        computeSharpeRatio(returns),
      );
    });

    it('reduces portfolio volatility via covariance offset (negatively correlated assets)', () => {
      // 两资产均值同为 0.005、样本 std 同为 ~0.0238，但负相关：
      // 等权组合波动 = σ·sqrt((1+ρ)/2) < σ → 组合夏普必然高于任一单资产夏普
      const a = [0.02, -0.01, 0.03, -0.02];
      const b = [-0.02, 0.03, -0.01, 0.02];
      const portfolioSharpe = computePortfolioSharpeRatio([
        { securityCode: 'A', returns: a },
        { securityCode: 'B', returns: b },
      ]);
      expect(portfolioSharpe).toBeGreaterThan(computeSharpeRatio(a));
      expect(portfolioSharpe).toBeGreaterThan(computeSharpeRatio(b));

      // 精确值：组合序列 [0, 0.01, 0.01, 0]，mean=0.005，var(ddof=1)=1e-4/3
      const expected =
        ((0.005 - 0.02 / 250) / Math.sqrt(1e-4 / 3)) * Math.sqrt(250);
      expect(portfolioSharpe).toBeCloseTo(expected, 3);
    });

    it('dilutes returns with zero-filled missing days (cash semantics)', () => {
      // A 中间日停牌按 0 收益（持现金）填充，组合收益被稀释
      const series: PortfolioSharpeInput[] = [
        { securityCode: 'A', returns: [0.01, 0, 0.01] },
        { securityCode: 'B', returns: [0.01, 0.01, 0.01] },
      ];
      // 组合序列 = [0.01, 0.005, 0.01]
      const portfolio = [0.01, 0.005, 0.01];
      expect(computePortfolioSharpeRatio(series)).toBe(
        computeSharpeRatio(portfolio),
      );
    });

    it('returns 0 for empty input or single-point returns, and rejects length mismatch', () => {
      expect(computePortfolioSharpeRatio([])).toBe(0);
      expect(
        computePortfolioSharpeRatio([
          { securityCode: 'A', returns: [0.01] },
          { securityCode: 'B', returns: [0.02] },
        ]),
      ).toBe(0);
      expect(() =>
        computePortfolioSharpeRatio([
          { securityCode: 'A', returns: [0.01, 0.02, 0.03] },
          { securityCode: 'B', returns: [0.01, 0.02] },
        ]),
      ).toThrow(IndicatorInputError);
    });
  });

  describe('computeCalmarRatio', () => {
    it('handles zero drawdown safely', () => {
      expect(computeCalmarRatio(0.2, 0)).toBe(MAX_CALMAR_RATIO_CAP);
      expect(computeCalmarRatio(-0.1, 0)).toBe(0);
    });

    it('computes return over max drawdown ratio', () => {
      expect(computeCalmarRatio(0.3, 0.15)).toBe(2.0);
      expect(computeCalmarRatio(-0.15, 0.3)).toBe(-0.5);
    });
  });

  describe('computePerformanceSummary', () => {
    it('handles empty NAV series', () => {
      const summary = computePerformanceSummary([], []);
      expect(summary.totalReturn).toBe(0);
      expect(summary.tradeCount).toBe(0);
    });

    it('computes full performance summary for multi-trade sequence', () => {
      const navSeries = [1000000, 1050000, 1020000, 1100000];
      const trades = [
        { realizedPnl: 50000, returnRatio: 0.05 },
        { realizedPnl: -30000, returnRatio: -0.03 },
        { realizedPnl: 80000, returnRatio: 0.08 },
      ];
      const summary = computePerformanceSummary(navSeries, trades);
      expect(summary.totalReturn).toBe(0.1);
      expect(summary.tradeCount).toBe(3);
      expect(summary.winRate).toBeCloseTo(0.6667, 4);
      expect(summary.profitLossRatio).toBeCloseTo(130000 / 30000, 4);
      expect(summary.maxDrawdown).toBeGreaterThan(0);
    });
  });

  describe('computeValueAtRisk (VaR)', () => {
    it('returns 0 for empty or invalid series', () => {
      expect(computeValueAtRisk([])).toBe(0);
    });

    it('throws IndicatorInputError for invalid confidence levels', () => {
      expect(() => computeValueAtRisk([0.01, -0.02], 0)).toThrow(
        IndicatorInputError,
      );
      expect(() => computeValueAtRisk([0.01, -0.02], 1.0)).toThrow(
        IndicatorInputError,
      );
    });

    it('returns 0 when all returns are non-negative (bull market boundary)', () => {
      const bullReturns = [0.01, 0.02, 0.005, 0.03, 0.015];
      expect(computeValueAtRisk(bullReturns, 0.95)).toBe(0);
    });

    it('computes vectorized VaR correctly for empirical loss distribution', () => {
      const returns = [
        -0.09, -0.07, -0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.04, 0.05,
      ];
      const var95 = computeValueAtRisk(returns, 0.95);
      expect(var95).toBeLessThan(0);
      expect(var95).toBeCloseTo(-0.09, 2);
    });

    it('handles extreme crash sequence with uniform limit-down losses', () => {
      const crashReturns = [-0.1, -0.1, -0.1, -0.1, -0.1];
      expect(computeValueAtRisk(crashReturns, 0.95)).toBeCloseTo(-0.1, 4);
    });
  });

  describe('computeConditionalVaR (CVaR / Expected Shortfall)', () => {
    it('returns 0 for empty series', () => {
      expect(computeConditionalVaR([])).toBe(0);
    });

    it('returns 0 when all returns are non-negative', () => {
      expect(computeConditionalVaR([0.01, 0.02, 0.03])).toBe(0);
    });

    it('computes mean of losses at or exceeding the VaR threshold', () => {
      const returns = [
        -0.1, -0.08, -0.06, -0.04, -0.02, 0.01, 0.02, 0.03, 0.04, 0.05,
      ];
      const var90 = computeValueAtRisk(returns, 0.9);
      const cvar90 = computeConditionalVaR(returns, 0.9);
      expect(cvar90).toBeLessThanOrEqual(var90);
    });
  });

  describe('computeUnderwaterDuration', () => {
    it('returns 0 for empty, single point, or strictly non-decreasing NAV series', () => {
      expect(computeUnderwaterDuration([])).toBe(0);
      expect(computeUnderwaterDuration([100])).toBe(0);
      expect(computeUnderwaterDuration([100, 101, 102, 105])).toBe(0);
    });

    it('computes continuous underwater duration during monotonic descent', () => {
      const navSeries = [100, 95, 90, 85, 80];
      expect(computeUnderwaterDuration(navSeries)).toBe(4);
    });

    it('computes duration for drawdown followed by full recovery', () => {
      const navSeries = [100, 90, 85, 95, 105, 110];
      expect(computeUnderwaterDuration(navSeries)).toBe(3);
    });

    it('finds the maximum continuous duration among multiple drawdown episodes', () => {
      const navSeries = [
        100,
        95,
        98,
        105, // Episode 1: 2 bars underwater
        100,
        90,
        92,
        94,
        98,
        108, // Episode 2: 5 bars underwater
        105,
        115, // Episode 3: 1 bar underwater
      ];
      expect(computeUnderwaterDuration(navSeries)).toBe(5);
    });
  });

  describe('computeLiquidityDelayPenalty', () => {
    it('returns 0 for empty trades or trades without blocked delay', () => {
      expect(computeLiquidityDelayPenalty([])).toBe(0);
      expect(
        computeLiquidityDelayPenalty([
          { realizedPnl: 100, returnRatio: 0.01 },
          { realizedPnl: -50, returnRatio: -0.005, isBlockedDelayed: false },
        ]),
      ).toBe(0);
    });

    it('sums slippage loss for trades blocked and delayed by limit-down', () => {
      const trades = [
        { realizedPnl: 100, returnRatio: 0.01 },
        {
          realizedPnl: -500,
          returnRatio: -0.05,
          isBlockedDelayed: true,
          slippageLoss: 1250.5,
        },
        {
          realizedPnl: -800,
          returnRatio: -0.08,
          isBlockedDelayed: true,
          slippageLoss: 749.5,
        },
      ];
      expect(computeLiquidityDelayPenalty(trades)).toBe(2000.0);
    });
  });

  describe('computeOverfittingRatio', () => {
    it('returns 0 when train Sharpe is zero, negative, or invalid', () => {
      expect(computeOverfittingRatio(0, 1.5)).toBe(0);
      expect(computeOverfittingRatio(-0.5, 1.5)).toBe(0);
      expect(computeOverfittingRatio(NaN, 1.5)).toBe(0);
    });

    it('returns 0 when test Sharpe is zero or negative', () => {
      expect(computeOverfittingRatio(2.0, 0)).toBe(0);
      expect(computeOverfittingRatio(2.0, -0.5)).toBe(0);
    });

    it('computes decay ratio as testSharpe / trainSharpe', () => {
      expect(computeOverfittingRatio(2.0, 1.5)).toBe(0.75);
    });

    it('caps ratio at 999.0 when test Sharpe vastly exceeds train Sharpe', () => {
      expect(computeOverfittingRatio(0.001, 10.0)).toBe(999.0);
    });
  });

  describe('computeComprehensiveRiskPerformance (All-in-One Report)', () => {
    it('computes routine performance and extreme stress metrics simultaneously', () => {
      const navSeries = [1000000, 1050000, 950000, 980000, 1100000];
      const trades = [
        { realizedPnl: 50000, returnRatio: 0.05 },
        {
          realizedPnl: -100000,
          returnRatio: -0.095,
          isBlockedDelayed: true,
          slippageLoss: 15000,
        },
        { realizedPnl: 120000, returnRatio: 0.12 },
      ];

      const report = computeComprehensiveRiskPerformance(navSeries, trades);
      expect(report.totalReturn).toBe(0.1);
      expect(report.tradeCount).toBe(3);
      expect(report.var95).toBeLessThan(0);
      expect(report.cvar95).toBeLessThanOrEqual(report.var95);
      expect(report.maxUnderwaterDuration).toBe(2);
      expect(report.totalLiquidityDelayPenalty).toBe(15000);
    });
  });
});
