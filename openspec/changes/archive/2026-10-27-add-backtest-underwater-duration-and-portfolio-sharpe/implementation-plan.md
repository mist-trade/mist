# 实施计划：回测最长挫跌时长 + 多品种综合夏普（协方差口径）

> 对应 change：`add-backtest-underwater-duration-and-portfolio-sharpe`（spec 已确认）。
> 本文为代码级落地细节（普通 markdown，非 openspec 格式）。

---

## 1. libs/indicators —— 组合夏普纯算子

### 1.1 `libs/indicators/src/risk-performance/risk-performance.types.ts`

新增：

```ts
export interface PortfolioSharpeInput {
  readonly securityCode: string;
  /** 已按同一日期轴对齐（缺失日 0 填充）的等长日收益序列 */
  readonly returns: readonly number[];
}
```

### 1.2 `libs/indicators/src/risk-performance/risk-performance.ts`

新增导出（放 `computeSharpeRatio` 之后）：

```ts
/**
 * 计算多品种等权组合的年化综合夏普比率（协方差口径）。
 * 数学等价性：等权组合收益 r_p = (1/N)·Σr_i 的样本方差 = w'Σw（w=1/N·1，ddof=1），
 * 直接对 r_p 求 mean/std 与显式协方差矩阵合成严格等价，且规避 pairwise 非正定。
 * 契约：series 等长、无 null（调用方保证 0 填充对齐）。
 */
export function computePortfolioSharpeRatio(
  series: readonly PortfolioSharpeInput[],
  options?: SharpeRatioOptions,
): number;
```

实现要点：

- `series.length === 0` → 返回 0；
- `returns.length < 2` → 返回 0（与 `computeSharpeRatio` 边界一致）；
- 构造 `pl.DataFrame`（每个 securityCode 一列，`pl.Series(...).cast(pl.Float64)`）；
- 行方向等权均值：`pl.sumHorizontal(...列表达式).div(N)`（若当前 nodejs-polars 版本有
  `pl.meanHorizontal` 则直接用，编码时以实际 API 为准）；
- 产出组合收益数组后**直接复用** `computeSharpeRatio(portfolioReturns, options)`
  ——rf/年化/ddof/rounding 全部继承现有约定，零重复实现；
- 严禁 JS 命令式数学循环（横向聚合必须是 Polars 表达式）。

### 1.3 单测 `risk-performance.spec.ts` 新增用例

| 用例 | 断言 |
|---|---|
| N=1 退化 | `computePortfolioSharpeRatio([{code, rets}])` 与 `computeSharpeRatio(rets)` **精确相等**（rounding 同源） |
| 协方差抵消 | 两资产 `A=[+0.02,-0.01,+0.03,-0.02]`、`B=[-0.01,+0.005,-0.015,+0.01]`：组合序列 std ≈ 0.0062，**严格小于**两单资产 std（≈0.0224 / ≈0.0121）→ 组合夏普 > 单资产夏普 |
| 缺失日 0 填充（持现金稀释） | `A=[0.01, 0, 0.01]`（中间日停牌填 0）、`B=[0.01, 0.01, 0.01]`：组合 = `[0.01, 0.005, 0.01]`，手算公式断言精确值 |
| 边界 | 空数组 → 0；单点 returns → 0 |

## 2. apps/backtest —— 执行器接入

### 2.1 对齐 helper（`backtest-run.executor.ts` 本地函数）

现有 `combineDailyNavHistories`（:679）内部计算日期并集——**提取**共用纯函数：

```ts
function collectSortedDates(
  allNavHistories: readonly (readonly DailyNavSnapshot[])[],
): string[]; // 去重 + 排序；combineDailyNavHistories 与对齐 helper 共用，行为不变
```

新增：

```ts
function alignDailyReturns(
  allNavHistories: readonly (readonly DailyNavSnapshot[])[],
  sortedDates: readonly string[],
): PortfolioSharpeInput[];
// 每标的：Map<date, dailyReturn> → 沿 sortedDates 取值，缺失日 0
// （DailyNavSnapshot.dailyReturn 由持仓状态机生成，序列首日恒为 0）
```

