/**
 * 双向滑点计算与 A 股精确规费计算（float 边界接口，整数厘内部算术）。
 *
 * 组 1b 移植（REQ-ENGINE-07）：费率语义零改动，算术迁移至 trading/fees.ts
 * 的整数厘实现——佣金 / 过户费 / 印花税 / ETF 免征 / 双向滑点。
 * 旧路径按「分」取整、本路径按「厘」取整：差异属厘级舍入，由黄金回放
 * diff 归类标注（REQ-ISO-04）。
 */
import { calculateExecutionFeesLi, type FeeConfigLi } from '../trading/fees';
import { EXECUTION_RULES, ORDER_SIDES } from '../strategy.constants';
import type { BrokerFeeConfig, FeeDetails, OrderSide } from './execution.types';
import { applyRatioLi, liToYuan, yuanToLi } from '../trading/money';

/**
 * 双向滑点计算
 * 买入按不利方向上浮，卖出按不利方向下浮
 */
export function applySlippage(
  price: number,
  side: OrderSide,
  slippageRatio: number = EXECUTION_RULES.DEFAULT_SLIPPAGE_RATIO,
): number {
  const priceLi = yuanToLi(price);
  const adjustedLi =
    side === ORDER_SIDES.BUY
      ? priceLi + applyRatioLi(priceLi, slippageRatio)
      : priceLi - applyRatioLi(priceLi, slippageRatio);
  return liToYuan(adjustedLi);
}

/**
 * A 股精确规费计算（佣金、过户费、印花税）——外部 float 适配器，核心委托 calculateExecutionFeesLi
 */
export function calculateExecutionFees(
  side: OrderSide,
  fillPrice: number,
  quantity: number,
  securityCode: string,
  slippageRatio: number = EXECUTION_RULES.DEFAULT_SLIPPAGE_RATIO,
  feeConfig?: BrokerFeeConfig,
): FeeDetails {
  const fillPriceLi = yuanToLi(fillPrice);
  const turnoverLi = fillPriceLi * BigInt(quantity);
  const feeConfigLi: FeeConfigLi | undefined = feeConfig
    ? {
        commissionRate: feeConfig.commissionRate,
        minCommissionLi:
          feeConfig.minCommission !== undefined
            ? BigInt(Math.round(feeConfig.minCommission * 1000))
            : undefined,
        transferFeeRate: feeConfig.transferFeeRate,
        stampDutyRate: feeConfig.stampDutyRate,
      }
    : undefined;

  const feesLi = calculateExecutionFeesLi(
    side,
    fillPriceLi,
    quantity,
    securityCode,
    feeConfigLi,
  );
  const slippageCostLi = applyRatioLi(turnoverLi, slippageRatio);

  return {
    commission: liToYuan(feesLi.commissionLi),
    transferFee: liToYuan(feesLi.transferFeeLi),
    stampDuty: liToYuan(feesLi.stampDutyLi),
    slippageCost: liToYuan(slippageCostLi),
    totalFees: liToYuan(feesLi.totalFeesLi),
  };
}
