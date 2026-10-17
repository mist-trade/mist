import type { WfaNavPoint } from './wfa.types';

const DEFAULT_INITIAL_CAPITAL = 100000;

/**
 * 将各 Fold 的样本外 (OOS) 独立回测净值序列按日度复利公式无缝缝合成一条连续前向曲线。
 *
 * 算法原理：
 * 1. 消除跨 Fold 初始资金断层：Fold 0 以 initialCapital 出发；
 * 2. 后续 Fold 逐日递推时，依据该 Fold 当日相对上一日的收益率 (r_t = (NAV_t - NAV_{t-1}) / NAV_{t-1})，
 *    在前一交易日缝合净值基础上复利计算：Stitched_t = Stitched_{t-1} * (1 + r_t)；
 * 3. 跨 Fold 交界日期去重，现金与持仓市值按比例自适应对齐。
 */
export function stitchWfaNavSeries(
  folds: readonly { readonly testNavSeries: readonly WfaNavPoint[] }[],
  initialCapital: number = DEFAULT_INITIAL_CAPITAL,
): WfaNavPoint[] {
  if (folds.length === 0) {
    return [];
  }

  const stitched: WfaNavPoint[] = [];
  const seenDates = new Set<string>();
  let currentEquity = initialCapital;

  for (const fold of folds) {
    const navSeries = fold.testNavSeries;
    if (!navSeries || navSeries.length === 0) {
      continue;
    }

    for (let i = 0; i < navSeries.length; i++) {
      const point = navSeries[i];
      if (seenDates.has(point.date)) {
        // 交界处已存在该日期的缝合记录，跳过以防重复记录
        continue;
      }

      seenDates.add(point.date);

      if (stitched.length === 0) {
        // 第一天初始化
        currentEquity = initialCapital;
        const cashRatio =
          point.cash !== undefined && point.totalEquity > 0
            ? point.cash / point.totalEquity
            : undefined;
        const cash =
          cashRatio !== undefined
            ? Math.round(currentEquity * cashRatio * 100) / 100
            : undefined;
        const marketValue =
          cash !== undefined
            ? Math.round((currentEquity - cash) * 100) / 100
            : undefined;

        stitched.push({
          date: point.date,
          totalEquity: currentEquity,
          cash,
          marketValue,
        });
      } else {
        // 计算日度收益率
        const prevPoint = i > 0 ? navSeries[i - 1] : null;
        let dailyReturn = 0;
        if (prevPoint && prevPoint.totalEquity > 0) {
          dailyReturn =
            (point.totalEquity - prevPoint.totalEquity) / prevPoint.totalEquity;
        }

        currentEquity =
          Math.round(currentEquity * (1 + dailyReturn) * 100) / 100;

        const cashRatio =
          point.cash !== undefined && point.totalEquity > 0
            ? point.cash / point.totalEquity
            : undefined;
        const cash =
          cashRatio !== undefined
            ? Math.round(currentEquity * cashRatio * 100) / 100
            : undefined;
        const marketValue =
          cash !== undefined
            ? Math.round((currentEquity - cash) * 100) / 100
            : undefined;

        stitched.push({
          date: point.date,
          totalEquity: currentEquity,
          cash,
          marketValue,
        });
      }
    }
  }

  return stitched;
}

/**
 * 计算跨 Fold 参数稳定性指数 (Parameter Stability Index, PSI)。
 *
 * 依据跨 Fold 样本外测试集夏普比率的离散系数 (Coefficient of Variation = std / mean) 评估稳定性。
 * 范围标准化在 [0.0, 1.0]：
 * - 当跨 Fold 表现极其一致（std = 0）时，PSI = 1.0；
 * - 当离散度极大或平均夏普为负时，PSI 衰减趋近于 0.0。
 */
export function computeParameterStabilityIndex(
  folds: readonly {
    readonly testSharpe: number;
    readonly trainSharpe?: number;
  }[],
): number {
  if (folds.length === 0) {
    return 0;
  }

  if (folds.length === 1) {
    return folds[0].testSharpe > 0 ? 1.0 : 0.0;
  }

  const testSharpes = folds.map((f) => f.testSharpe);
  const n = testSharpes.length;
  const mean = testSharpes.reduce((acc, v) => acc + v, 0) / n;

  // 若平均夏普为负或零，策略整体无超额稳定性
  if (mean <= 0 || Number.isNaN(mean)) {
    return 0.0;
  }

  const variance =
    testSharpes.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
  const std = Math.sqrt(variance);

  const cv = std / mean;
  // PSI = 1 / (1 + CV)，单调递减并严格受限于 [0.0, 1.0]
  const psi = 1.0 / (1.0 + cv);

  return Math.round(psi * 10000) / 10000;
}
