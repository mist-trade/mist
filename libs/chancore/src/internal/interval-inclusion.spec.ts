import { TrendDirection } from '../contracts';
import {
  checkIntervalInclusion,
  hasTruePhysicalGap,
  mergePriceInterval,
  resolveEffectiveTrend,
} from './interval-inclusion';

describe('interval-inclusion', () => {
  describe('checkIntervalInclusion', () => {
    it('detects no inclusion for disjoint intervals', () => {
      const a = { high: 10, low: 5 };
      const b = { high: 15, low: 11 };
      const res = checkIntervalInclusion(a, b);
      expect(res.hasInclusion).toBe(false);
      expect(res.aContainsB).toBe(false);
      expect(res.bContainsA).toBe(false);
    });

    it('detects a contains b', () => {
      const a = { high: 20, low: 5 };
      const b = { high: 15, low: 10 };
      const res = checkIntervalInclusion(a, b);
      expect(res.hasInclusion).toBe(true);
      expect(res.aContainsB).toBe(true);
      expect(res.bContainsA).toBe(false);
    });

    it('detects b contains a', () => {
      const a = { high: 15, low: 10 };
      const b = { high: 20, low: 5 };
      const res = checkIntervalInclusion(a, b);
      expect(res.hasInclusion).toBe(true);
      expect(res.aContainsB).toBe(false);
      expect(res.bContainsA).toBe(true);
    });

    it('detects identical intervals as mutual inclusion', () => {
      const a = { high: 10, low: 5 };
      const b = { high: 10, low: 5 };
      const res = checkIntervalInclusion(a, b);
      expect(res.hasInclusion).toBe(true);
      expect(res.aContainsB).toBe(true);
      expect(res.bContainsA).toBe(true);
    });
  });

  describe('resolveEffectiveTrend', () => {
    it('returns provided trend when not None', () => {
      const a = { high: 10, low: 5 };
      const b = { high: 12, low: 6 };
      expect(resolveEffectiveTrend(a, b, TrendDirection.Up)).toBe(
        TrendDirection.Up,
      );
      expect(resolveEffectiveTrend(a, b, TrendDirection.Down)).toBe(
        TrendDirection.Down,
      );
    });

    it('resolves Up when midB > midA and trend is None', () => {
      const a = { high: 10, low: 5 }; // mid = 7.5
      const b = { high: 12, low: 6 }; // mid = 9.0
      expect(resolveEffectiveTrend(a, b, TrendDirection.None)).toBe(
        TrendDirection.Up,
      );
    });

    it('resolves Down when midB < midA and trend is None', () => {
      const a = { high: 12, low: 6 }; // mid = 9.0
      const b = { high: 10, low: 5 }; // mid = 7.5
      expect(resolveEffectiveTrend(a, b, TrendDirection.None)).toBe(
        TrendDirection.Down,
      );
    });

    it('resolves None when midB === midA and trend is None', () => {
      const a = { high: 10, low: 5 }; // mid = 7.5
      const b = { high: 9, low: 6 }; // mid = 7.5
      expect(resolveEffectiveTrend(a, b, TrendDirection.None)).toBe(
        TrendDirection.None,
      );
    });
  });

  describe('mergePriceInterval', () => {
    it('returns not merged if no inclusion exists', () => {
      const a = { high: 10, low: 5 };
      const b = { high: 15, low: 8 }; // partial overlap without containment
      const res = mergePriceInterval(a, b, TrendDirection.Up);
      expect(res.merged).toBe(false);
      expect(res.newHigh).toBe(0);
      expect(res.newLow).toBe(0);
    });

    it('returns not merged if trend is None and middle points are equal', () => {
      const a = { high: 10, low: 5 };
      const b = { high: 9, low: 6 }; // containment, mid both 7.5
      const res = mergePriceInterval(a, b, TrendDirection.None);
      expect(res.merged).toBe(false);
    });

    it('merges upward by taking max high and max low (取高高)', () => {
      const a = { high: 20, low: 5 };
      const b = { high: 18, low: 10 };
      const res = mergePriceInterval(a, b, TrendDirection.Up);
      expect(res.merged).toBe(true);
      expect(res.newHigh).toBe(20);
      expect(res.newLow).toBe(10);
    });

    it('merges downward by taking min high and min low (取低低)', () => {
      const a = { high: 20, low: 5 };
      const b = { high: 18, low: 10 };
      const res = mergePriceInterval(a, b, TrendDirection.Down);
      expect(res.merged).toBe(true);
      expect(res.newHigh).toBe(18);
      expect(res.newLow).toBe(5);
    });

    it('merges with trend resolved from middle points when trend is None', () => {
      const a = { high: 20, low: 5 }; // mid = 12.5
      const b = { high: 18, low: 12 }; // mid = 15.0 -> Up
      const res = mergePriceInterval(a, b, TrendDirection.None);
      expect(res.merged).toBe(true);
      expect(res.newHigh).toBe(20);
      expect(res.newLow).toBe(12);
    });
  });

  describe('hasTruePhysicalGap', () => {
    it('returns false when two feature strokes have overlapping price intervals', () => {
      // Overlapping intervals: [3922.58, 4025.70] and [3816.58, 4034.08]
      const biA = { high: 4025.7, low: 3922.58 };
      const biB = { high: 4034.08, low: 3816.58 };
      expect(hasTruePhysicalGap(biA, biB)).toBe(false);
    });

    it('returns true when two feature strokes have disjoint intervals with a true price gap', () => {
      // Upward gap: A=[10, 20], B=[25, 30]
      const biA = { high: 20, low: 10 };
      const biB = { high: 30, low: 25 };
      expect(hasTruePhysicalGap(biA, biB)).toBe(true);

      // Downward gap: A=[30, 40], B=[15, 25]
      const biC = { high: 40, low: 30 };
      const biD = { high: 25, low: 15 };
      expect(hasTruePhysicalGap(biC, biD)).toBe(true);
    });
  });
});
