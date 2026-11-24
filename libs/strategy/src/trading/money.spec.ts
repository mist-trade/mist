import { divHalfUp, liToYuan, applyRatioLi, yuanToLi } from './money';

describe('trading/money 整数厘原语', () => {
  describe('yuanToLi / liToYuan 往返', () => {
    it('A股价格（≤3 位小数）转换精确无损', () => {
      expect(yuanToLi(12.34)).toBe(12340n);
      expect(yuanToLi(4.567)).toBe(4567n); // ETF 三位小数
      expect(yuanToLi(1000)).toBe(1_000_000n);
      expect(liToYuan(12340n)).toBeCloseTo(12.34, 10);
      expect(liToYuan(4567n)).toBeCloseTo(4.567, 10);
    });
  });

  describe('divHalfUp', () => {
    it('half-up：0.5 厘进位', () => {
      expect(divHalfUp(5n, 2n)).toBe(3n); // 2.5 → 3
      expect(divHalfUp(4n, 2n)).toBe(2n); // 2.0 → 2
      expect(divHalfUp(7n, 3n)).toBe(2n); // 2.33 → 2
      expect(divHalfUp(8n, 3n)).toBe(3n); // 2.67 → 3
    });

    it('非正分母抛错', () => {
      expect(() => divHalfUp(1n, 0n)).toThrow();
      expect(() => divHalfUp(1n, -1n)).toThrow();
    });
  });

  describe('applyRatioLi（唯一舍入点）', () => {
    it('佣金万 2.5', () => {
      // 100000 元 = 100_000_000 厘 × 0.00025 = 25000 厘（25 元）
      expect(applyRatioLi(100_000_000n, 0.00025)).toBe(25_000n);
    });

    it('预算比例 0.95', () => {
      expect(applyRatioLi(1_000_000_000n, 0.95)).toBe(950_000_000n);
    });

    it('产生分数厘时 half-up', () => {
      // 3 厘 × 0.5 = 1.5 → 2
      expect(applyRatioLi(3n, 0.5)).toBe(2n);
    });

    it('非法比例抛错', () => {
      expect(() => applyRatioLi(100n, Number.NaN)).toThrow();
      expect(() => applyRatioLi(100n, -1)).toThrow();
    });
  });
});
