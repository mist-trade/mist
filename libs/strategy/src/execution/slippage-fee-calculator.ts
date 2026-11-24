/**
 * 双向滑点计算与 A 股精确规费计算（float 边界接口，整数厘内部算术）。
 *
 * 组 1b 移植（REQ-ENGINE-07）：费率语义零改动，算术迁移至 trading/fees.ts
 * 的整数厘实现——佣金 / 过户费 / 印花税 / ETF 免征 / 双向滑点。
 * 旧路径按「分」取整、本路径按「厘」取整：差异属厘级舍入，由黄金回放
 * diff 归类标注（REQ-ISO-04）。
 */
import { isEtfSecurity } from '@app/market-data';
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
 * A 股精确规费计算（佣金、过户费、印花税）
 * - 佣金：双向默认万 2.5，最低保底 5 元（支持通过 feeConfig 调整，支持免五为 0）
 * - 过户费：双向默认万 0.1
 * - 印花税：仅卖出征收万 5；若为 ETF 则免征（严格为 0）
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
  const commissionRate =
    feeConfig?.commissionRate ?? EXECUTION_RULES.DEFAULT_COMMISSION_RATE;
  const minCommission =
    feeConfig?.minCommission ?? EXECUTION_RULES.MIN_COMMISSION;
  const transferFeeRate =
    feeConfig?.transferFeeRate ?? EXECUTION_RULES.TRANSFER_FEE_RATE;
  const stampDutyRate =
    feeConfig?.stampDutyRate ?? EXECUTION_RULES.STAMP_DUTY_RATE;

  const rawCommissionLi = applyRatioLi(turnoverLi, commissionRate);
  const minCommissionLi = BigInt(Math.round(minCommission * 1000));
  const commissionLi =
    minCommission > 0
      ? rawCommissionLi > minCommissionLi
        ? rawCommissionLi
        : minCommissionLi
      : rawCommissionLi;
  const transferFeeLi = applyRatioLi(turnoverLi, transferFeeRate);
  const isEtf = isEtfSecurity(securityCode);
  const stampDutyLi =
    side === ORDER_SIDES.SELL && !isEtf
      ? applyRatioLi(turnoverLi, stampDutyRate)
      : 0n;
  const slippageCostLi = applyRatioLi(turnoverLi, slippageRatio);

  return {
    commission: liToYuan(commissionLi),
    transferFee: liToYuan(transferFeeLi),
    stampDuty: liToYuan(stampDutyLi),
    slippageCost: liToYuan(slippageCostLi),
    totalFees: liToYuan(commissionLi + transferFeeLi + stampDutyLi),
  };
}
