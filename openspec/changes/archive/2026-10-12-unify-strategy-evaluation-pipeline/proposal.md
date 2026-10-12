# Proposal: 统一策略求值管线（三链路同构 + chan_bsp/rule_dsl 独立分支退役 + 双时间戳落盘）

## Why

`strategy-engine-parity-architecture.md` 四层改造的收尾（第三项"双时间戳契约与事件流对齐"扩展）。
2026-09-27 全仓通路普查证实，仿真/网关/前端链路的双时间戳契约与当根确认门禁已就绪，但仍有
3 类独立求值分叉绕过策略树：

1. **实时 chan_bsp 独立通道**：`RealtimeStrategyEvaluationService.evaluateChanBsp`
   （`flowId='legacy_chan_bsp'`）直连 `ChanBspDetector + ChanBspEpisodeCursor`，不经策略树；
   且 `signalTime = event.time` 填的是形态端点时刻，违反双时间戳契约（决策时刻必须是确认 Bar 时间戳）。
2. **回测 chan_bsp 回放分支**：`BacktestRunExecutor` 的 `kind==='chan_bsp'` 分支同样直连
   detector + 游标，落盘 `signalTime = event.time` 语义错位。
3. **legacy rule_dsl 独立分支**：实时 `evaluateStrategyPlan` 与回测对应分支同样绕过策略树。

同时 `LegacyStrategyCompiler`（存量策略透明编译器，rule_dsl / chan_bsp → 决策流树）已存在
但源码零调用——收敛机制现成，只差接线。

用户 2026-09-27 定调：

- chan_bsp 独立执行分支彻底废弃（因子插件 `ChanBspFactorPlugin` 内部逻辑保留）；
- rule_dsl 独立分支一并收敛进策略树；
- 实时链路、单步回测链路、新建回测任务必须走完全一致的实盘数据流
  （bar 封存 → 滑窗 → 策略树 → 增量信号），仅输入/输出适配不同；
- 查看历史回测纯读 DB，不重算；新建回测任务**不需要** SSE 通道，输出即 DB 落盘。

## What Changes

1. **编译边界收敛**：signal registry 与回测命令服务把 `rule_dsl` / `chan_bsp` 存量定义经
   `LegacyStrategyCompiler` 透明编译为决策流树；运行时求值计划收敛为单一 `decision_flow` 形态。
2. **删除独立求值分支**：实时 `evaluateChanBsp` / `evaluateStrategyPlan` 分支、回测
   chan_bsp 回放分支与 rule_dsl 分支全部移除；求值执行层只保留决策流单通路。
3. **内核 push 化与双适配器（Option A：一口气完成，用户拍板）**：`StrategySimulationEngine`
   从"allBars 全量构造 + 逐帧物化"批处理形态改造为纯 push 核心（`push(bar) → 当期增量信号`，
   相位由 `publicFrom` 时间轴判定）；新增 `HistoricalBarSource`（回测/推演）与
   `RealtimeSealedBarSource`（实时）两个 push 适配器；实时 lane 切换为
   `(securityId, source, period)` 组级内核实例，`SharedStrategyWindowStore` 被吸收；
   **`RealtimeEpisodeStore` 发射去重整体删除**（用户拍板：现存语义存疑，投递级抑制归未来
   独立计算引擎），chan bsp 去重由插件单调游标承担，DSL 连续 matched 逐 Bar 原始发射、
   实时/回测行为一致。
4. **预热统一规则**：预热 = push 流里 `publicFrom` 之前的普通 bar 段，供给责任在数据源
   适配器（历史：`loadReplayWindow` 语义；实时：hydration 语义）；预热不足统一降级
   （`prewarmStatus: full|partial|empty` 落盘，窗口不满不判定不发射），三条链路同一条规则。
5. **双时间戳落盘**：migration 026 给 `backtest_signal_results` 与 `strategy_signal` 增加
   `pivot_time` 列；存量记录回填 `pivot_time = signal_time`（行为等价：前端回退逻辑下
   Marker 位置不变）；API DTO 透传 `pivotTime`（mist-fe 零改动，消费逻辑已就绪）。
6. **存量 chan_bsp 策略定义停用**：migration 026 将 `kind='chan_bsp'` 的
   `strategy_definitions` 置为 `disabled`；新建 chan_bsp 定义入口同步封禁（编译透明支持保留）。
7. **三链路同构门禁 + 三层测试套件**：guard spec（源码扫描禁独立分支 + 三路运行时 parity
   断言）CI 守门；本地集成层提供历史段回放对账工具（mock 模式推进实时全链路 vs 回测落盘
   逐条比对）；dev-server 交互检查辅助。
8. **查看历史回测保持纯读 DB，不加回测 SSE**（用户拍板：新建回测任务无需 SSE 通道）。

## Impact

- **specs**：新增 capability `strategy-evaluation-pipeline`；REMOVED
  `chan-bsp-realtime-evaluation`、`chan-bsp-backtest-evaluation` 全部 requirements（独立通道
  语义收编进新 capability 与因子插件契约）；MODIFIED `realtime-strategy-evaluation` 的
  "Realtime Evaluation Shall Dispatch By Plan Kind"（单通路语义）。
- **code**：`apps/signal`、`apps/backtest`、`apps/mist`、`libs/signal`、`libs/strategy`、
  `libs/shared-data`、`deploy/database/migrations/026_*`。
- **mist-fe**：零改动（`pivotTime` 优先消费 + 回退逻辑已就绪）。
- **语义变化（契约修正，非回归）**：chan_bsp / rule_dsl 存量信号的 `signalTime` 从形态端点
  时刻修正为确认 Bar 时间戳（详见 design.md §6 注释：旧独立分支把形态端点时刻当决策时刻，
  相当于极值当刻即"知道"信号成立，属未来函数倾向；修正后 signalTime=确认 Bar 时刻、
  形态端点时刻移入 pivotTime，前端 Marker 几何位置不变）；chan_bsp 存量定义被停用，
  恢复使用需转换为决策流定义；`RealtimeEpisodeStore` 发射去重删除后，实时侧 DSL 策略
  对连续 matched 条件逐 Bar 原始发射（与回测一致），投递级抑制留待独立计算引擎。
- **明确不做**：回测 SSE（用户拍板无需）；`pivot_price` 独立列（已在 decisionTrace JSON 中）；
  `upgrade-backtest-decision-and-parity-engine` 的状态机/撮合器范围不受影响。
