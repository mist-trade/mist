/**
 * 仓位策略（REQ-ENGINE-03：仓位计算与裁决分离）。
 *
 * 默认 AllInWithBuffer：可用现金 × allocRatio × 整手向下取整；
 * ELEVATED_RISK 开仓预算减半（沿用旧 Arbiter 语义）。
 */
import { ORDER_SIDES, TRADING_LAYER_DEFAULTS } from '../strategy.constants';
import { MarketRiskRegime } from './domain.types';
import type {
  MacroRegimeSnapshot,
  SizingContext,
  SizingResult,
  SizingStrategy,
} from './domain.types';
import { calculateExecutionFeesLi, type FeeConfigLi } from './fees';
import { applyRatioLi } from './money';

const MIN_LOT_SIZE = 1;

export interface RecomputeNextBarBuyParams {
  readonly cashLi: bigint;
  readonly fillPriceLi: bigint;
  readonly requestedQuantity: number;
  readonly cashAllocationRatio: number;
  readonly lotSize: number;
  readonly securityCode: string;
  readonly feeEnabled: boolean;
  readonly feeConfig?: FeeConfigLi;
  readonly macroRegime?: MacroRegimeSnapshot;
  readonly allowFractionalShares?: boolean;
}

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

/**
 * 次根开盘撮合买单数量重算（[BUG-MAIN-PIPELINE-01]）：
 * - 复用 `createAllInWithBuffer` 并透传 `macroRegime`（确保 ELEVATED_RISK 减半不被绕过）；
 * - 以 `requestedQuantity` 封顶（低开不悄悄放大引擎裁决数量）；
 * - 按有效 `lotSize` 步降校验 `turnoverLi + feesLi <= cashLi`。
 */
export function recomputeNextBarOpenBuyQuantity(
  params: RecomputeNextBarBuyParams,
): number {
  const {
    cashLi,
    fillPriceLi,
    requestedQuantity,
    cashAllocationRatio,
    lotSize,
    securityCode,
    feeEnabled,
    feeConfig,
    macroRegime,
    allowFractionalShares,
  } = params;

  if (fillPriceLi <= 0n || cashLi <= 0n || requestedQuantity <= 0) {
    return 0;
  }

  const effectiveLotSize =
    allowFractionalShares || lotSize <= MIN_LOT_SIZE
      ? MIN_LOT_SIZE
      : Math.floor(lotSize);

  const sizing = createAllInWithBuffer(cashAllocationRatio);
  const affordable = sizing({
    cashLi,
    priceLi: fillPriceLi,
    macroRegime,
    lotSize: effectiveLotSize,
  }).quantity;

  const capped = Math.min(requestedQuantity, affordable);
  let qty = Math.floor(capped / effectiveLotSize) * effectiveLotSize;

  while (qty >= effectiveLotSize) {
    const turnoverLi = fillPriceLi * BigInt(qty);
    const feesLi = feeEnabled
      ? calculateExecutionFeesLi(
          ORDER_SIDES.BUY,
          fillPriceLi,
          qty,
          securityCode,
          feeConfig,
        ).totalFeesLi
      : 0n;
    if (turnoverLi + feesLi <= cashLi) {
      return qty;
    }
    qty -= effectiveLotSize;
  }

  return 0;
}
