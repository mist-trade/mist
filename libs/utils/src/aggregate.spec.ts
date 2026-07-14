import { maxBy, minBy, minMaxBy } from './aggregate';

describe('minMaxBy', () => {
  it('returns null for an empty collection', () => {
    expect(minMaxBy([], (n) => n)).toBeNull();
  });

  it('returns the same min and max for a single-element collection', () => {
    expect(minMaxBy([42], (n) => n)).toEqual({ min: 42, max: 42 });
  });

  it('computes min and max via the accessor', () => {
    const items = [{ v: 3 }, { v: 1 }, { v: 2 }, { v: 5 }, { v: 4 }];
    expect(minMaxBy(items, (item) => item.v)).toEqual({ min: 1, max: 5 });
  });

  it('handles negative values', () => {
    expect(minMaxBy([-3, -1, -2], (n) => n)).toEqual({ min: -3, max: -1 });
  });
});

describe('minBy', () => {
  it('returns null for an empty collection', () => {
    expect(minBy([], (n) => n)).toBeNull();
  });

  it('returns the minimum via the accessor', () => {
    expect(minBy([{ v: 3 }, { v: 1 }, { v: 2 }], (item) => item.v)).toBe(1);
  });
});

describe('maxBy', () => {
  it('returns null for an empty collection', () => {
    expect(maxBy([], (n) => n)).toBeNull();
  });

  it('returns the maximum via the accessor', () => {
    expect(maxBy([{ v: 3 }, { v: 1 }, { v: 2 }], (item) => item.v)).toBe(3);
  });
});
