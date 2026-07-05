import { DataSource } from './data-source.enum';

describe('DataSource', () => {
  it('should have correct values', () => {
    expect(DataSource.EAST_MONEY).toBe('ef');
    expect(DataSource.TDX).toBe('tdx');
    expect(DataSource.QMT).toBe('qmt');
  });

  it('should have three sources', () => {
    const values = Object.values(DataSource);
    expect(values).toHaveLength(3);
    expect(values).toEqual(['ef', 'tdx', 'qmt']);
  });

  it('does not expose legacy miniQMT aliases', () => {
    expect(DataSource).not.toHaveProperty('MINI_QMT');
    expect(Object.values(DataSource)).not.toContain('mqmt');
  });
});
