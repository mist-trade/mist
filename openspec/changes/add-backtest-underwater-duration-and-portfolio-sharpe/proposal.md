# Proposal: 回测最长挫跌时长落盘与多品种综合夏普（协方差口径）

## 1. 背景

回测绩效链路（`apps/backtest` → `libs/indicators/risk-performance` → `backtest_runs`）当前存在两个缺口：

1. **最长挫跌时长缺失**：`computeUnderwaterDuration`（最长连续 underwater 交易日数，Polars 游程统计）已在
   `libs/indicators/src/risk-performance` 实现并在 `computeComprehensiveRiskPerformance` 中组装，
   但回测执行器只调用 `computePerformanceSummary`，该指标既不落盘也不经 API 暴露。
   最大回撤（`max_drawdown`）已有且落盘，本 change 不动。
2. **夏普不支持真正的多品种综合口径**：`computeSharpeRatio` 只接受单一收益序列。多标的 run 现由
   `combineDailyNavHistories` 将各标的子账户 NAV 按日期并集求和成合成 NAV，再套单序列夏普——
   语义是"初始等权、买入持有漂移权重"，不是教科书意义的组合夏普（等权组合收益 + 协方差合成的组合波动）。

## 2. 目标

1. 回测 run 落盘并暴露**最长挫跌时长**（`max_underwater_duration`，口径 = 最长连续 underwater 交易日数）。
2. 多标的 run 的 `sharpe_ratio` 改为**综合（组合）夏普**：等权组合日收益序列，组合波动按协方差口径合成
   （等权下 w'Σw 与组合序列样本标准差数学等价），年化系数与无风险利率沿用现有约定（√250、0.02/250）。
3. **单/多标的统一估计量**（2026-10-27 用户确认）：单标的也走组合算子（N=1 退化），`sharpe_ratio`
   一列一个语义、量尺可横向比较；单标的价值与原单序列夏普逐位一致（equity 环比 + 丢首行同构构造），
   历史单标的 run 无回归。

## 3. 范围

### 本 change

- `libs/indicators/src/risk-performance`：新增 `computePortfolioSharpeRatio` 纯算子（Polars，无 I/O）；
- `apps/backtest/src/backtest-run.executor.ts`：per-security 日收益率按日期并集对齐（缺失记 0），
  多标的 run 的 `sharpe_ratio` 换用组合夏普；接入 `computeUnderwaterDuration` 落盘；
- `backtest_runs` 新增 `max_underwater_duration` 列（migration 032，forward-only）；
- `apps/mist` 查询层字段映射（`maxUnderwaterDuration`），run 详情/列表 API 自然携带。

### 非目标

- **不**落盘/暴露 VaR、CVaR、流动性顺延惩罚（`computeComprehensiveRiskPerformance` 其余字段用户不需要）；
- 不做前端页面改动（字段经既有 run 查询 API 可得，前端消费另行立项）；
- 不引入组合资金共享、动态权重或再平衡策略（保持 per-security 独立子账户 + 等权口径）；
- 不回填/改写历史 run 的 `sharpe_ratio`。

## 4. 影响面

| 仓库/层 | 影响 |
|---|---|
| `mist` libs/indicators | 新增组合夏普纯算子 + 单测（indicators 纯度边界守卫内） |
| `mist` apps/backtest | 执行器收益对齐 + 组合夏普替换 + underwater 落盘 + spec 更新 |
| `mist` libs/shared-data | `BacktestRun` 实体加列 |
| `mist` deploy/database | migration 032（forward-only，严禁复用编号） |
| `mist` apps/mist | 查询 service 字段映射 |
| 数据库 | 仅加列，无数据回填 |

## 5. 风险

| 风险 | 处置 |
|---|---|
| 多标的 run 的 `sharpe_ratio` 数值口径变化（漂移加权 → 等权协方差），新旧 run 不可直接比较 | spec 注明语义边界；历史 run 不回填；测试锁定新口径 |
| 标的数据缺失日按 0 收益填充会稀释组合夏普 | 该语义即"子账户持现金"，真实反映数据缺失成本；design 明确记录口径与影响 |
| 组合夏普若显式构建协方差矩阵可能非正定 | 采用数学等价的组合序列样本 std 路径（ddof=1），规避 pairwise 非正定 |
| Polars 纯度红线（严禁 JS 命令式数学循环） | 新算子全向量表达式；对齐 helper 属数据编排（Map/日期轴），与现有 `combineDailyNavHistories` 同级 |
| migration 编号冲突 | 下一个 real = 032，先于应用镜像生效 |
