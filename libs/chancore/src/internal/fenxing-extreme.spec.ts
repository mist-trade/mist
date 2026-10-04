import {
  isBasicBottomFenxing,
  isBasicTopFenxing,
  isBottomExtremum,
  isTopExtremum,
} from './fenxing-extreme';

describe('fenxing-extreme', () => {
  describe('isTopExtremum & isBottomExtremum', () => {
    it('correctly detects top extremum', () => {
      const prev = { high: 10, low: 5 };
      const now = { high: 15, low: 8 };
      const next = { high: 12, low: 6 };
      expect(isTopExtremum(prev, now, next)).toBe(true);
      expect(isBottomExtremum(prev, now, next)).toBe(false);
    });

    it('correctly detects bottom extremum', () => {
      const prev = { high: 15, low: 10 };
      const now = { high: 12, low: 5 };
      const next = { high: 14, low: 8 };
      expect(isBottomExtremum(prev, now, next)).toBe(true);
      expect(isTopExtremum(prev, now, next)).toBe(false);
    });

    it('rejects flat tops or monotonic sequences', () => {
      const prev = { high: 10, low: 5 };
      const now = { high: 10, low: 6 };
      const next = { high: 9, low: 4 };
      expect(isTopExtremum(prev, now, next)).toBe(false);

      const monotonic = [
        { high: 10, low: 5 },
        { high: 12, low: 6 },
        { high: 14, low: 7 },
      ];
      expect(isTopExtremum(monotonic[0], monotonic[1], monotonic[2])).toBe(
        false,
      );
    });
  });

  describe('isBasicTopFenxing & isBasicBottomFenxing', () => {
    it('validates basic top fenxing when now.low > min(prev.low, next.low)', () => {
      const prev = { high: 10, low: 5 };
      const now = { high: 15, low: 7 };
      const next = { high: 12, low: 6 };
      expect(isBasicTopFenxing(prev, now, next)).toBe(true);

      // Fails condition 2: now.low <= min(prev.low, next.low)
      const invalidLowNow = { high: 15, low: 4 };
      expect(isBasicTopFenxing(prev, invalidLowNow, next)).toBe(false);
    });

    it('validates basic bottom fenxing when now.high < max(prev.high, next.high)', () => {
      const prev = { high: 15, low: 10 };
      const now = { high: 12, low: 5 };
      const next = { high: 14, low: 8 };
      expect(isBasicBottomFenxing(prev, now, next)).toBe(true);

      // Fails condition 2: now.high >= max(prev.high, next.high)
      const invalidHighNow = { high: 16, low: 5 };
      expect(isBasicBottomFenxing(prev, invalidHighNow, next)).toBe(false);
    });
  });
});
