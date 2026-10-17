# Tasks: 统一量化时序管道（Quant Pipeline）与策略库资产收敛实施计划

> [!IMPORTANT]
> **全流程人机协作与分阶段门禁准则（Phase Gate & Mandatory Checkpoint Rule）**：
> 1. **单阶段严格闭环**：每一个 Phase 必须完成该阶段的所有编码、单测与静态检查，严禁跨 Phase 混杂提交；
> 2. **强制人机审计断点（Mandatory Human Halt）**：每个 Phase 完成后，系统**必须立即停顿**，向人类工程师提交《Phase 交付与审计报告》；
> 3. **严禁自动穿透（Zero Auto-Advance）**：未获得人类工程师明确回复（如“批准 Phase X”或“进入 Phase X+1”）之前，**绝对禁止自动启动下一 Phase 的任何任务**；
> 4. **零破坏性与向前兼容（Zero Breaking Changes）**：所有现有导出符号（`SimulatedBroker`、`PositionStateMachine`、`StrategySimulationSession`）全部保持向前兼容。

---

## Phase 1: 管道核心抽象与 Sinks 契约定义 (`libs/strategy/src/pipeline/`)

- [ ] **1.1 定义 Pipeline 与 Sink 接口协议**
  - 新建 `libs/strategy/src/pipeline/pipeline.types.ts`：
    - 定义 `QuantSink` 接口（`name`、`onBar?(bar)`、`onSignal?(signal, bar)`、`onDayClose?(bar)`、`flush?()`）；
    - 定义 `QuantPipelineConfig`、`PipelineDriveSummary` 与 `PipelineStepResult` 类型；
    - 定义 `isDailyCloseBar(bar, period)` 辅助函数。
- [ ] **1.2 实现统一因果时序管道 `QuantPipeline`**
  - 新建 `libs/strategy/src/pipeline/quant-pipeline.ts`：
    - 实现 `step(bar: StrategyBar): Promise<readonly KernelSignal[]>`：执行 Next-Bar 撮合广播 $\to$ 内核 push 求值 $\to$ 增量信号广播 $\to$ 日终收盘结算；
    - 实现 `drive(source: HistoricalBarSource): Promise<PipelineDriveSummary>`：适配流式历史回放，逐页推进；
    - 实现 `flush(): Promise<void>`：向所有 Sinks 广播结算。
- [ ] **1.3 编写 `QuantPipeline` 单元测试与时序因果断言**
  - 新建 `libs/strategy/src/pipeline/quant-pipeline.spec.ts`：
    - 测试空 Sinks、多 Sinks 链式执行；
    - 验证 `onBar` 先于当期信号求值执行（Next-Bar 因果律保障）；
    - 验证 `isDailyCloseBar` 准确触发 `onDayClose`；
    - 验证驱动异常时的安全熔断与上下文捕获。
- [ ] **1.G Phase 1 准出门禁与人机断点 (Gate 1 Checkpoint)**
  - 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - 运行单测：`pnpm -C mist test libs/strategy/src/pipeline/quant-pipeline.spec.ts` 全绿；
  - 输出《Phase 1 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 2。

---

## Phase 2: 标准 Sinks 插件封装与策略 Lib 资产收敛

- [ ] **2.1 封装 `BrokerExecutionSink`（收敛 `execution/` 与 `position/`）**
  - 新建 `libs/strategy/src/pipeline/sinks/broker-execution.sink.ts`：
    - 组合包装 `SimulatedBroker` 与 `PositionStateMachine`；
    - 在 `onSignal` 时识别 `ENTRY` / `EXIT` 自动生成买卖委托挂单；
    - 在 `onBar` 时驱动 Next-Bar 撮合并将 `OrderFilledEvent` 注入持仓状态机；
    - 在 `onDayClose` 时驱动逐日盯市并沉淀 `DailyNavSnapshot`；
    - 暴露 `getClosedTrades()`、`getNavHistory()`、`getPositionSnapshot()` 与 `getBrokerSnapshot()`。
  - 新建 `libs/strategy/src/pipeline/sinks/broker-execution.sink.spec.ts`：
    - 单元测试覆盖买入开仓、次根成交、T+1 冻结、一字涨跌停拦截与平仓盯市全流程。
