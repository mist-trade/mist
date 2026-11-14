# Tasks: 量化策略防过拟合验证、滚动前向（WFA）与极端压力测试工程实施计划

> [!IMPORTANT]
> **全流程人机协作与分阶段门禁准则（Phase Gate & Mandatory Checkpoint Rule）**：
> 1. **Zero Code Modification in Planning**：本阶段为纯规划设计，严禁在此阶段编写或修改任何生产代码；
> 2. **单阶段严格闭环**：未来进入编码阶段时，每个 Phase 必须完成该阶段的所有实现、单测与类型检查，严禁跨 Phase 混杂提交；
> 3. **强制人机审计断点（Mandatory Human Halt）**：每个 Phase 完成后，系统**必须立即停顿**，向人类工程师提交《Phase 交付与审计报告》；
> 4. **严禁自动穿透（Zero Auto-Advance）**：未获得人类工程师明确回复（如“批准 Phase X”或“进入 Phase X+1”）之前，**绝对禁止自动启动下一 Phase 的任何任务**；
> 5. **零破坏性与向前兼容（Zero Breaking Changes）**：既有单次回测接口与核心求值内核 100% 保持向前兼容。

---

## Phase 1: 纯数学极端压力与防过拟合指标算子库 (`libs/indicators/src/performance/`)

- [x] **1.1 扩展纯数学压力指标算子接口与 Polars SIMD 实现**
  - 新建 `libs/indicators/src/performance/stress-metrics.ts`：
    - `computeValueAtRisk(dailyReturns: readonly number[], confidence?: number)`：基于 `pl.col('ret').quantile(1 - confidence)` 向量化计算 VaR；
    - `computeConditionalVaR(dailyReturns: readonly number[], confidence?: number)`：计算低于 VaR 阈值的期望损失（CVaR / Expected Shortfall）；
    - `computeUnderwaterDuration(navSeries: readonly number[])`：向量化统计处于历史回撤状态的最长连续交易日数；
    - `computeLiquidityDelayPenalty(trades: readonly ClosedTrade[])`：计算挂单因 `BLOCKED` 延迟成交产生的额外滑点亏损总额；
    - `computeOverfittingRatio(trainSharpe: number, testSharpe: number)`：计算样本外夏普衰减比率。
- [x] **1.2 编写纯数学单元测试与边界断言**
  - 新建 `libs/indicators/src/performance/stress-metrics.spec.ts`：
    - 针对连续暴跌、极端跳空与平稳震荡序列进行数值级双轨制断言；
    - 验证零亏损、单边牛市与全空仓情况下的防除零与极限保护边界；
    - 坚守纯数学红线：断言 0 外部 I/O 依赖、0 异步 Promise、0 JS 循环。
- [x] **1.G Phase 1 准出门禁与人机断点 (Gate 1 Checkpoint)**
  - 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - 运行单测：`pnpm -C mist test libs/indicators/src/performance/stress-metrics.spec.ts` 全绿；
  - 输出《Phase 1 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 2。

---

## Phase 2: 统一动作与风控裁决器与历史数据防毒门禁 (`libs/strategy/`)

- [x] **2.1 实现历史数据防毒清洗门禁 (`DataSanitizationGuard`)**
  - 在 `libs/strategy/src/kernel/historical-bar-source.ts` 加载入口增加防御校验：
    - 强制断言 `startDate >= 1996-12-16T00:00:00.000Z`，违规立即抛出 `InvalidHistoricalDataBoundaryException`；
    - 新建对应守门测试 `libs/strategy/src/kernel/data-sanitization.guard.spec.ts`。
- [x] **2.2 实现统一动作与风控裁决器 (`ExecutionRiskArbiter`)**
  - 新建 `libs/strategy/src/execution/execution-risk-arbiter.ts`：
    - 统一定义 `MacroRegimeSnapshot` 与 `MarketRiskRegime`（大盘 ATR 分位数与流动性冻结状态）；
    - 实现绝对对称的裁决逻辑：
      - 开仓管卡：大盘雪崩行使一票否决（Veto），冷却期拦截，安全时生成 `BUY ORDER`；
      - 平仓管卡：单一出口三级优先级裁决（大盘雪崩紧急清仓 > 个股硬止损 > 策略形态卖点）；
    - 新建单元测试 `libs/strategy/src/execution/execution-risk-arbiter.spec.ts`，覆盖开仓否决、三级平仓优先级与冷却期测试。
- [x] **2.3 改造 `PositionStateMachine` 消除双头平仓**
  - 修改 `libs/strategy/src/position/position-state-machine.ts`：
    - 拔除内部在 `onBar` 里偷偷下卖单的逻辑，回归纯记账员定位；
