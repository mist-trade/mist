# Tasks: 量化决策执行同构架构、交易引擎与持仓状态机体系

> [!IMPORTANT]
> **全流程人机协作与分阶段门禁准则（Phase Gate & Mandatory Checkpoint Rule）**：
> 1. **单阶段严格闭环**：每一个 Phase 必须完成该阶段的所有编码、单测与静态检查，严禁跨 Phase 混杂提交；
> 2. **强制人机审计断点（Mandatory Human Halt）**：每个 Phase 完成后，系统**必须立即停顿**，向人类工程师提交《Phase 交付与审计报告》；
> 3. **严禁自动穿透（Zero Auto-Advance）**：未获得人类工程师明确回复（如“批准 Phase X”或“进入 Phase X+1”）之前，**绝对禁止自动启动下一 Phase 的任何任务**；
> 4. **逐 Phase 共同过审**：人类工程师与 Agent 必须按序过一遍每个 Phase 的设计与交付细节，逐个击破。

---

## Phase 0: 全链路同构硬门禁对齐（Homogeneity Gate）

- [x] **0.1 数据库 Migration 027 双向镜像对齐与数据回填**
  - 新增 `deploy/database/migrations/027_signal_tables_schema_parity.sql`：
    - `strategy_signals` 补齐 `signal_type VARCHAR(32) NOT NULL DEFAULT 'signal'`（解决对账脚本崩溃及细分形态丢失）；
    - `backtest_signal_results` 补齐 `security_id` (INT NULL, FK→securities)、`strategy_definition_id`、`strategy_version_id`、`period`、`source`、`signal_kind` enum('entry','exit')、`signal_source` enum('live','backtest')；
    - `backtest_runs` 增加 `prewarm_status`、`prewarm_min_actual`、`prewarm_min_expected`；
    - 编写存量历史数据安全回填 SQL（从 `securities` 回填 `security_id`，从 `backtest_runs` 级联回填定义/版本/周期/源，从 `decision_trace` 回填 `signal_type`）。
- [x] **0.2 修复回测落盘致命 Bug 与快照对齐**
  - 在 `apps/backtest/src/backtest-run.executor.ts:330-341`（`flushResults`）批量 insert 映射中补齐漏写的 `pivotTime: result.pivotTime`，确保形态极值时间正确落库；
  - 统一在两端将当期撮合基准价 `triggerPrice` 与 `triggerTime` 规范注入 `context_snapshot`；
  - 修改 `apps/signal/src/realtime/live-strategy-persistence.service.ts` 中的 `liveStrategyAlertDedupeKey`，在哈希段中加入 `candidate.signalType`，彻底解决同 Bar 复合信号因告警表唯一键冲突而导致信号回滚的缺陷。
- [x] **0.3 预热机制与内核上下文完全归一**
  - 移除实时侧 `loadRealtimeWindow` 中的 `criteria.requiredBars + 1` 隐式硬编码，两端严格以 `requiredBars` 为基准，消除预热数量 1 根 Bar 偏差；
  - 修复回测 `preWarmEndAt` 从死锁的 09:30 对齐为 `run.startDate`，确保回测与实时在盘中启动时的预热切分完全同构；
  - 修复实时 `RealtimeKernelPool.buildGroup` 错误传入数字 ID `String(bar.securityId)` 的问题，向 Kernel 传入统一规范的标识。
- [x] **0.4 数据清洗、Bar 规范化与游标修复**
  - 将 OHLC 四价几何拓扑合法性校验（`low <= min(o,c)` 且 `high >= max(o,c)`）下沉至 `libs/market-data`，回测读库时统一执行；
  - 实时侧封存 K 线映射（`mapClosedRecord`）补齐调用 `normalizeExternalDecimalText`；
  - 回测执行器向 Kernel 及结果表传递编译归一化后的 `compiled.ruleSnapshot`，补齐 `ruleSchemaVersion === V1` 校验；
  - 修复 `historical-bar-source.ts` 在遇到乱序/重复 Bar 时无条件累加 `barCount` 与触发 `onBar` 回调的单调游标泄漏 Bug。
