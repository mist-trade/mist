import { type ChanK } from '@app/chancore';
import {
  ChanTacticsContext,
  TacticalAction,
  TacticalQuadrant,
} from '../contracts/chan-four-quadrant-tactics.interface';
import {
  StandardChanTactics,
  deriveMacroTrendFromHigherMacd,
  getHigherPeriodRatio,
  resampleToHigherKlines,
} from './standard-chan-tactics';

function createMockKlines(
  count: number,
  trend: 'up' | 'down' | 'flat' = 'up',
): ChanK[] {
  const klines: ChanK[] = [];
  let basePrice = 100;
  const now = new Date('2026-09-01T09:30:00.000Z');

  for (let i = 0; i < count; i++) {
    const time = new Date(now.getTime() + i * 30 * 60 * 1000);
    const delta = trend === 'up' ? 0.5 : trend === 'down' ? -0.5 : 0;
    basePrice += delta;

    klines.push({
      id: i + 1,
      symbol: '000001',
      time,
      open: basePrice - 0.2,
      high: basePrice + 0.5,
      low: basePrice - 0.5,
      close: basePrice,
      volume: '1000',
      amount: '100000',
    });
  }
  return klines;
}

describe('StandardChanTactics & Macro Trend Evaluator', () => {
  describe('getHigherPeriodRatio & resampleToHigherKlines', () => {
    it('correctly maps period string to higher period ratio', () => {
      expect(getHigherPeriodRatio('1m')).toBe(5);
      expect(getHigherPeriodRatio('5m')).toBe(6);
      expect(getHigherPeriodRatio('15m')).toBe(4);
      expect(getHigherPeriodRatio('30m')).toBe(4);
      expect(getHigherPeriodRatio('60m')).toBe(4);
      expect(getHigherPeriodRatio('1d')).toBe(5);
      expect(getHigherPeriodRatio(undefined)).toBe(4);
    });

    it('returns empty array when klines count is less than ratio', () => {
      const klines = createMockKlines(3);
      expect(resampleToHigherKlines(klines, '30m')).toEqual([]);
    });

    it('resamples klines into higher level bars', () => {
      const klines = createMockKlines(10);
      const resampled = resampleToHigherKlines(klines, '30m'); // ratio = 4
      expect(resampled.length).toBe(2);
      expect(resampled[0].id).toBe(1);
      expect(resampled[1].id).toBe(2);
    });
  });

  describe('deriveMacroTrendFromHigherMacd', () => {
    it('returns UP when parentKlines is in a strong uptrend (MACD golden cross)', () => {
      const parentKlines = createMockKlines(60, 'up');
      const ctx: ChanTacticsContext = {
        symbol: '000001',
        period: '30m',
        klines: createMockKlines(20),
        parentKlines,
        bis: [],
        zhongshus: [],
        timestamp: new Date(),
      };

      const trend = deriveMacroTrendFromHigherMacd(ctx);
      expect(trend).toBe('UP');
    });

    it('returns DOWN when parentKlines is in a strong downtrend (MACD dead cross)', () => {
      const parentKlines = createMockKlines(60, 'down');
      const ctx: ChanTacticsContext = {
        symbol: '000001',
        period: '30m',
        klines: createMockKlines(20),
        parentKlines,
        bis: [],
        zhongshus: [],
        timestamp: new Date(),
      };

      const trend = deriveMacroTrendFromHigherMacd(ctx);
      expect(trend).toBe('DOWN');
    });
  });

  describe('StandardChanTactics Four-Quadrant Decisions', () => {
    const tactics = new StandardChanTactics();

    it('verifies metadata', () => {
      expect(tactics.id).toBe('standard-chan-tactics');
      expect(tactics.name).toBe('Standard Chan Baseline Tactics');
    });

    it('handles empty klines gracefully', () => {
      const ctx: ChanTacticsContext = {
        symbol: '000001',
        period: '30m',
        klines: [],
        bis: [],
        zhongshus: [],
        timestamp: new Date(),
      };
      const leftBuy = tactics.evaluateLeftBuy(ctx);
      expect(leftBuy.triggered).toBe(false);
      expect(leftBuy.reason).toContain('K线数量不足');
    });

    describe('LeftBuy: Dynamic Zhongshu Gate by Higher MACD Trend', () => {
      it('blocks 1-buy with only 1 zhongshu in a DOWN trend (dead cross)', () => {
        const klines = createMockKlines(10);
        const ctx: ChanTacticsContext = {
          symbol: '000001',
          period: '30m',
          macroTrend: 'DOWN',
          klines,
          bis: [],
          zhongshus: [],
          timestamp: new Date(),
          candidateBsp: {
            type: 'first_buy',
            zhongshuCount: 1, // Only 1 zhongshu in DOWN trend
            price: 95.0,
            time: new Date(),
          },
        };

        const decision = tactics.evaluateLeftBuy(ctx);
        expect(decision.triggered).toBe(false);
        expect(decision.reason).toContain('下跌趋势');
        expect(decision.reason).toContain('严禁单中枢抄底');
      });

      it('permits 1-buy with >= 2 zhongshus in a DOWN trend (exhaustion)', () => {
        const klines = createMockKlines(10);
        const ctx: ChanTacticsContext = {
          symbol: '000001',
          period: '30m',
          macroTrend: 'DOWN',
          klines,
          bis: [],
          zhongshus: [],
          timestamp: new Date(),
          candidateBsp: {
            type: 'first_buy',
            zhongshuCount: 2, // 2 zhongshus in DOWN trend
            price: 90.0,
            time: new Date(),
          },
        };

        const decision = tactics.evaluateLeftBuy(ctx);
        expect(decision.triggered).toBe(true);
        expect(decision.action).toBe(TacticalAction.OpenLong);
        expect(decision.confidence).toBe(80);
        expect(decision.reason).toContain('2中枢终极衰竭趋势背驰抄底');
      });

      it('permits 1-buy with 1 zhongshu in an UP trend (golden cross pullback)', () => {
        const klines = createMockKlines(10);
        const ctx: ChanTacticsContext = {
          symbol: '000001',
          period: '30m',
          macroTrend: 'UP',
          klines,
          bis: [],
          zhongshus: [],
          timestamp: new Date(),
          candidateBsp: {
            type: 'first_buy',
            zhongshuCount: 1, // 1 zhongshu in UP trend
            price: 105.0,
            time: new Date(),
          },
        };

        const decision = tactics.evaluateLeftBuy(ctx);
        expect(decision.triggered).toBe(true);
        expect(decision.action).toBe(TacticalAction.OpenLong);
        expect(decision.confidence).toBe(90);
        expect(decision.reason).toContain('上一级别MACD金叉');
        expect(decision.reason).toContain('1中枢底背驰买入');
      });
    });

    describe('RightBuy: Second & Third Buy', () => {
      it('triggers RightBuy for candidate second_buy', () => {
        const ctx: ChanTacticsContext = {
          symbol: '000001',
          period: '30m',
          macroTrend: 'UP',
          klines: createMockKlines(10),
          bis: [],
          zhongshus: [],
          timestamp: new Date(),
          candidateBsp: {
            type: 'second_buy',
            zhongshuCount: 1,
            price: 102.0,
            time: new Date(),
          },
        };

        const decision = tactics.evaluateRightBuy(ctx);
        expect(decision.triggered).toBe(true);
        expect(decision.quadrant).toBe(TacticalQuadrant.RightBuy);
        expect(decision.action).toBe(TacticalAction.OpenLong);
        expect(decision.confidence).toBe(95);
      });
    });

    describe('LeftSell: Prevents premature exit in UP trend', () => {
      it('blocks 1-sell with only 1 zhongshu in an UP trend', () => {
        const ctx: ChanTacticsContext = {
          symbol: '000001',
          period: '30m',
          macroTrend: 'UP',
          klines: createMockKlines(10),
          bis: [],
          zhongshus: [],
          timestamp: new Date(),
          candidateBsp: {
            type: 'first_sell',
            zhongshuCount: 1, // Only 1 zhongshu in UP trend
            price: 110.0,
            time: new Date(),
          },
        };

        const decision = tactics.evaluateLeftSell(ctx);
        expect(decision.triggered).toBe(false);
        expect(decision.reason).toContain('强上升趋势');
        expect(decision.reason).toContain('防过早卖飞');
      });

      it('permits 1-sell with 1 zhongshu in a DOWN trend', () => {
        const ctx: ChanTacticsContext = {
          symbol: '000001',
          period: '30m',
          macroTrend: 'DOWN',
          klines: createMockKlines(10),
          bis: [],
          zhongshus: [],
          timestamp: new Date(),
          candidateBsp: {
            type: 'first_sell',
            zhongshuCount: 1,
            price: 98.0,
            time: new Date(),
          },
        };

        const decision = tactics.evaluateLeftSell(ctx);
        expect(decision.triggered).toBe(true);
        expect(decision.action).toBe(TacticalAction.CloseLong);
        expect(decision.confidence).toBe(92);
        expect(decision.reason).toContain('顺势空头压制');
      });
    });

    describe('RightSell: Second & Third Sell', () => {
      it('triggers RightSell for candidate third_sell', () => {
        const ctx: ChanTacticsContext = {
          symbol: '000001',
          period: '30m',
          macroTrend: 'DOWN',
          klines: createMockKlines(10),
          bis: [],
          zhongshus: [],
          timestamp: new Date(),
          candidateBsp: {
            type: 'third_sell',
            zhongshuCount: 1,
            price: 92.0,
            time: new Date(),
          },
        };

        const decision = tactics.evaluateRightSell(ctx);
        expect(decision.triggered).toBe(true);
        expect(decision.quadrant).toBe(TacticalQuadrant.RightSell);
        expect(decision.action).toBe(TacticalAction.CloseLong);
      });
    });
  });
});
