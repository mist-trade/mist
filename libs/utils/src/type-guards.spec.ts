import { isRecord, hasExactKeys, isRfc3339 } from './type-guards';

describe('type-guards', () => {
  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });

    it('returns false for primitives, null and arrays', () => {
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord([])).toBe(false);
      expect(isRecord([1, 2])).toBe(false);
      expect(isRecord('string')).toBe(false);
      expect(isRecord(123)).toBe(false);
      expect(isRecord(true)).toBe(false);
    });
  });

  describe('hasExactKeys', () => {
    it('returns true when keys match exactly', () => {
      expect(hasExactKeys({ a: 1, b: 2 }, ['a', 'b'])).toBe(true);
      expect(hasExactKeys({ b: 2, a: 1 }, ['a', 'b'])).toBe(true);
    });

    it('returns false when key counts or names mismatch', () => {
      expect(hasExactKeys({ a: 1 }, ['a', 'b'])).toBe(false);
      expect(hasExactKeys({ a: 1, b: 2, c: 3 }, ['a', 'b'])).toBe(false);
      expect(hasExactKeys({ a: 1, c: 2 }, ['a', 'b'])).toBe(false);
    });
  });

  describe('isRfc3339', () => {
    it('validates RFC3339 timestamp strings', () => {
      expect(isRfc3339('2026-10-11T12:00:00Z')).toBe(true);
      expect(isRfc3339('2026-10-11T12:00:00.123Z')).toBe(true);
      expect(isRfc3339('2026-10-11T20:00:00+08:00')).toBe(true);
    });

    it('rejects invalid timestamps or non-strings', () => {
      expect(isRfc3339('2026-10-11')).toBe(false);
      expect(isRfc3339('invalid')).toBe(false);
      expect(isRfc3339(123456789)).toBe(false);
      expect(isRfc3339(null)).toBe(false);
    });
  });
});