- [x] **0.5 推演计划身份与编译边界规范化**
  - `SimulationSessionConfig` 注入显式负数哨兵 `SIMULATION_LOCAL_FIXTURE_IDENTITY = { definitionId: -1, versionId: -1 }`，消除隐式 0 身份；
  - `tools/strategy-dev/server.ts` 加载存量定义推演走统一的 `compileStoredDefinitionVersion`。
- [x] **0.G Phase 0 准出门禁与人机断点 (Gate 0 Checkpoint)**
  - [x] 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - [x] 运行单测：`pnpm -C mist test libs/backtest apps/backtest apps/signal libs/strategy libs/market-data` 全绿；
  - [x] 对账脚本验证：`tools/parity-reconcile/run.mjs` 镜像列完整性与三路一致性门禁 `strategy-pipeline-homogeneity.guard.spec.ts` 0 报错通过；
  - [x] 输出《Phase 0 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 1。

---

## Phase 1: 修改原决策树与信号层，去掉关于未来函数的限制（核心任务 1）

- [x] **1.1 决策树与信号契约解绑虚拟撮合依赖**
  - 审视并改造 `DecisionResult` 与 `KernelSignal`：剥离将当根 Bar 收盘价强行当作“虚拟撮合成交价”的语义；
  - 决策树和统一求值内核聚焦于“纯观点表达与证据提取”：产出 `action`（`BUY` / `SELL`）、`confidence` 与 `evidence`（包含用于下游止损锚定的结构点位，如笔底、中枢 `zd`、SMC 订单块等）；
  - 去除决策流中对下游交易假设的冗余过滤。
- [x] **1.2 因子插件责任松绑（卸除交易级防重游标）**
  - 梳理 `libs/strategy/src/plugin/`（重点为 `ChanBspFactorPlugin`）：
    - 插件内部游标保留形态纯数学去重，**彻底卸除跨 Bar 的交易开仓防重逻辑**；
    - 明确开仓与加仓的过滤由下游单标的持仓状态机（`Holding` 状态拦截）承担。
- [x] **1.3 重新定界双时间戳与数据因果律门禁**
  - 重构 `libs/strategy/src/strategy-dual-timestamp.guard.spec.ts`：
    - 明确区分“纯数据因果律”（时序滑窗严禁偷看未来 K 线，刚性保留）与“交易因果律”（移交 `TradingEngine` 处理）；
    - `signalTime` 回归为纯粹的决策确立时间，`pivotTime` 为几何特征时间；
    - 确保架构守门测试在松绑虚拟成交限制的同时，依然能 100% 拦截数据未来函数。
- [x] **1.4 Phase 1 单元测试回归**
  - 运行 `pnpm -C mist test libs/strategy`，确保决策流单测、因子插件单测全部通过。
- [x] **1.G Phase 1 准出门禁与人机断点 (Gate 1 Checkpoint)**
  - [x] 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - [x] 策略与插件单测全绿：`pnpm -C mist test libs/strategy`；
  - [x] 架构门禁通过：`strategy-dual-timestamp.guard.spec.ts` PASS；
  - [x] 输出《Phase 1 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 2。

---

## Phase 2: 增加 TradingEngine 交易引擎（核心任务 2）

- [x] **2.1 交易引擎核心契约与抽象接口**
  - 在 `libs/strategy/src/execution/` 中定义通用契约：
    - `Order`（包含 `orderId`, `securityId`, `side`, `orderType`, `quantity`, `signalTime` 等）；
    - `OrderFilledEvent`（包含实际成交时刻 `fillTime`、成交均价 `fillPrice`、成交股数、费用明细）；
    - `TradingEnginePort` / `ExecutionBrokerPort` 抽象接口，统一回测与实盘执行标准。
