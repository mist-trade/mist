# Tasks: 回测最长挫跌时长与多品种综合夏普

> 分阶段门禁：每阶段完成即停顿汇报；未获批准不进入下一阶段。

---

## Phase 1: 组合夏普纯算子（libs/indicators）

- [x] **1.1 类型与算子**
  - `risk-performance.types.ts`：`PortfolioSharpeInput { securityCode, returns }`
  - `risk-performance.ts`：`computePortfolioSharpeRatio(series, options?)`——
    等权平均收益序列 → Polars mean/std（ddof=1）→ `(mean - rf_daily)·√250 / std`，
    rounding 与 `computeSharpeRatio` 一致；len < 2 返回 0
- [x] **1.2 单测**（`risk-performance.spec.ts`）
  - N=1 退化与 `computeSharpeRatio` 同值
  - 完全负相关两资产：组合 std < 两单资产 std（协方差抵消）
  - 缺失日 0 收益稀释符合持现金语义
  - 空/单点输入 → 0
- [x] **1.3 门禁**：`pnpm -C mist test libs/indicators && pnpm -C mist typecheck`
  - indicators 纯度边界守卫（无 I/O / 无 @app 依赖）保持绿

## Phase 2: 执行器接入（apps/backtest）

- [x] **2.1 对齐 helper**：executor 本地纯函数——输入 `allNavHistories`，
  复用 `combineDailyNavHistories` 的日期并集轴，输出 per-security 等长收益矩阵
  （`totalEquity` fill-forward 派生环比 + 丢首行，与单标的 NAV 环比同构）
- [x] **2.2 组合夏普替换**：多标的 run 的 `sharpe_ratio` 换用
  `computePortfolioSharpeRatio`；单标的 run 路径不变；summary 其余字段不动
- [x] **2.3 underwater 落盘**：`computeUnderwaterDuration(combinedNavSeries)` 写入 run 更新块
- [x] **2.4 executor spec 更新**（`backtest-run.executor.spec.ts`）
  - 多标的：组合夏普数值断言（构造已知序列）+ `max_underwater_duration` 落盘断言
  - 单标的：sharpe 数值回归断言（与现状一致）

## Phase 3: 数据库

- [x] **3.1 实体**：`BacktestRun` 加 `maxUnderwaterDuration`（int nullable，紧邻 `maxDrawdown`）
- [x] **3.2 migration 032**：`032_add_backtest_underwater_duration.sql`
  `ALTER TABLE backtest_runs ADD COLUMN max_underwater_duration INT NULL`
  （forward-only，严禁复用编号，先于应用镜像生效）

## Phase 4: 查询 API（apps/mist）

- [x] **4.1** `backtest-run-query.service.ts` 字段映射新增 `maxUnderwaterDuration`
  （camelCase 与既有 `maxDrawdown` 并列；单一语义键，不自创同义 key）
- [x] **4.2** 无新端点：run 详情/列表既有资源自然携带

## Phase 5: 验证基线

- [x] **5.1** `pnpm -C mist test:ci`（`--forceExit`）全绿（266 套件 / 2214 用例，0 失败）
- [x] **5.2** typecheck / lint:check 绿；check:magic 为 master 既有基线过期（+92 与本 change 无关，worktree 与 master 违规数同为 2427，本次 diff 新增 0），建议另行重置基线
- [x] **5.3** `/Users/moyui/Library/pnpm/bin/openspec validate add-backtest-underwater-duration-and-portfolio-sharpe --strict`
  0 错误 0 警告
- [x] **5.4** 汇报：自动化通过项 / 跳过项 / 需要生产 HIL 的项（migration 032 上线时随部署验证）
