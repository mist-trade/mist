import { DataSource } from './data-source.enum';

describe('DataSource', () => {
  it('should have correct values', () => {
    expect(DataSource.EAST_MONEY).toBe('ef');
    expect(DataSource.TDX).toBe('tdx');
    expect(DataSource.QMT).toBe('qmt');
    expect(DataSource.VENDOR_A).toBe('vendor_a');
  });

  it('exposes the live sources plus one value per vendor provider', () => {
    const values = Object.values(DataSource);
    expect(values).toEqual(['ef', 'tdx', 'qmt', 'vendor_a']);
  });

  it('does not expose legacy miniQMT aliases', () => {
    expect(DataSource).not.toHaveProperty('MINI_QMT');
    expect(Object.values(DataSource)).not.toContain('mqmt');
  });
});