- [x] **2.2 A 股因果模拟撮合器（`SimulatedBroker`）**
  - 实现基于 Next-Bar Open 的因果撮合（$t_{\text{fill}} \ge t+1 > t_{\text{signal}}$）；
  - 实现 A 股严格交易规则：
    - **T+1 锁定**：当日买入标的锁定可用股数，禁止日内平仓；
    - **一字涨停买入拒单**（`BUY_REJECTED_LIMIT_UP`）；
    - **一字跌停卖出顺延**（`SELL_BLOCKED_LIMIT_DOWN`，延至次一可交易日继续撮合）；
    - **费用与滑点扣除**：双向万 2.5 佣金（最低 5 元）、过户费、卖出 0.05% 印花税（支持 ETF 自动免税判定）、双向滑点模拟。
- [x] **2.3 盘中触价止损撮合逻辑**
  - 模拟持仓期间的触价成交：
    - 若 `bar.low <= stopPrice`：根据跳空低开情况撮合（若开盘已跌破则以 `open` 成交，否则以 `stopPrice` 扣除滑点成交）。
- [x] **2.4 交易引擎严格时序与规则单元测试**
  - 编写单测套件，覆盖 Next-Bar 撮合因果性、T+1 限制、涨跌停阻断、跳空止损与 ETF 差异化费率。
- [x] **2.G Phase 2 准出门禁与人机断点 (Gate 2 Checkpoint)**
  - [x] 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - [x] 撮合引擎单测全绿：`pnpm -C mist test libs/strategy/src/execution`；
  - [x] 因果性断言：单测验证所有成交事件严格满足 $t_{\text{fill}} \ge t+1 > t_{\text{signal}}$；
  - [x] 输出《Phase 2 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 3。

---

## Phase 3: 增加 PositionStateMachine 单标的持仓状态机（核心任务 3）

- [ ] **3.1 统一单标的持仓状态机核心实现（`PositionStateMachine`）**
  - 在 `libs/strategy/src/position/` 实现单标的独立状态机：
    - 状态迁移：`Empty` ➔ `PendingEntry` ➔ `Holding` ➔ (`PendingPartialExit` ➔ `Holding`) ➔ `PendingExit` ➔ `Closed`；
    - 消费 `TradingEngine` 派发的成交事件驱动状态转换；
    - 维护单标的持仓生命周期状态：`entryBar`, `costPrice`, `highWatermark`, `currentStopLossPrice`, `holdingBars`, `initialRiskR`。
- [ ] **3.2 全量集成 Exit Trinity 出局三部曲（`StrategyExitPolicy`）**
  - 逐 Bar 推进出场策略判定：
    - **通用结构止损**：从买入信号 `evidence` 提取笔底或中枢 `zd` 动态设置结构止损价；
    - **1R 动态保本损**：浮盈达到 1 倍初始风险 R 时，无条件拉升止损线至开仓成本线；
    - **双轨止盈**：目标位减仓 50%（触发 `PendingPartialExit`），剩余 50% 启动 Trailing Stop 追踪；
    - **硬风控兜底与反向卖点**：固定比例止损，以及决策流发出反向 `SELL` 时强制平仓。
- [ ] **3.3 每日收盘逐日盯市（Mark-to-Market）与净值生成**
  - 交易日 15:00 收盘时刻计算单标的总权益：$NAV_t = Cash_t + Position_t \times Close_t$；
  - 维护连续的单标的 `dailyNavHistory: { date: Date, nav: number }[]` 序列；
  - 记录单笔交易闭环的 `TradeResult` 实体。
- [ ] **3.4 状态机与交易引擎协同单元测试**
  - 模拟复杂时序场景（包含 1R 保本迁移、分批减仓、移动跟踪止盈与跌停延期平仓），测试覆盖率 $\ge 90\%$。