- [x] **2.G Phase 2 准出门禁与人机断点 (Gate 2 Checkpoint)**
  - 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - 运行单测：`pnpm -C mist test libs/strategy/src/execution/execution-risk-arbiter.spec.ts` 全绿；
  - 运行守护门禁：`strategy-dual-timestamp.guard.spec.ts` 保持 100% 绿灯；
  - 输出《Phase 2 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 3。

---

## Phase 3: A 股五大历史极端事件压力测试套件 (`libs/strategy/src/stress-testing/`)

- [x] **3.1 固化五大历史压力场景注册表**
  - 新建 `libs/strategy/src/stress-testing/stress-scenarios.constants.ts`：
    - `CRASH_2015`（2015.06 - 2015.08 杠杆股灾千股跌停）
    - `CIRCUIT_2016`（2016.01 熔断闪崩）
    - `BEAR_2018`（2018.01 - 2018.10 贸易战长周期单边阴跌）
    - `SQUEEZE_2024`（2024.01 - 2024.02 微盘挤兑雪球敲入）
    - `PULSE_2024`（2024.09 - 2024.10 924 暴利政策脉冲与极端高开低走）
- [x] **3.2 实现压力测试编排器 (`StressTestingSuiteOrchestrator`)**
  - 新建 `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts`：
    - 接收策略版本定义，批量调度运行五大场景独立子 Run；
    - 汇总生成各场景的生存指标矩阵（最大回撤、跌停延迟滑点、VaR、出清天数）；
    - 输出《极端压力测试体检报告（Stress Health Card）》。
- [x] **3.3 编写压力测试套件单测**
  - 新建 `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.spec.ts`。
- [x] **3.G Phase 3 准出门禁与人机断点 (Gate 3 Checkpoint)**
  - 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - 运行压力套件单测全绿；
  - 输出《Phase 3 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 4。

---

## Phase 4: 自动化滚动步进前向回测流水线 (WFA) (`apps/backtest/` & `libs/strategy/src/wfa/`)

- [x] **4.1 数据库 Migration 029 脚本就绪**
  - 扫描 `deploy/database/migrations/`，确认最大号为 028；
  - 新建 `deploy/database/migrations/029_add_backtest_nav_series_and_suites.sql`：
    - `backtest_runs` 增加 `nav_series`、`benchmark_code`、`parent_run_id`、`suite_id`、`stage`、`scenario_id`、`context_snapshot` 字段及外键约束。
- [x] **4.2 实现纯领域 WFA 算法核心与套件执行编排器**
  - 在 `libs/strategy/src/wfa/` 实现 `WfaWindowSlicer`、`WfaStitcher` 与 `WalkForwardOrchestrator`：
    - 实现 Rolling 与 Anchored 切分算法；
    - 确保时序单调递增，无窥探因果律；
    - 通过 `stitchWfaNavSeries` 将各 Fold 测试集日度净值时序复利缝合成一条无偏见全时序真实前向曲线；
    - 输出参数稳定性指数（PSI）与样本外夏普衰减率。
  - 在 `apps/backtest/src/suite/` 实现 `BacktestSuiteExecutor`：
    - 支持两类套件调度：`WFA` 与 `STRESS_SUITE`；
    - 分派套件 master run 驱动子阶段执行与聚合指标落盘；
- [x] **4.3 暴露回测套件 API 端点与查询服务**
  - 在 `apps/mist/src/strategy/` 中增加 `POST /v1/strategy-backtests/suites` 与 `GET /v1/strategy-backtests/suites/:suiteId` 端点；
  - 保持现有单次回测端点 100% 兼容。
- [x] **4.G Phase 4 准出门禁与人机断点 (Gate 4 Checkpoint)**
  - 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - 运行单测：`libs/strategy/src/wfa/`、`apps/backtest/src/suite/`、`apps/mist/src/strategy/` 全绿；
  - 输出《Phase 4 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 5。

---

## Phase 5: 全链路集成、架构四大门禁与交付流水线

- [x] **5.1 运行架构三大刚性门禁与全仓静态核查**
  - `pnpm -C mist test libs/strategy/src/dev-server-boundary.guard.spec.ts`
  - `pnpm -C mist test libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts`
  - `pnpm -C mist test libs/strategy/src/strategy-dual-timestamp.guard.spec.ts`
  - `pnpm -C mist check:magic` 零硬编码；
  - `pnpm -C mist lint:check` 零告警。
- [x] **5.2 全仓 CI 单测与覆盖率核验**
  - `pnpm -C mist test:ci` 全绿；
  - 确保行覆盖率维持在基线（≥82.72%）以上。
- [x] **5.3 交付物汇总与人类终审闭环**
  - 生成《量化策略防过拟合与极端压力测试工程体系建设交付报告》；
  - 展示 Git Diff 摘要与 Migration 脚本，等待人类最终合入指令。