属数据编排（Map/日期轴），与 `combineDailyNavHistories` 同级，不触 Polars 纯度红线。

### 2.2 run 完成块改动（`backtest-run.executor.ts:326-364`）

```ts
const sortedDates = collectSortedDates(allNavHistories);
const { navSeries: combinedNavSeries, navPoints } =
  combineDailyNavHistories(allNavHistories, DEFAULT_BROKER_INITIAL_CASH);
const summary = computePerformanceSummary(combinedNavSeries, trades);
// 多标的 → 综合夏普（协方差口径）；单标的/无数据 → 现状不变
const sharpeRatio =
  allNavHistories.length > 1
    ? computePortfolioSharpeRatio(alignDailyReturns(allNavHistories, sortedDates))
    : summary.sharpeRatio;
const maxUnderwaterDuration = computeUnderwaterDuration(combinedNavSeries);
```

update 载荷：`sharpeRatio: sharpeRatio`（替换 `summary.sharpeRatio`）、新增
`maxUnderwaterDuration`；summary 其余字段（totalReturn/annualizedReturn/maxDrawdown/
calmar/winRate/profitLossRatio/tradeCount）**一律不动**。
**不引入** `computeComprehensiveRiskPerformance`。

### 2.3 executor 单测（`backtest-run.executor.spec.ts`）

| 用例 | 断言 |
|---|---|
| 多标的组合夏普 | 两标的构造已知 NAV 序列 → `runRepository.update` 载荷 `sharpeRatio` 等于 `computePortfolioSharpeRatio(对齐序列)` 手算值（≠ 旧合成 NAV 夏普） |
| underwater 落盘 | NAV 先跌后升的构造序列 → `maxUnderwaterDuration` = 预期交易日数；全程新高序列 → 0 |
| 单标的回归 | 既有单标的用例**原断言不动**（sharpe 数值不变即为回归锁） |

## 3. 数据库

### 3.1 实体 `libs/shared-data/src/entities/backtest-run.entity.ts`

紧邻 `maxDrawdown` 之后插入（风格对齐现有列）：

```ts
@Column({
  name: 'max_underwater_duration',
  type: 'int',
  nullable: true,
})
maxUnderwaterDuration?: number | null;
```

### 3.2 migration `deploy/database/migrations/032_add_backtest_underwater_duration.sql`

```sql
ALTER TABLE backtest_runs
  ADD COLUMN max_underwater_duration INT NULL COMMENT '最长连续 underwater 交易日数';
```

forward-only；文件头注释风格对齐 029-031；部署时先于应用镜像生效（既有门禁）。

## 4. 查询 API（apps/mist）

### 4.1 VO `apps/mist/src/strategy/vo/backtest-run.vo.ts`

`maxDrawdown` 之后新增：

```ts
@ApiPropertyOptional({ nullable: true })
maxUnderwaterDuration?: number | null;
```

### 4.2 映射 `apps/mist/src/strategy/services/backtest-run-query.service.ts`

`mapRun()`（:243-278）`maxDrawdown` 行后加：

```ts
maxUnderwaterDuration: run.maxUnderwaterDuration ?? null,
```

无新端点；语义键单一（`maxUnderwaterDuration`），不自创同义 key。

## 5. 验证命令

```bash
pnpm -C mist test libs/indicators/src/risk-performance apps/backtest/src/backtest-run.executor.spec.ts
pnpm -C mist test:ci            # 全绿（--forceExit 已内置于脚本）
pnpm -C mist typecheck
pnpm -C mist lint:check && pnpm -C mist check:magic
openspec validate add-backtest-underwater-duration-and-portfolio-sharpe --strict
```

覆盖率：`pnpm -C mist test:coverage` 确认不低于既有 ratchet 基线（行 ≥82.72% / 语句 ≥81.64%）。

## 6. 交付边界

- 不改 mist-fe；不改实时链路；不动 SimulatedBroker/持仓状态机；
- migration 032 的生产生效随下次部署窗口验证（部署级 HIL，非本 change 代码任务）；
- 本机持续负载注意：`test:ci` 全量跑一次即可，避免反复全量构建。