- [ ] **3.G Phase 3 准出门禁与人机断点 (Gate 3 Checkpoint)**
  - [ ] 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - [ ] 状态机单测全绿：`pnpm -C mist test libs/strategy/src/position`，覆盖率达标；
  - [ ] 输出《Phase 3 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 4。

---

## Phase 4: 纯数学夏普率算子与双轨业务闭环

- [ ] **4.1 `libs/indicators` 纯数学收益率与夏普率算子（Rust Polars 底座）**
  - 在 `libs/indicators/src/performance/` 实现单标的向量化算子：
    - `computeDailyReturns(navSeries)`；
    - `computeSharpeRatio(dailyReturns, annualRiskFreeRate = 0.02, tradingDays = 250)`；
    - `computeMaxDrawdown(navSeries)`；
    - `computeCalmarRatio(annualizedReturn, maxDrawdown)`。
  - 编写 indicators 边界与单元测试，严禁任何 I/O 与 JS 循环。
- [ ] **4.2 数据库 Migration 028 与实体补齐**
  - 新增 `deploy/database/migrations/028_create_backtest_trade_results.sql`：
    - 创建 `backtest_trade_results` 表；
    - 扩展 `backtest_runs` 表增加 `total_return`, `max_drawdown`, `sharpe_ratio`, `win_rate`, `profit_loss_ratio`, `trade_count`。
  - 在 `libs/shared-data` 声明 `BacktestTradeResult` 实体并关联更新 `BacktestRun` 实体。
- [ ] **4.3 回测执行器重构（`BacktestRunExecutor`）**
  - 将回测历史循环升级为：`HistoricalBarSource` ➔ `StrategyEvaluationKernel` ➔ `TradingEngine` ➔ `PositionStateMachine`；
  - 单标的回测结束时由状态机汇总 NAV 并调用 indicators 算子计算单标的夏普率，批量落盘流水与绩效统计。
- [ ] **4.4 实时链路（`apps/signal`）挂载单标的状态机**
  - 实时消费封存 K 线推流，驱动单标的持仓状态机维持当前持仓、浮盈浮亏与动态止损线。
- [ ] **4.G Phase 4 准出门禁与人机断点 (Gate 4 Checkpoint)**
  - [ ] 纯数学 indicators 边界守门测试全绿；
  - [ ] 回测微服务端到端回放单测通过；
  - [ ] 输出《Phase 4 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 5。

---

## Phase 5: 双轨对账、治理文档与 Web 控制台呈现

- [ ] **5.1 实时 vs 回测双轨 Parity 对账套件**
  - 选取黄金历史样本（如上证指数 000001 等历史切片）；
  - 同时运行 `Signal App` 推流与 `Backtest App` 离线计算，断言产生的 Signal、Order、Trade 逐字逐时间戳对齐。
- [ ] **5.2 治理文档与 Spec 契约同步更新**
  - 更新根目录 `AGENTS.md`：重构【策略信号双时间戳与前沿确认门禁准则】，明确区分“数据因果律”与“交易层因果撮合”；
  - 更新 `openspec/specs/strategy-signal-backtesting/spec.md`：废弃“排除组合回测”的历史禁令。
- [ ] **5.3 Web 控制台（`mist-fe`）页面与 API 联调**
  - 提供 `GET /v1/strategy/backtest-runs/:id/trades` 逐笔流水接口；
  - 在 `mist-fe/app/backtests/` 增加单标的量化绩效卡片（总收益、夏普比率、最大回撤、胜率）与逐笔交易流水审计表格。
- [ ] **5.G Phase 5 终验准出门禁与交付 (Final Delivery Gate)**
  - [ ] `pnpm -C mist typecheck` 0 报错；
  - [ ] `pnpm -C mist test:ci` 全绿通过；
  - [ ] `openspec validate --all --strict` 0 警告 0 错误；
  - [ ] 提交《全案实施与对账验收报告》，由人类工程师完成最终验收。
