/**
 * A 股规费与滑点——整数厘算术（REQ-ENGINE-07）。
 *
 * 费率语义与 `libs/strategy/src/execution/slippage-fee-calculator.ts` 零改动
 * （佣金 / 过户费 / 印花税 / ETF 免征 / 双向滑点），算术重写为整数厘；
 * 每个费率分母应用处（applyRatioLi）即唯一舍入点（half-up 取厘）。
 * 旧 float 路径按「分」取整，本路径按「厘」取整——差异归类为厘级舍入，
 * 由黄金回放 diff 显式标注（REQ-ISO-04）。
 */
import { isEtfSecurity } from '@app/market-data';
import { EXECUTION_RULES, ORDER_SIDES } from '../strategy.constants';
import type { OrderSide } from '../execution/execution.types';
import { applyRatioLi, type Li } from './money';

export interface FeeConfigLi {
  /** 佣金费率，默认万分之 2.5 (0.00025) */
  readonly commissionRate?: number;
  /** 最低佣金，默认 5 元 = 5000 厘；0 表示免五 */
  readonly minCommissionLi?: Li;
  /** 过户费率，默认万分之 0.1 */
  readonly transferFeeRate?: number;
  /** 印花税率，默认万分之 5，仅卖出非 ETF 征收 */
  readonly stampDutyRate?: number;
}

export interface FeeDetailsLi {
  readonly commissionLi: Li;
  readonly transferFeeLi: Li;
  readonly stampDutyLi: Li;
  readonly totalFeesLi: Li;
}

/** 双向滑点：买入不利方向上浮，卖出不利方向下浮（half-up 取厘）。 */
export function applySlippageLi(
  priceLi: Li,
  side: OrderSide,
  slippageRatio: number = EXECUTION_RULES.DEFAULT_SLIPPAGE_RATIO,
): Li {
  if (side === ORDER_SIDES.BUY) {
    return priceLi + applyRatioLi(priceLi, slippageRatio);
  }
  return priceLi - applyRatioLi(priceLi, slippageRatio);
}

export function calculateExecutionFeesLi(
  side: OrderSide,
  fillPriceLi: Li,
  quantity: number,
  securityCode: string,
  feeConfig?: FeeConfigLi,
): FeeDetailsLi {
  const turnoverLi = fillPriceLi * BigInt(quantity);

  const commissionRate =
    feeConfig?.commissionRate ?? EXECUTION_RULES.DEFAULT_COMMISSION_RATE;
  const minCommissionLi =
    feeConfig?.minCommissionLi ??
    BigInt(Math.round(EXECUTION_RULES.MIN_COMMISSION * 1000));
  const transferFeeRate =
    feeConfig?.transferFeeRate ?? EXECUTION_RULES.TRANSFER_FEE_RATE;
  const stampDutyRate =
    feeConfig?.stampDutyRate ?? EXECUTION_RULES.STAMP_DUTY_RATE;

  const rawCommissionLi = applyRatioLi(turnoverLi, commissionRate);
  const commissionLi =
    minCommissionLi > 0n
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

  return {
    commissionLi,
    transferFeeLi,
    stampDutyLi,
    totalFeesLi: commissionLi + transferFeeLi + stampDutyLi,
  };
}
