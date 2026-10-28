# Tasks: add-tactical-event-aggregation-layer

## Phase 1: 领域模型与核心契约 (libs/strategy/src/tactical-event)

- [x] 1.1 创建 `libs/strategy/src/tactical-event/tactical-event.types.ts`，定义：
  - `TacticalEvent`（事件 ID、买卖意图、确认时间戳、极值时间戳与价格、归因证据链）
  - `TacticalAggregatorConfig`（边沿插件列表、时序观察窗规则、冷却 Bar 数）
  - `ActiveObservationWindow`（活跃观察窗运行时内部状态）
- [x] 1.2 编写单测 `tactical-event-types.spec.ts`，验证数据结构的不可变性与契约约束

## Phase 2: 边沿检测器与状态微分 (Edge Detection)

- [x] 2.1 实现 `libs/strategy/src/tactical-event/edge-detector.ts`：
  - 跟踪每个插件的上一状态 `lastPluginState: Map<string, string>`
  - 针对指定状态插件（如 `plugin.regime.*`），仅在状态由 `NOT_BULL -> BULL`（0 -> 1）时发射脉冲，在持续期内严格静默
- [x] 2.2 编写单测 `edge-detector.spec.ts`：
  - 验证连续 500 根 Bar 的 `BUY` 状态仅在第 1 根放行脉冲
  - 验证状态翻转交替时的边沿精准捕捉与重置

## Phase 3: 因果时序观察窗引擎 (Temporal Window Consensus)

- [x] 3.1 实现 `libs/strategy/src/tactical-event/temporal-window-engine.ts`：
  - 维护活跃观察窗口池 `Map<string, ActiveObservationWindow>`
  - 当收到触发信号（Trigger）时开窗，记录 `expiresAtBarIndex = startBarIndex + W`
  - 在后续 Bar 推进中监听确认信号（Confirmation Tags），收齐条件时合成 `TacticalEvent`
  - 严格保持双时间戳：`timestamp` 赋值为当期确认 Bar 时间戳，`pivotTime` 继承触发信号形态极值时间戳
  - 超时未确认静默注销窗口，无内存残余
- [x] 3.2 编写单测 `temporal-window-engine.spec.ts`：
  - 验证 $t+1 \sim t+W$ 窗口内确认成功合成事件与双时间戳保真
  - 验证超时自动消亡与多触发并发窗口隔离

## Phase 4: 战术冷却去抖与统一门面 (Aggregator Facade)

- [x] 4.1 实现 `libs/strategy/src/tactical-event/tactical-cooldown-tracker.ts`：
  - 在发射 `TacticalEvent` 后锁定 $K$ 根 Bar，抑制同向过度交易与震荡磨损
- [x] 4.2 实现统一门面 `libs/strategy/src/tactical-event/tactical-event-aggregator.ts`：
  - 串联 `EdgeDetector` $\to$ `TemporalWindowEngine` $\to$ `TacticalCooldownTracker`
  - 暴露纯函数式流式推进接口 `push(rawSignals: readonly KernelSignal[], bar: StrategyBar): TacticalEvent[]`
- [x] 4.3 编写全流程单测 `tactical-event-aggregator.spec.ts`，覆盖边沿化、时序窗、冷却三合一流水线

## Phase 5: 消费端接入与三链路同构对接

- [x] 5.1 本地回测与推演接入（`tools/strategy-dev/server.ts`）：
  - `HistoricalBarSource.drive()` 产生的 rawSignals 流经 `TacticalEventAggregator`
  - 将生成的 `tacticalEvents` 输送给 `ExecutionRiskArbiter` 与 `SimulatedBroker`，替换原先的裸信号直接撮合
  - HTTP 响应中同时保留 `rawSignals`（原始调试透视）与 `tacticalEvents`（战术买卖点）
- [x] 5.2 实时信号应用接入（`apps/signal/src/realtime/candle-finalized-job.processor.ts`）：
  - 仅将经汇聚层确认的 `TacticalEvent` 写入 `strategy_signals` 与 `strategy_alert_events`，从源头消灭告警风暴
- [x] 5.3 门禁回归核验：
  - 运行 `strategy-pipeline-homogeneity.guard.spec.ts` 确保三链路同构逐条一致
  - 运行 `strategy-dual-timestamp.guard.spec.ts` 确保因果律无未来函数

## Phase 6: 前端图表多层可视化 (Dual-View UI)

- [x] 6.1 在 `mist-fe/app/backtests/utils/backtest-signal-visual.util.ts` 中拆分图层转换器：
  - `layer: 'tactical_events'`：高对比度显式战术徽章（如 `2买+放量`）
  - `layer: 'raw_signals'`：半透明/灰度点状标记，专供算法调试排查
- [x] 6.2 在 `mist-fe/app/backtests/BacktestWorkspace.tsx` 对接战术事件图层加载与纯净命令隔离

## Phase 7: 数据实测对账与验证交付

- [x] 7.1 在数据上重跑 ② 宏观体制与 ⑦ 复合树策略：
  - 验证 ② 宏观体制信号数由 2,275 条成功收敛为 88 条边沿事件（降幅 96.1%），对应 43 笔闭环交易，盈亏比 1.1515
  - 验证 ⑦ 复合树在时序观察窗赋能下的夏普比率由 -0.6152 成功翻正至 +0.0301，盈亏比由 0.8065 升至 1.2035，最大回撤压制在 8.52%
- [x] 7.2 运行全仓 CI 校验与规范归档
