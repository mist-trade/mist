# Tasks: 统一策略求值管线

## Phase 1: 内核 push 化（`libs/strategy`）

- [ ] **1.1 StrategySimulationEngine → 纯 push 核心**
  - 废除 allBars 全量构造器与逐帧物化缓存；新契约 `push(bar) → 当期增量信号`；
  - 相位由时间轴判定：`timestamp < publicFrom` 预热相（静默求值、游标推进、不发射），
    `>= publicFrom` 公开相（发射）；
  - 内核不做任何投递级去重/抑制（`RealtimeEpisodeStore` 语义整体删除，chan bsp 去重由
    插件单调游标承担，DSL 连续 matched 逐 Bar 原始发射）；
  - 统一信号形状（五字段双时间戳 + signalType + decisionTrace）；
  - 内核单测：相位切换、窗口不足不判定、单调游标、双时间戳、连续 matched 逐 Bar 发射且
    三链路一致。
- [ ] **1.2 会话层帧缓存下沉**
  - dev-server 仿真会话（`strategy-simulation.session.ts`）自持帧缓存实现
    stepPrev/seek/getCurrentFrame，内核不缓存帧。

## Phase 2: 编译边界收敛（`libs/strategy` / `apps/signal` / `apps/backtest` / `apps/mist`）

- [ ] **2.1 共享编译 helper 收口**
  - 从 `libs/strategy` 导出"存储定义版本 → decision_flow 求值计划"统一编译入口
    （内部分发 `LegacyStrategyCompiler.compileRuleToDecisionFlow` / `compileChanBspToDecisionFlow`）；
  - `signal-registry.service.ts` `compileRegistryDefinition`、
    `backtest-run-command.service.ts` kind 分派、**dev-server 仿真会话
    （tools/strategy-dev）策略装载**三处编译点全部改走该 helper——本地测试的编译产物
    与生产完全一致；
  - `RealtimeStrategyExecutionPlan` 与 backtest plan union 收敛为单一 `decision_flow` 形态。
- [ ] **2.2 新建 chan_bsp 定义封禁与枚举废弃标注**
  - `strategy-definition.service.ts` 创建/启用路径拒绝 `kind='chan_bsp'`（有界 reason：
    `CHAN_BSP_KIND_RETIRED`）；
  - `StrategyKind.CHAN_BSP` 枚举成员加 `@deprecated` JSDoc 注释（独立执行分支已退役，
    存量配置经 LegacyStrategyCompiler 透明编译为决策流树，新建被拒绝，枚举值仅为 DB
    历史数据保留）；
  - 更新管理面 DTO 校验与单测。

## Phase 3: 双 BarSource 适配器与回测切换（`libs/strategy` / `apps/backtest`）

- [ ] **3.1 HistoricalBarSource**
  - 开批先查 `timestamp < publicFrom` 最近 requiredBarCount 根（`loadReplayWindow` 语义）
    作为预热段 push，随后按 `readReplayPage` 页序流式 push；
  - `prewarmStatus: full|partial{actual,expected}|empty` 上报；fake DB 分页单测。
- [ ] **3.2 BacktestRunExecutor 切换**
  - `replaySecurity` 改为 HistoricalBarSource → 内核驱动，落盘器收集当期增量信号
    （signalTime=确认 Bar、pivotTime=evidence 提取）；
  - 应删尽删：executor 内 `ChanBspDetector`/`chanBspCursors`/decision_flow 直连/rule_dsl
    分支、自有 imputer 装配全部移除；
  - `backtest-run-command.service.ts` 删除 chan_bsp 编译分派与 period 白名单分支。

## Phase 4: 实时 lane 切换（`libs/signal` / `apps/signal`，Option A）

- [ ] **4.1 RealtimeSealedBarSource**
  - 封存 candle 触发 → push；窗口缺失 → hydration 拉取历史段作为预热段 push；
  - fake market-data port 单测。
- [ ] **4.2 引擎实例化与 SharedStrategyWindowStore 吸收**
  - 每 `(securityId, source, period)` 组一个内核实例，组内全部 plans 共享窗口
    （1:1 映射现 store 分组语义）；盘前 09:20 hydration、startup compensation、
    retain scope 清理改挂实例池管理层；
  - 删除 `RealtimeStrategyEvaluationService.evaluateChanBsp` / `evaluateStrategyPlan`
    分支、`chanBspDetector`/`chanBspCursors` 成员、**`RealtimeEpisodeStore` 全删**
    （`realtime-episode.store.ts` + evaluation service 的 decide/activate 调用点 +
    `candle-finalized-job.processor.ts:188` 落盘后激活 + diagnostics/retain 中的
    episode 项）、`SharedStrategyWindowStore`（被实例吸收）；
  - `signal-registry.types.ts` / `candle-finalized-job.processor.ts` chan_bsp scope 保留
    身份同步清理。

## Phase 5: 双时间戳落盘与 Migration 026（`libs/shared-data` / `apps/mist`）

- [ ] **5.1 Migration 026**
  - `backtest_signal_results` / `strategy_signals` 加 `pivot_time DATETIME NULL`；
  - 存量回填 `pivot_time = signal_time`（两表全量）；
  - `UPDATE strategy_definitions SET status='disabled' WHERE kind='chan_bsp'`。
- [ ] **5.2 实体与 DTO**
  - `BacktestSignalResult` / `StrategySignal` 实体加 `pivotTime` 列映射；
  - backtest signals 查询 API 与实时 signal 查询 API 响应透传 `pivotTime`；
  - mist-fe 零改动验证（消费逻辑已就绪，仅需契约确认）。

## Phase 6: 门禁与三层测试（`libs/strategy` / `apps/test`）

- [ ] **6.1 guard spec**
  - 新增 `strategy-pipeline-homogeneity.guard.spec.ts`：静态源码扫描（apps/* 禁 import
    `ChanBspDetector`/`ChanBspEpisodeCursor`/`evaluateStrategyPlan`，白名单驱动；求值执行层
    禁 `kind==='chan_bsp'`/`'rule_dsl'` 分派）；
  - **三路 parity 断言**：同一内存 bar fixture 分别经 HistoricalBarSource→内核、
    RealtimeSealedBarSource→内核（fake port）、dev-server 会话驱动，断言
    signalTime/pivotTime/signalType/triggerPrice 逐条一致。
- [ ] **6.2 双时间戳门禁扩展**
  - `strategy-dual-timestamp.guard.spec.ts` 增补：回测落盘与实时落盘路径的
    signalTime/pivotTime 语义（trigger == 确认 Bar，pivot ≤ trigger）。
- [ ] **6.3 本地对账工具**
  - 历史段回放 harness：选定区间历史 K 线经 mysql-free mock 模式按封存节奏推进完整实时
    基础设施（ingress → candle 产品化 → BullMQ → signal app → 落盘）；
  - 与同区间同策略回测任务的 `backtest_signal_results` 逐条比对 `strategy_signal`，
    mismatch 输出双方全字段明细；
  - 输入：securityId + period + 区间 + 策略版本，可重复执行。

## Phase 7: 验证基线

- [ ] **7.1 全量验证**
  - `pnpm lint` / `typecheck` / `test:ci --forceExit` 全绿；
  - `openspec validate unify-strategy-evaluation-pipeline` 通过；
  - `build:docker` 通过（确认无 app 遗漏编译）；
  - 手工冒烟：dev-server 单步推演信号 vs 同区间回测落盘信号对账一致；
  - 对账工具跑一次黄金样本（如 300ETF 5m 某区间）全绿。
