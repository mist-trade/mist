import { normalizeSecurityCode } from './security-code';

describe('normalizeSecurityCode', () => {
  it('keeps pure stock codes as canonical internal codes', () => {
    expect(normalizeSecurityCode('600519')).toBe('600519');
  });

  it.each([
    ['600519.SH', '600519'],
    ['002475.sz', '002475'],
    ['  430047.BJ  ', '430047'],
  ])('removes provider market suffix from %s', (input, expected) => {
    expect(normalizeSecurityCode(input)).toBe(expected);
  });

  it.each([
    ['SH600519', '600519'],
    ['sz002475', '002475'],
    [' bj430047 ', '430047'],
  ])('removes provider market prefix from %s', (input, expected) => {
    expect(normalizeSecurityCode(input)).toBe(expected);
  });

  it('trims and uppercases unsupported symbols without stripping identity', () => {
    expect(normalizeSecurityCode(' custom-code ')).toBe('CUSTOM-CODE');
  });
});
