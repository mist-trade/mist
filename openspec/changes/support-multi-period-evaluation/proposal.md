# Proposal: Support Multi-Period Strategy Evaluation

> 本 change 合并并取代未开工的 `add-pre-market-strategy-hydration`（2026-10-13 重写版）：
> 两者都要重写 `RealtimeKernelPool` 的分组与预热，分两个 change 会先后重写同一段代码。
> 盘前预热（09:20 屏障 + Polars 质检 + 跨日守卫）作为本 change 实时链路的一部分交付，
> 原 change 目录随本 change 创建一并移除。

## Why

> 现网基线（2026-10-25 实查）：生产 22 条策略定义**全部 `disabled`**，signal registry 无活跃组，
> **当前没有任何实时求值在跑**。因此本 change 对现网行为零影响——它不是修复"正在错跑的东西"，
> 而是**启用第一条 5m/30m/日线策略前的正确性前置**（定义中已存在 `periods=[1440]` 的策略）。

## Why

统一求值内核目前是**单周期**的：`StrategyEvaluationKernel` 只维护一个
`StrategySeriesImputer` 窗口，`buildContext()` 只暴露当前周期的一条 `bars` 序列；
`HistoricalBarSource` 绑死一个 `(securityId, source, period)`；`RealtimeKernelPool`
按 `(securityId, source, period)` 分组、组间互不感知。

而下游多级别因子插件需要**本级别 + 次级别 + 日线**
三个周期的同步推进：它们从共享黑板 `attributes` 读取 `subBars` / `subBars5m` /
`daily.ma5` / `prevDailyLow` 等键——但**全仓没有任何地方写入这些键**，插件在回测与
实盘中永远静默返回 `NEUTRAL + degraded`（不报错、不告警、信号永不出现），单测因手工
注入数据而全绿。

同时，回测需要 2005→现在的超长历史。canonical 行情序列
（`2026-10-25-introduce-canonical-market-series`，已归档）已让下游只认
`(security, period)`，但实时链路的历史仍按触发源严格取数（source-exact），与回测
不同源；且实时派生周期的时间戳是左标（slot 起点），canonical 历史是右标（bar 结束
时刻），多周期一旦并流，同一根 bar 会出现两套时间身份。

## What Changes

1. **内核多周期窗口（公共能力）**：
   - `StrategyEvaluationKernel` 从"单窗口"扩展为"每个声明周期一个独立窗口"；
     `push(bar)` 按 `bar.period` 落入对应窗口。
   - 每个求值计划（plan）声明 `evaluationPeriod`（= 现有 period）与
     `contextRequirements`（context 周期 → 最少 bar 数）。
   - **context 需求由因子插件元数据推导**（`resolveContextRequirements(params)`），
     编译边界遍历决策流树求并集——延续"策略定义不存调用方 lookback"的既有契约，
     rule JSON 与数据库 schema 零改动。
   - 求值时内核把每个声明周期的窗口快照写入共享黑板
     `attributes['series.<period>']`（只读、只含 `<= 当前时间戳` 的 bar）；
     `FactorContext` 契约不变，不加字段。
   - **fail-closed**：声明周期窗口不足 → 该 plan 本次不判定（`insufficient_history`），
     绝不带着空上下文求值；插件读到未声明的 series 键 → 显式求值失败，严禁静默
     `NEUTRAL`。

2. **多序列合并推流（回测/推演）**：
   - `HistoricalBarSource` 扩展为多序列源：按 plan 声明的周期集合，每个周期独立
     `loadReplayWindow` / `readReplayPage`（全部走 canonical），按时间戳 k 路归并；
     同一时间戳**低周期先推、高周期后推**。
   - 预热按周期分别计（每周期独立 `requiredBars`），聚合状态取最差；
     `prewarm_min_actual/expected` 继续记录求值周期。
   - **执行引擎只由求值周期 bar 驱动**：context bar 只进窗口，不得驱动
     broker / 持仓 / NAV 日结。

3. **实时多周期与 R2（回测/实时同源）**：
   - `RealtimeKernelPool` 分组从 `(securityId, source, period)` 改为
     `(securityId, source)`，组内每周期一个窗口；求值服务不再按 bar.period 预过滤
     plan，全部 bar 进内核，由内核按 plan 求值周期分派。
   - **R2 数据接缝**：当日之前的历史走 **canonical**（与回测同一策略版本），
     当天 bar 只来自触发源（一天内不换源）。`StrategyDefinition.sources` 只约束
     触发源资格。
   - **实时新增 1440 日线派生**：当日 242 个 1m 桶聚合，15:00 会话终端桶封存时
     闭合；`REALTIME_STRATEGY_PERIODS` 扩展为 `[1, 5, 15, 30, 60, 1440]`。
   - **派生周期时间戳对齐为右标（slot 结束时刻）**：与 canonical 历史的
     provider-native 时间标签一致；未到边界的进行中 slot 不得进入预热窗口
     （与既有"不得 emit 边界晚于 anchorAt 的派生 bar"场景对齐）。

4. **盘前多周期预热（承接原 `add-pre-market-strategy-hydration`）**：
   - `@app/timezone` 新增 `CRON_PRE_MARKET_STRATEGY_WARMUP_0920`；
     `apps/signal` 09:20 对全部活跃组按**周期集合**预热（canonical 历史 +
     当日已封存段），Polars 向量化质检（逐周期、有界失败原因、单标的隔离），
     预构建组内核（`publicFrom = anchorAt`），首根封存 bar 零历史 I/O；
     交易日翻转不清空当日已预热组；健康端点透出预热状态。

## Capabilities

### Modified Capabilities

- `strategy-evaluation-pipeline`：单管线需求改为多周期窗口组语义；新增多序列合并
  推流与 context 声明/注入需求。
- `strategy-market-context`：source-exact 窗口需求替换为 canonical 历史 + 当日触发源
  （R2）；派生周期需求修改（时间戳右标 + 1440 日线）；新增多周期分组需求。
- `realtime-strategy-evaluation`：新增盘前多周期预热需求（合并原 change）。
- `trading-timeline-governance`：新增 09:20 盘前预热 Cron 常量。
- `backtest-runtime`：canonical 回放需求扩展为多周期（求值周期 + context 周期），
  明确 context bar 不驱动执行引擎。
- `factor-plugin-contract`：新增插件 context 需求声明与 fail-closed 契约。

## Impact & Non-Goals

- **Impact**:
  - `libs/strategy`：`KernelPlan` / `KernelConfig` 多周期化；内核多窗口与黑板注入；
    `HistoricalBarSource` 多序列归并；插件元数据 `resolveContextRequirements`。
  - `libs/signal`：`RealtimeKernelPool` 分组与预热；`RealtimePeriodBuilder` 右标 +
    1440；`RealtimeStrategyEvaluationService` 全 bar 透传。
  - `apps/signal`：period builder 周期集合含 context 周期；09:20 预热编排与跨日守卫；
    `SignalHealthVo` 预热区块。
  - `apps/mist`（signal adapter）：`loadRealtimeWindow` 历史段走 canonical。
  - `apps/backtest`：多周期 replay、预算计数、`onBar` 仅求值周期。
  - `libs/market-data`：Polars 序列质检纯函数。
- **Non-Goals**:
  - 不改 `FactorContext` 字段契约（多周期走既有 `attributes` 黑板）。
  - 不新增数据库表/列；不新增回测 API 字段（context 由策略版本编译推导）。
  - 不做投递级去重/抑制（维持既有边界）。
  - 不改 1m 生产桶的左标 242 桶宇宙（仅派生周期对齐右标）。
  - 不引入"快照观察"（unsealed K）求值。
