import { IndicatorInputError } from '../errors';
import {
  computeKissStatesSeries,
  computeKissStatesObservation,
} from './kiss-states';

describe('Kiss States Operator (kiss-states)', () => {
  describe('Input validation & edge cases', () => {
    it('returns empty series when close length is less than slowPeriod', () => {
      const shortCloses = [10, 11, 12, 13, 14];
      const result = computeKissStatesSeries(shortCloses, {
        fastPeriod: 5,
        slowPeriod: 20,
      });

      expect(result.begIndex).toBe(5);
      expect(result.fastMa).toHaveLength(0);
      expect(result.slowMa).toHaveLength(0);
      expect(result.entanglementIndex).toHaveLength(0);
      expect(result.kissTypes).toHaveLength(0);
    });

    it('throws IndicatorInputError when observation is requested with insufficient closes', () => {
      const shortCloses = [10, 11, 12];
      expect(() =>
        computeKissStatesObservation(shortCloses, {
          fastPeriod: 5,
          slowPeriod: 20,
        }),
      ).toThrow(IndicatorInputError);
    });

    it('validates period constraints', () => {
      expect(() =>
        computeKissStatesSeries([1, 2, 3], { fastPeriod: 0 }),
      ).toThrow(IndicatorInputError);
      expect(() =>
        computeKissStatesSeries([1, 2, 3], { fastPeriod: 10, slowPeriod: 10 }),
      ).toThrow(IndicatorInputError);
      expect(() =>
        computeKissStatesSeries([1, 2, 3], { fastPeriod: 10, slowPeriod: 5 }),
      ).toThrow(IndicatorInputError);
      expect(() =>
        computeKissStatesSeries([1, 2, 3], { windowSize: 0 }),
      ).toThrow(IndicatorInputError);
    });

    it('handles flat prices where fast and slow lines coincide (MEI = 1.0, WET)', () => {
      const flat = new Array(30).fill(100);
      const result = computeKissStatesSeries(flat, {
        fastPeriod: 5,
        slowPeriod: 20,
      });

      expect(result.fastMa).toHaveLength(11);
      expect(result.slowMa).toHaveLength(11);
      expect(result.entanglementIndex[0]).toBeCloseTo(1.0, 5);
      expect(result.fastMa[0]).toBe(100);
      expect(result.slowMa[0]).toBe(100);
      expect(result.kissTypes[10]).toBe('WET');
    });

    it('is deterministic and does not mutate input array', () => {
      const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
      const snapshot = [...closes];
      const res1 = computeKissStatesSeries(closes);
      const res2 = computeKissStatesSeries(closes);

      expect(res1).toEqual(res2);
      expect(closes).toEqual(snapshot);
    });
  });

  describe('Kiss Types Classification', () => {
    it('detects FLYING (飞吻): fast MA approaches slow MA closely without crossing then pulls away', () => {
      // Build a series: slow base ~ 100.
      // Fast line is initially above (~103), dips to ~100.4 (diffRatio ~ 0.004 <= 0.006), then pulls back up to 105.
      const initial = new Array(20).fill(100);
      // Create dip that comes within 0.5% but does not cross
      const dipAndBounce = [
        103, 102.5, 102, 101.5, 101, 100.5, 100.4, 100.5, 101.5, 103, 105, 106,
      ];
      const closes = [...initial, ...dipAndBounce];

      const result = computeKissStatesSeries(closes, {
        fastPeriod: 3,
        slowPeriod: 15,
        windowSize: 8,
      });

      const types = result.kissTypes;
      expect(types).toContain('FLYING');
    });

    it('detects LIP (唇吻): fast MA crosses slow MA exactly once and moves through', () => {
      // Prices start descending steadily so fast MA is below slow MA:
      // slowPeriod: 15, fastPeriod: 3
      const desc = Array.from({ length: 20 }, (_, i) => 120 - i * 1.5);
      // Then strong reversal up, crossing slow MA once
      const rise = [95, 100, 105, 110, 115, 120, 125, 130];
      const closes = [...desc, ...rise];

      const result = computeKissStatesSeries(closes, {
        fastPeriod: 3,
        slowPeriod: 15,
        windowSize: 6,
      });

      const types = result.kissTypes;
      expect(types).toContain('LIP');
    });

    it('detects WET (湿吻): fast MA repeatedly crosses slow MA', () => {
      // Oscillate around 100
      const initial = new Array(20).fill(100);
      const oscillate = [105, 95, 105, 95, 105, 95, 105, 95, 105, 95];
      const closes = [...initial, ...oscillate];

      const result = computeKissStatesSeries(closes, {
        fastPeriod: 2,
        slowPeriod: 10,
        windowSize: 8,
      });

      const types = result.kissTypes;
      expect(types).toContain('WET');
    });

    it('detects NONE (无吻): clear diverging trend with large distance', () => {
      // Strong continuous uptrend: fast far above slow
      const closes = Array.from({ length: 40 }, (_, i) => 100 + i * 5);

      const result = computeKissStatesSeries(closes, {
        fastPeriod: 5,
        slowPeriod: 20,
        windowSize: 10,
      });

      // Tail state should be NONE as gap is wide (> 5%)
      const lastType = result.kissTypes.at(-1);
      expect(lastType).toBe('NONE');
    });
  });

  describe('computeKissStatesObservation', () => {
    it('matches the trailing values of computeKissStatesSeries', () => {
      const closes = Array.from(
        { length: 50 },
        (_, i) => 100 + Math.sin(i / 2) * 5 + i * 0.2,
      );
      const series = computeKissStatesSeries(closes);
      const obs = computeKissStatesObservation(closes);

      expect(obs.fastMa).toBeCloseTo(series.fastMa.at(-1)!, 10);
      expect(obs.slowMa).toBeCloseTo(series.slowMa.at(-1)!, 10);
      expect(obs.entanglementIndex).toBeCloseTo(
        series.entanglementIndex.at(-1)!,
        10,
      );
      expect(obs.kissType).toBe(series.kissTypes.at(-1));
    });
  });
});
