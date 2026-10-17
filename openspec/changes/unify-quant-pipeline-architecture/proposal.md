# Proposal: 统一量化时序管道（Quant Pipeline）架构与策略库资产收敛

## 1. 背景与核心痛点

在完成统一求值内核（`unify-strategy-evaluation-pipeline`）后，Mist 系统的决策层已经实现了由 `StrategyEvaluationKernel` 驱动的三链路同构（回测、实时、推演共用一套推式决策树计算）。但在当前的系统组织中，仍存在以下三大核心架构痛点：

1. **输入与输出适配的不对称与割裂**：
   - **输入端**：回测流式适配器 `HistoricalBarSource` 存放在 `libs/strategy/src/kernel/`，而实时流式适配器 `RealtimeKernelPool` 却存放在 `libs/signal/src/runtime/`，两者同为向内核喂 K 线的 Push Adapter，物理安放不对称。
   - **输出端**：回测的信号后处理（`SimulatedBroker` 撮合、`PositionStateMachine` 仓位管理、NAV 盯市与持久化）被硬编码在 `apps/backtest/src/backtest-run.executor.ts` 的长回调中；而实时的信号后处理（防抖、入库、BullMQ 扇出投递）硬编码在 `apps/signal` 的 Worker 中。两者缺乏统一的时序动作分发机制。
2. **策略库（`libs/strategy`）严重领域膨胀（Bloated Domain Lib）**：
   - `libs/strategy` 目前累积达 70 个文件、11,613 行代码。它不仅承载了本职的“Alpha 信号与决策流”，还塞入了**“模拟撮合与 A 股制度 (Execution)”**、**“单标的持仓状态机与盯市 (Position)”**、**“本地带定时器与帧缓存的推演会话 (SimulationSession)”** 以及 **“数据库实体持久化映射 (signal-persistence-mapper)”**。
   - 策略领域库的职责半径过大，混淆了 Alpha 策略（“发信号”）、交易撮合（“能否成交、扣多少税”）与资产记账（“持仓多少、净值几何”）的边界。
3. **回测执行器代码臃肿且胶水重复**：
   - `apps/backtest/src/backtest-run.executor.ts` 承载了 673 行代码，手工串联了 `HistoricalBarSource`、`StrategyEvaluationKernel`、`SimulatedBroker`、`PositionStateMachine`、批处理分块及 NAV 记录。若未来实时增加模拟盘或开发新的推演模式，类似胶水代码将大量重复复制。

---

## 2. 目标与范围（Scope & Goals）

### 2.1 核心目标

1. **抽象统一因果时序管道（`QuantPipeline`）**：
   - 在 `libs/strategy/src/pipeline/` 构建标准的管道编排核心：`QuantPipeline(Source, Kernel, Sinks[])`。
   - 规范输入端口 `BarSource`（支持 Pull 历史流与 Push 实时流）。
   - 保留并复用现有的 `StrategyEvaluationKernel` 作为不可动摇的纯计算中枢。
2. **构建标准输出端插件体系（`QuantSink`）**：
   - 统一定义 Sink 生命周期钩子：`onBar(bar)`、`onSignal(signal, bar)`、`onDayClose(bar)`、`flush()`。
   - **回收 `execution/` 与 `position/`**：封装为标准的 **`BrokerExecutionSink`**，统一托管 Next-Bar 撮合、A 股制度保真、T+1 锁定与 NAV 盯市。
   - **回收 `simulation/`**：封装为标准的 **`SimulationFrameSink`**，统一托管几何指令转换、决策证据链捕获与帧缓存生成。
   - **构建 `SignalPersistenceSink` 与 `AlertDeliverySink`**：解耦实体持久化与通知下发。
3. **彻底净化 `libs/strategy`**：
   - 将散落在外的执行、仓位、推演与映射器全部收编为标准 Sink 插件，形成内聚的管道资产。
   - 保持 0 依赖纯领域属性（严禁引入 NestJS/TypeORM/Redis/BullMQ 等外部 I/O 与框架）。
4. **重构 `apps/backtest` 并保持物理进程隔离**：
   - `apps/backtest` 的 `BacktestRunExecutor` 瘦身为纯粹的“装配 Pipeline + 挂载 `BrokerExecutionSink` + 执行”的轻量调度器（预计精简 300+ 行重复胶水代码）。
   - 保持微服务物理隔离：回测继续作为独立 RPC Worker（CPU 密集沙盒），实时继续作为独立 Daemon（毫秒级低延迟），坚决杜绝 Node.js Event Loop 饥饿与 OOM 连带崩溃。
5. **门禁与对账零退化（Zero Regressions）**：
   - 既有的四大守门测试（`strategy-pipeline-homogeneity.guard.spec.ts`、`strategy-dual-timestamp.guard.spec.ts`、`strategy-boundary.guard.spec.ts`、`dev-server-boundary.guard.spec.ts`）全部保持 100% 绿灯。
   - 回测落盘结果与实时信号对账（Parity Testing）逐字一致。

### 2.2 非目标（Out of Scope）

- 不改变现有的数据库 Schema 表结构（`backtest_runs`、`backtest_signal_results`、`backtest_trade_results`、`strategy_signals` 保持不变）。
- 不改变现有的外部微服务 RPC 与 HTTP 接口（`apps/mist` 与 `apps/backtest` 的 TCP 协议完全向前兼容）。
- 暂不将回测与实时合并为同一个单体进程部署（坚持多进程微服务编排）。

---

## 3. 关联影响与依赖

- **核心受益模块**：
  - `libs/strategy`: 架构由散装走向规整，内聚为标准的 Kernel + Pipeline + Sinks 体系；
  - `apps/backtest`: 极大简化 `backtest-run.executor.ts`，消除样板代码；
  - `tools/strategy-dev`: 获得标准 `SimulationFrameSink` 支持，进一步减薄网关层；
  - `apps/signal`: 奠定未来平滑接入模拟盘交易（Paper Trading）的同构基石。
