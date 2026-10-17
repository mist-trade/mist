import { DataSource } from '@app/shared-data';
import {
  getSecurityFormatCode,
  isProviderSymbol,
  isValidSecuritySourceFormatCode,
  normalizeSecurityCode,
  PROVIDER_SYMBOL_PATTERN,
} from './security-code';

describe('normalizeSecurityCode', () => {
  it('keeps pure stock codes as canonical internal codes', () => {
    expect(normalizeSecurityCode('000001')).toBe('000001');
  });

  it.each([
    ['000001.SH', '000001'],
    ['002475.sz', '002475'],
    ['  430047.BJ  ', '430047'],
  ])('removes provider market suffix from %s', (input, expected) => {
    expect(normalizeSecurityCode(input)).toBe(expected);
  });

  it.each([
    ['SH000001', '000001'],
    ['sz002475', '002475'],
    [' bj430047 ', '430047'],
  ])('removes provider market prefix from %s', (input, expected) => {
    expect(normalizeSecurityCode(input)).toBe(expected);
  });

  it('trims and uppercases unsupported symbols without stripping identity', () => {
    expect(normalizeSecurityCode(' custom-code ')).toBe('CUSTOM-CODE');
  });
});

describe('provider format code boundary', () => {
  it.each([
    [DataSource.TDX, '000001.SH'],
    [DataSource.TDX, '430047.BJ'],
    [DataSource.QMT, '002475.SZ'],
    [DataSource.EAST_MONEY, 'sh000001'],
  ])('accepts valid %s provider symbol %s', (source, formatCode) => {
    expect(isValidSecuritySourceFormatCode(source, formatCode)).toBe(true);
  });

  it.each([
    [DataSource.TDX, '000001'],
    [DataSource.TDX, '000001.sh'],
    [DataSource.QMT, 'SH000001'],
    [DataSource.QMT, ''],
    [DataSource.EAST_MONEY, '   '],
  ])('rejects invalid %s provider symbol %s', (source, formatCode) => {
    expect(isValidSecuritySourceFormatCode(source, formatCode)).toBe(false);
  });

  it('returns the trimmed provider symbol from the enabled source config', () => {
    expect(
      getSecurityFormatCode(
        {
          code: '000001',
          sourceConfigs: [
            {
              source: DataSource.TDX,
              enabled: true,
              formatCode: ' 000001.SH ',
            },
          ],
        },
        DataSource.TDX,
      ),
    ).toBe('000001.SH');
  });

  it('does not fall back to canonical Security.code', () => {
    expect(() =>
      getSecurityFormatCode(
        { code: '000001', sourceConfigs: [] },
        DataSource.TDX,
      ),
    ).toThrow('provider symbol resolution failed');
  });

  it('fails closed on malformed enabled TDX/QMT configuration', () => {
    expect(() =>
      getSecurityFormatCode(
        {
          code: '000001',
          sourceConfigs: [
            {
              source: DataSource.QMT,
              enabled: true,
              formatCode: '000001',
            },
          ],
        },
        DataSource.QMT,
      ),
    ).toThrow('Invalid enabled qmt formatCode');
  });
});

describe('isProviderSymbol', () => {
  it('recognizes valid Shanghai, Shenzhen, and Beijing symbols', () => {
    expect(isProviderSymbol('600519.SH')).toBe(true);
    expect(isProviderSymbol('000001.SZ')).toBe(true);
    expect(isProviderSymbol('430047.BJ')).toBe(true);
  });

  it('recognizes valid Hong Kong symbols (5-digit and 6-digit)', () => {
    expect(isProviderSymbol('00700.HK')).toBe(true);
    expect(isProviderSymbol('09988.HK')).toBe(true);
    expect(isProviderSymbol('123456.HK')).toBe(true);
  });

  it('rejects invalid symbols and non-strings', () => {
    expect(isProviderSymbol('000001')).toBe(false);
    expect(isProviderSymbol('600519.sh')).toBe(false);
    expect(isProviderSymbol('SH600519')).toBe(false);
    expect(isProviderSymbol('0070.HK')).toBe(false);
    expect(isProviderSymbol('1234567.HK')).toBe(false);
    expect(isProviderSymbol('000001.US')).toBe(false);
    expect(isProviderSymbol('')).toBe(false);
    expect(isProviderSymbol('   ')).toBe(false);
    expect(isProviderSymbol(null)).toBe(false);
    expect(isProviderSymbol(undefined)).toBe(false);
    expect(isProviderSymbol(600519)).toBe(false);
    expect(isProviderSymbol({})).toBe(false);
  });

  it('matches PROVIDER_SYMBOL_PATTERN correctly', () => {
    expect(PROVIDER_SYMBOL_PATTERN.test('600519.SH')).toBe(true);
    expect(PROVIDER_SYMBOL_PATTERN.test('000001.SZ')).toBe(true);
    expect(PROVIDER_SYMBOL_PATTERN.test('832089.BJ')).toBe(true);
    expect(PROVIDER_SYMBOL_PATTERN.test('00700.HK')).toBe(true);
    expect(PROVIDER_SYMBOL_PATTERN.test('01810.HK')).toBe(true);
    expect(PROVIDER_SYMBOL_PATTERN.test('000001')).toBe(false);
  });
});
