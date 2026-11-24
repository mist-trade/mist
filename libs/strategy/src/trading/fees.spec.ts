import { calculateExecutionFeesLi, applySlippageLi } from './fees';
import { yuanToLi } from './money';
import { ORDER_SIDES } from '../strategy.constants';

describe('trading/fees 整数厘规费', () => {
  const code = '000001';

  it('买入：佣金（保底 5 元）+ 过户费，无印花税', () => {
    // 12.50 元 × 7500 股 = 93750 元 = 93_750_000 厘
    const priceLi = yuanToLi(12.5);
    const fees = calculateExecutionFeesLi(ORDER_SIDES.BUY, priceLi, 7500, code);
    // 佣金 93750 × 0.00025 = 23.4375 元 = 23437.5 厘 → half-up 23438 厘
    expect(fees.commissionLi).toBe(23438n);
    // 过户费 93750 × 0.00001 = 0.9375 元 = 937.5 厘 → 938 厘
    expect(fees.transferFeeLi).toBe(938n);
    expect(fees.stampDutyLi).toBe(0n);
    expect(fees.totalFeesLi).toBe(23438n + 938n);
  });

  it('小额交易佣金保底 5 元（5000 厘）', () => {
    const fees = calculateExecutionFeesLi(
      ORDER_SIDES.BUY,
      yuanToLi(10),
      100,
      code,
    );
    // 1000 元 = 1_000_000 厘 × 0.00025 = 250 厘 < 5000 厘 → 保底
    expect(fees.commissionLi).toBe(5000n);
  });

  it('卖出征收印花税（万 5）', () => {
    const priceLi = yuanToLi(12.5);
    const fees = calculateExecutionFeesLi(
      ORDER_SIDES.SELL,
      priceLi,
      7500,
      code,
    );
    // 93750 × 0.0005 = 46.875 元 = 46875 厘
    expect(fees.stampDutyLi).toBe(46875n);
  });

  it('ETF 卖出免征印花税', () => {
    const fees = calculateExecutionFeesLi(
      ORDER_SIDES.SELL,
      yuanToLi(4.567),
      10000,
      '510300',
    );
    expect(fees.stampDutyLi).toBe(0n);
  });

  it('双向滑点：买入上浮 / 卖出下浮', () => {
    const priceLi = yuanToLi(10); // 10000 厘
    // 默认滑点 0.001 → 10 厘
    expect(applySlippageLi(priceLi, ORDER_SIDES.BUY)).toBe(10010n);
    expect(applySlippageLi(priceLi, ORDER_SIDES.SELL)).toBe(9990n);
  });
});
