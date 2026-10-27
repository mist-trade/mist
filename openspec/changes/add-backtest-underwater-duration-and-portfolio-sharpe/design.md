# Design: 回测最长挫跌时长与多品种综合夏普

## D1 指标口径

### 最长挫跌时长（max_underwater_duration）

- 口径 = **最长连续 underwater（NAV 严格小于历史峰值 cumMax）交易日数**，直接复用现有
  `computeUnderwaterDuration`（`libs/indicators/src/risk-performance/risk-performance.ts:351`），
  不重写、不改语义。
- 输入为组合 NAV 序列（`combineDailyNavHistories` 合成结果），与 `max_drawdown` 同源同口径，
  二者构成完整的"挫跌幅度 + 挫跌时间"二元组。
- 落盘列 `max_underwater_duration INT NULL`（交易日数，无回撤史时为 0）。

### 综合夏普（单/多标的统一估计量）

- **统一决策（2026-10-27 用户确认）**：`sharpe_ratio` 一列一个估计量——单/多标的统一走
  组合算子，量尺可横向比较。单标的 N=1 退化为自身序列，数值与原单序列夏普**逐位一致**
  （无回归），历史单标的 run 依然可比。
- 输入：per-security 权益（`DailyNavSnapshot.totalEquity`）按日期并集 fill-forward 后
  **派生环比**（不使用状态机 `dailyReturn` 字段——那是 4 位舍入值，且其本职是 WFA 折间
  拼接 `wfa-stitcher.ts` 的复利衔接因子）。
- 对齐语义：快照间缺失日权益不变 → 环比 0（= 子账户持现金）；首个快照前视为未开始 → 0；
  **丢弃首行**（建仓期无收益语义）——与单标的 `computeDailyReturns`（begIndex=1）同构。
- 组合收益：`r_p(t) = (1/N) · Σ_i r_i(t)`（等权 1/N，与现有 per-security 固定初始资金结构一致）。
- 组合波动：**协方差口径**。数学事实：等权下组合序列样本方差 = (1/N²)·ΣΣCov(r_i, r_j) = w'Σw
  （w = (1/N)·**1**，ddof=1）——显式协方差矩阵与直接对 r_p 求样本 std **严格等价**。
  实现取后者（Polars mean/std 表达式），规避 pairwise 协方差在日期错位下的非正定风险。
- 年化：沿用现有约定 `(mean - rf_daily) / std · √250`，`rf_daily = 0.02 / 250`
  （`SharpeRatioOptions` 默认值不变）；rounding 规则与 `computeSharpeRatio` 一致（1e-4）。

## D2 算子形态与落点

```ts
// libs/indicators/src/risk-performance/risk-performance.ts
export interface PortfolioSharpeInput {
  readonly securityCode: string;
  readonly returns: readonly number[]; // 已按同一日期轴对齐的等长日收益序列
}

export function computePortfolioSharpeRatio(
  series: readonly PortfolioSharpeInput[],
  options?: SharpeRatioOptions,
): number;
```

- **对齐职责不在算子内**：日期轴对齐与环比派生依赖 `DailyNavSnapshot`（strategy 层类型）
  与 executor 的日期并集编排，indicators 是纯数学库不得依赖 strategy。算子只接受
  **已对齐的等长序列数组**（equity 派生环比、丢首行后）。
- 对齐 helper `alignEquityReturns` 为 executor 本地导出纯函数（与 `combineDailyNavHistories`
  并列，日期轴提取复用 `collectSortedDates`），输入 `allNavHistories` + 日期并集，输出
  per-security 对齐收益矩阵；Map 编排属数据组装，非数学命令式循环，不触 Polars 纯度红线。
- 空/单序列输入返回 0，与 `computeSharpeRatio` 边界行为一致（len < 2 → 0）。

## D3 执行器接入点（apps/backtest）

1. 现有 `combineDailyNavHistories(allNavHistories, ...)` 已计算日期并集与排序——提取
   `collectSortedDates` 共用，对齐 helper 产出 per-security 收益矩阵；
2. **统一路径（单/多标的同一条）**：`sharpe_ratio = computePortfolioSharpeRatio(
   alignEquityReturns(allNavHistories, sortedDates))`——无三元分叉；N=1 时与原
   summary 单序列夏普逐位一致（测试以 `toBe` 锁定）；summary 其余字段
   （totalReturn / annualizedReturn / maxDrawdown / calmar / winRate / profitLossRatio）**不动**，
   仍基于合成 NAV 与全量 trades；
3. `maxUnderwaterDuration = computeUnderwaterDuration(combinedNavSeries)`，与 summary 一起写入
   run 更新块；
4. **不**切换到 `computeComprehensiveRiskPerformance`（避免顺带引入 VaR/CVaR/流动性惩罚——用户明确不需要）。

## D4 语义变更与历史数据

- 多标的 run 的 `sharpe_ratio` 数值口径变更：漂移加权合成 NAV 夏普 → 等权协方差综合夏普。
  历史 run 不回填（列类型不变，仍 real），新旧 run 数值不可直接横向比较，spec 注明该边界。
- 单标的 run **数值不变**（统一估计量下 N=1 与原单序列夏普逐位一致——equity 环比 + 丢首行
  与 `computeDailyReturns` 同构），历史单标的 run 依然可比；仅语义表述统一为"等权组合口径"。
- 个人项目，无下游消费者锁定旧口径；测试更新为锁定新口径。

## D5 数据库

- `deploy/database/migrations/032_add_backtest_underwater_duration.sql`（forward-only）：
  `ALTER TABLE backtest_runs ADD COLUMN max_underwater_duration INT NULL`；
- 实体 `BacktestRun`（`libs/shared-data/src/entities/backtest-run.entity.ts`）加
  `maxUnderwaterDuration`（int nullable），紧邻既有 `maxDrawdown` 列定义；
- migration 先于应用镜像生效（部署门禁既有约定）。

## D6 测试策略

- **算子单测**（`risk-performance.spec.ts`）：
  - N=1 退化 = `computeSharpeRatio` 同值（精确相等）；
  - 两资产负相关 → 组合波动显著低于单资产（协方差抵消效应，锁定"带协方差"语义，含精确数值）；
  - 缺失日 0 收益的稀释行为符合"持现金"预期；
  - 空/单点输入返回 0；长度不齐抛 `IndicatorInputError`。
- **executor spec**（`backtest-run.executor.spec.ts`）：
  - `alignEquityReturns` 单测：equity 派生环比 + fill-forward 0（持现金）+ 丢首行 + 跳过空序列；
  - underwater 落盘：`max_underwater_duration` 与合成 NAV 同源（`toBe(computeUnderwaterDuration(navPoints))`）且回撤场景 > 0；
  - **统一估计量锁**：同构标的下单/多路径 `sharpeRatio` 以 `toBe` 逐位相等；组合夏普对复制
    同构标的不变（2 只 vs 3 只逐位相等）；非交易标的稀释使多标的夏普偏离单标的口径；
  - 单标的 run：sharpe 数值与现状一致（统一估计量下自然成立，显式断言）。
- 验证基线：`pnpm -C mist test libs/indicators libs/strategy/src/position apps/backtest` + 全量
  `test:ci`（`--forceExit`）+ `typecheck` + `lint:check` + `check:magic`。
