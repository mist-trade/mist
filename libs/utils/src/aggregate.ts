/**
 * 聚合工具：对集合按 accessor 取最小/最大值。
 * 纯函数模块，供任意领域复用（chan 模块的 zg/zd/gg/dd 计算、笔的极值统计等）。
 */

export interface MinMaxResult {
  min: number;
  max: number;
}

/**
 * 对 items 按 accessor 取最小值与最大值。
 *
 * @param items 待聚合的集合
 * @param accessor 从每个元素提取数值的访问器
 * @returns `{ min, max }`；items 为空时返回 null
 */
export function minMaxBy<T>(
  items: readonly T[],
  accessor: (item: T) => number,
): MinMaxResult | null {
  if (items.length === 0) {
    return null;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const item of items) {
    const value = accessor(item);
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  return { min, max };
}

/**
 * 对 items 按 accessor 取最小值。items 为空时返回 null。
 */
export function minBy<T>(
  items: readonly T[],
  accessor: (item: T) => number,
): number | null {
  const result = minMaxBy(items, accessor);
  return result === null ? null : result.min;
}

/**
 * 对 items 按 accessor 取最大值。items 为空时返回 null。
 */
export function maxBy<T>(
  items: readonly T[],
  accessor: (item: T) => number,
): number | null {
  const result = minMaxBy(items, accessor);
  return result === null ? null : result.max;
}
