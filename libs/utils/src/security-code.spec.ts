import { DataSource } from '@app/shared-data';
import {
  getSecurityFormatCode,
  isChiNextOrStarMarket,
  isEtfSecurity,
  isValidSecuritySourceFormatCode,
  normalizeSecurityCode,
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

describe('isEtfSecurity', () => {
  it.each(['510300', '510050.SH', '159915.SZ', '588000', '518880'])(
    'recognizes %s as an ETF',
    (code) => {
      expect(isEtfSecurity(code)).toBe(true);
    },
  );

  it.each(['600519', '000001', '300750', '688981'])(
    'recognizes %s as a stock rather than an ETF',
    (code) => {
      expect(isEtfSecurity(code)).toBe(false);
    },
  );
});

describe('isChiNextOrStarMarket', () => {
  it.each(['300750', '301001.SZ', '688981', '688001.SH'])(
    'recognizes %s as ChiNext or STAR market',
    (code) => {
      expect(isChiNextOrStarMarket(code)).toBe(true);
    },
  );

  it.each(['600519', '000001', '510300'])(
    'recognizes %s as main board or ETF',
    (code) => {
      expect(isChiNextOrStarMarket(code)).toBe(false);
    },
  );
});
