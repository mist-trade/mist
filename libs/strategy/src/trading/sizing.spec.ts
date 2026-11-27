import { MarketRiskRegime } from './domain.types';
import { yuanToLi } from './money';
import {
  createAllInWithBuffer,
  recomputeNextBarOpenBuyQuantity,
} from './sizing';

describe('sizing（仓位策略与 Next-Bar Open 重算）', () => {
  const SEED_LI = 1_000_000_000n; // 100 万元

  describe('recomputeNextBarOpenBuyQuantity', () => {
    it('次根开盘价低于信号价时受 requestedQuantity 封顶保护，不悄悄放大仓位', () => {
      // 信号价 10.00 -> requestedQuantity = 95,000（或 allowFractionalShares 场景下的精确值）
      // 次根开盘跌至 8.00 -> 现金理论可买 118,700 股，必须封顶在 95,000
      const qty = recomputeNextBarOpenBuyQuantity({
        cashLi: SEED_LI,
        fillPriceLi: yuanToLi(8.0),
        requestedQuantity: 95_000,
        cashAllocationRatio: 0.95,
        lotSize: 100,
        securityCode: '000001',
        feeEnabled: true,
      });
      expect(qty).toBe(95_000);

      const fractionalQty = recomputeNextBarOpenBuyQuantity({
        cashLi: yuanToLi(10_000),
        fillPriceLi: yuanToLi(8.0),
        requestedQuantity: 950,
        cashAllocationRatio: 0.95,
        lotSize: 100,
        securityCode: '000001',
        feeEnabled: true,
        allowFractionalShares: true,
      });
      expect(fractionalQty).toBe(950);
    });

    it('透传 macroRegime 至 createAllInWithBuffer：ELEVATED_RISK 次根高开时仍维持减半预算', () => {
      const elevatedRegime = {
        regime: MarketRiskRegime.ELEVATED_RISK,
        marketAtrPercentile: 0.9,
        isLiquidityFrozen: false,
      };
      const baseSizing = createAllInWithBuffer(0.95);
      // 信号价 10.00 在 ELEVATED_RISK 下原本分配 47,500 股
      const signalQty = baseSizing({
        cashLi: SEED_LI,
        priceLi: yuanToLi(10.0),
        macroRegime: elevatedRegime,
        lotSize: 100,
      }).quantity;
      expect(signalQty).toBe(47_500);

      // 次根高开到 12.34：必须继续遵守 ELEVATED_RISK 减半（38,400 股），绝不能被回弹到 76,900
      const recomputed = recomputeNextBarOpenBuyQuantity({
        cashLi: SEED_LI,
        fillPriceLi: yuanToLi(12.34),
        requestedQuantity: signalQty,
        cashAllocationRatio: 0.95,
        lotSize: 100,
        securityCode: '000001',
        feeEnabled: true,
        macroRegime: elevatedRegime,
      });
      expect(recomputed).toBe(38_400);
    });

    it('按 lotSize 步降确保成交额 + 规费 <= cashLi，支持自定义 feeConfig 与 feeEnabled=false', () => {
      // 现金 10,000 元，ratio=1.0，股价 10.00，整手 100：1000 股需 10,000 + 5.10 规费 > 10,000，应步降至 900 股
      const qtyWithFees = recomputeNextBarOpenBuyQuantity({
        cashLi: yuanToLi(10_000),
        fillPriceLi: yuanToLi(10.0),
        requestedQuantity: 1_000,
        cashAllocationRatio: 1.0,
        lotSize: 100,
        securityCode: '000001',
        feeEnabled: true,
      });
      expect(qtyWithFees).toBe(900);

      // feeEnabled=false 时 1000 股无需扣费，恰好成交 1000 股
      const qtyNoFees = recomputeNextBarOpenBuyQuantity({
        cashLi: yuanToLi(10_000),
        fillPriceLi: yuanToLi(10.0),
        requestedQuantity: 1_000,
        cashAllocationRatio: 1.0,
        lotSize: 100,
        securityCode: '000001',
        feeEnabled: false,
      });
      expect(qtyNoFees).toBe(1_000);

      // allowFractionalShares=true 时按 1 股步降（999 股 × 10 = 9990 + 5.10 <= 10,000）
      const fractionalStepDown = recomputeNextBarOpenBuyQuantity({
        cashLi: yuanToLi(10_000),
        fillPriceLi: yuanToLi(10.0),
        requestedQuantity: 1_000,
        cashAllocationRatio: 1.0,
        lotSize: 100,
        securityCode: '000001',
        feeEnabled: true,
        allowFractionalShares: true,
      });
      expect(fractionalStepDown).toBe(999);

      // 自定义免五高费率 feeConfig：1000 股 × 10 × 10% = 1000 > 0，验证透传生效
      const customFeeQty = recomputeNextBarOpenBuyQuantity({
        cashLi: yuanToLi(10_000),
        fillPriceLi: yuanToLi(10.0),
        requestedQuantity: 1_000,
        cashAllocationRatio: 1.0,
        lotSize: 100,
        securityCode: '000001',
        feeEnabled: true,
        feeConfig: {
          commissionRate: 0.1,
          minCommissionLi: 0n,
          transferFeeRate: 0,
        },
      });
      expect(customFeeQty).toBe(900);
    });

    it('非法价格/零现金/零请求数量/不足一手返回 0', () => {
      expect(
        recomputeNextBarOpenBuyQuantity({
          cashLi: SEED_LI,
          fillPriceLi: 0n,
          requestedQuantity: 1000,
          cashAllocationRatio: 0.95,
          lotSize: 100,
          securityCode: '000001',
          feeEnabled: true,
        }),
      ).toBe(0);
      expect(
        recomputeNextBarOpenBuyQuantity({
          cashLi: 0n,
          fillPriceLi: yuanToLi(10),
          requestedQuantity: 1000,
          cashAllocationRatio: 0.95,
          lotSize: 100,
          securityCode: '000001',
          feeEnabled: true,
        }),
      ).toBe(0);
      expect(
        recomputeNextBarOpenBuyQuantity({
          cashLi: yuanToLi(500),
          fillPriceLi: yuanToLi(10),
          requestedQuantity: 1000,
          cashAllocationRatio: 0.95,
          lotSize: 100,
          securityCode: '000001',
          feeEnabled: true,
        }),
      ).toBe(0);
    });
  });
});
