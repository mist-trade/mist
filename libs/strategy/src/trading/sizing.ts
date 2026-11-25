/**
 * 仓位策略（REQ-ENGINE-03：仓位计算与裁决分离）。
 *
 * 默认 AllInWithBuffer：可用现金 × allocRatio × 整手向下取整；
 * ELEVATED_RISK 开仓预算减半（沿用旧 Arbiter 语义）。
 */
import { MarketRiskRegime } from './domain.types';
import type {
  SizingContext,
  SizingResult,
  SizingStrategy,
} from './domain.types';
import { applyRatioLi } from './money';
import { TRADING_LAYER_DEFAULTS } from '../strategy.constants';

export function createAllInWithBuffer(
  ratio: number = TRADING_LAYER_DEFAULTS.DEFAULT_CASH_ALLOCATION_RATIO,
): SizingStrategy {
  return ({
    cashLi,
    priceLi,
    macroRegime,
    lotSize,
  }: SizingContext): SizingResult => {
    const allocRatioUsed =
      macroRegime?.regime === MarketRiskRegime.ELEVATED_RISK
        ? ratio * 0.5
        : ratio;
    if (priceLi <= 0n) {
      return { quantity: 0, allocRatioUsed };
    }
    const allocatableLi = applyRatioLi(cashLi, allocRatioUsed);
    const perLotLi = priceLi * BigInt(lotSize);
    const lotCount = Number(allocatableLi / perLotLi); // bigint 整除 = 向下取整
    return { quantity: lotCount * lotSize, allocRatioUsed };
  };
}
