/**
 * 整数厘货币原语（REQ-ENGINE-07）。
 *
 * 域核心一切金额以整数厘表示与运算（1 元 = 1000 厘）。费率折算是唯一舍入点
 * （half-up 取厘），其后全整数运算。市场价（A 股 ≤3 位小数）在数据边界一次
 * 转换，精确无损。
 */

export const LI_PER_YUAN = 1000n;

/** 整数厘（1 元 = 1000 厘）。 */
export type Li = bigint;

/** 元（float）→ 厘。A 股价格 ≤3 位小数，转换精确；防御性 half-up。 */
export function yuanToLi(yuan: number): Li {
  return BigInt(Math.round(yuan * Number(LI_PER_YUAN)));
}

/** 厘 → 元（float，仅渲染/旧接口边界使用）。 */
export function liToYuan(li: Li): number {
  return Number(li) / Number(LI_PER_YUAN);
}

/** half-up 整数除法（numerator / denominator，非负域）。 */
export function divHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error(
      `divHalfUp: denominator must be positive, got ${denominator}`,
    );
  }
  const q = numerator / denominator; // bigint 整除 = floor
  const rem = numerator % denominator;
  return rem * 2n >= denominator ? q + 1n : q;
}

const RATIO_SCALE = 1_000_000_000n; // 1e9

/**
 * 比例折算（唯一舍入点）：value × ratio，half-up 取厘。
 * ratio 以 1e9 定点表示（佣金 0.00025 → 250_000_000n 等，精度充分）。
 */
export function applyRatioLi(value: Li, ratio: number): Li {
  if (!Number.isFinite(ratio) || ratio < 0) {
    throw new Error(`applyRatioLi: invalid ratio ${ratio}`);
  }
  const scaled = BigInt(Math.round(ratio * Number(RATIO_SCALE)));
  return divHalfUp(value * scaled, RATIO_SCALE);
}
