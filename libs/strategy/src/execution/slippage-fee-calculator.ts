import { isEtfSecurity } from '@app/market-data';
import { EXECUTION_RULES, ORDER_SIDES } from '../strategy.constants';
import type { BrokerFeeConfig, FeeDetails, OrderSide } from './execution.types';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 双向滑点计算
 * 买入按不利方向上浮，卖出按不利方向下浮
 */
export function applySlippage(
  price: number,
  side: OrderSide,
  slippageRatio: number = EXECUTION_RULES.DEFAULT_SLIPPAGE_RATIO,
): number {
  const adjusted =
    side === ORDER_SIDES.BUY
      ? price * (1 + slippageRatio)
      : price * (1 - slippageRatio);
  return round2(adjusted);
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
  const turnover = fillPrice * quantity;
  const commissionRate =
    feeConfig?.commissionRate ?? EXECUTION_RULES.DEFAULT_COMMISSION_RATE;
  const minCommission =
    feeConfig?.minCommission ?? EXECUTION_RULES.MIN_COMMISSION;
  const transferFeeRate =
    feeConfig?.transferFeeRate ?? EXECUTION_RULES.TRANSFER_FEE_RATE;
  const stampDutyRate =
    feeConfig?.stampDutyRate ?? EXECUTION_RULES.STAMP_DUTY_RATE;

  const rawCommission = turnover * commissionRate;
  const commission = round2(
    minCommission > 0 ? Math.max(minCommission, rawCommission) : rawCommission,
  );
  const transferFee = round2(turnover * transferFeeRate);
  const isEtf = isEtfSecurity(securityCode);
  const stampDuty =
    side === ORDER_SIDES.SELL && !isEtf ? round2(turnover * stampDutyRate) : 0;
  const slippageCost = round2(turnover * slippageRatio);
  const totalFees = round2(commission + transferFee + stampDuty);

  return {
    commission,
    transferFee,
    stampDuty,
    slippageCost,
    totalFees,
  };
}