- [ ] **2.2 封装 `SimulationFrameSink`（收敛推演帧缓存）**
  - 新建 `libs/strategy/src/pipeline/sinks/simulation-frame.sink.ts`：
    - 负责在每根 Bar 推进时抓取有效滑窗切片（`kernel.readWindow()`）；
    - 格式化当帧产生的信号流与决策证据链；
    - 生成符合图表规范的不可变 `SimulationFrame`；
    - 提供会话级帧缓存读取与 Agent 专属 Dump 快照导出支持。
  - 新建 `libs/strategy/src/pipeline/sinks/simulation-frame.sink.spec.ts`。
- [ ] **2.3 封装 `SignalBatchCollectorSink`（解耦持久化）**
  - 新建 `libs/strategy/src/pipeline/sinks/signal-batch-collector.sink.ts`：
    - 内存缓冲增量信号，支持按批次大小（如 100 条）或 `flush()` 触发持久化消费；
  - 新建对应单测。
- [ ] **2.4 更新 `libs/strategy/src/index.ts` 导出与平滑向前兼容**
  - 导出 `QuantPipeline`、`QuantSink` 及各标准 Sinks；
  - 维持原有 `SimulatedBroker`、`PositionStateMachine` 导出不变，确保旧调用点零破坏。
- [ ] **2.G Phase 2 准出门禁与人机断点 (Gate 2 Checkpoint)**
  - 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - 运行全量策略单测：`pnpm -C mist test libs/strategy` 全绿；
  - 输出《Phase 2 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 3。

---

## Phase 3: `apps/backtest` 回测执行器重构（大幅瘦身）

- [ ] **3.1 重构 `BacktestRunExecutor` 接入 `QuantPipeline`**
  - 修改 `apps/backtest/src/backtest-run.executor.ts`：
    - 移除原本在 `source.drive` 回调中手写的三百余行订单计算与持仓流转胶水代码；
    - 采用标准三段式装配：`HistoricalBarSource` + `StrategyEvaluationKernel` + `BrokerExecutionSink` + `SignalBatchCollectorSink`；
    - 由 `pipeline.drive(source)` 一键驱动执行；
    - 从 `executionSink` 提取交易记录与 NAV 序列，继续调用 `@app/indicators` 计算夏普/卡玛等汇总指标。
- [ ] **3.2 回测执行器闭环回归与 Parity 对账**
  - 运行 `apps/backtest/src/backtest-run.executor.spec.ts`；
  - 运行集成回归测试 `apps/mist/src/strategy/backtest-closed-loop.spec.ts`，确保结果落盘、状态流转与历史对账 100% 逐字段一致。
- [ ] **3.G Phase 3 准出门禁与人机断点 (Gate 3 Checkpoint)**
  - 自动化核验：`pnpm -C mist typecheck` 0 报错；
  - 回测微服务单测：`pnpm -C mist test apps/backtest` 全绿；
  - 主后端回测控制面测试：`pnpm -C mist test apps/mist/src/strategy` 全绿；
  - 输出《Phase 3 交付与断点审计报告》，**显式停顿等待人类确认与批准**，方可进入 Phase 4。

---

## Phase 4: 架构刚性门禁验证、双轨对账与文档沉淀

- [ ] **4.1 扩展架构守门测试**
  - 修改 `libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts`：
    - 新增对账断言：`QuantPipeline` 驱动产出的信号序列与内核原生 push 产出的信号序列 100% 逐条一致。
  - 验证 `libs/strategy/src/strategy-boundary.guard.spec.ts`：确保新引入的 `pipeline/` 0 框架污染、0 I/O 依赖。
  - 验证 `libs/strategy/src/strategy-dual-timestamp.guard.spec.ts`：确保 Next-Bar 撮合时间戳契约无退化。
- [ ] **4.2 更新全仓架构认知文档**
  - 更新 `AGENTS.md`：记录 `QuantPipeline` 管道架构准则与 Sinks 插件使用规范。
- [ ] **4.G Phase 4 最终准出门禁 (Final Gate Checkpoint)**
  - 运行全量策略与回测守门测试全绿；
  - 输出全量重构交付报告。
