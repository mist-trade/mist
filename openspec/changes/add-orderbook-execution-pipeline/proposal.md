> **状态：已作废（2026-11-23）。** 本变化中的订单簿撮合、账本、独立执行进程不再实施；
> 最新结论见 `docs/strategy-signal-aggregation-decisions-2026-11-23.md`。

# 变化提案：信号聚合与订单簿执行管线 (Proposal)

## 一、背景 (Why)

当前 Mist 的策略链路已经完成「K 线 → 统一求值内核 → 战术事件 → 信号/告警持久化」，但
**信号之后没有任何执行层**：

- 实时链路 `apps/signal` 只写 `strategy_signals` 与 `strategy_alert_events`，不产生订单；
- 回测链路 `apps/backtest` 使用 `SimulatedBroker.onBar(bar)`，以「次根 Bar 开盘价 + 固定滑点」
  成交，无法表达盘口深度、部分成交、价差与冲击；
- `ExecutionRiskArbiter` 以「单标的、单仓位、可用现金全押」为前提，无法承载同一标的上多个
  公共/私有策略同时发信号；
- QMT native tick 的 `native` 原对象在桥接层保留了 `bidPrice` / `askPrice` 等档位字段（测试夹具
  可见），但 canonical 快照只消费最新价，下游没有订单簿存储、没有撮合引擎、没有实盘 Broker 适配。

用户提出的两个核心问题是：

1. **信号要聚合**：同一标的上可能同时有多个通道（公共策略、私有策略、不同周期）发出 BUY/SELL，
   不能逐条直接下单；必须先做去重、冲突裁决、预算分配与组合限额。
2. **要按订单簿成交**：成交不能再用「下一根 Bar 开盘价 + 固定滑点」近似，必须消费盘口快照，
   按价格优先、时间优先的档位逐层吃单，支持部分成交、限价保护与 A 股制度约束。

本变化在信号层与 Broker 之间新增一个独立的**执行域（Execution Domain）**，把「策略观点」
转换为「组合动作」，再把「组合动作」转换为「订单簿成交」。公共策略与私有策略走完全相同的
执行管线，执行层不感知策略来源，只认通道与配置。

## 二、现状对账 (Current State)

| 环节 | 现状 | 证据 |
|---|---|---|
| 通道标识 | 内核信号携带 `(definitionId, versionId, period)`，通道键为 `definitionId:period` | `libs/strategy/src/kernel/kernel.types.ts:68-86` |
| 实时边界 | `ShadowStrategyCandidate` 与实时 Job 重建信号时丢弃 `channel` / `intent` / `originPluginId` | `libs/signal/src/runtime/realtime-strategy-evaluation.service.ts:138`、`apps/signal/src/realtime/candle-finalized-job.processor.ts:219` |
| 战术聚合 | 已按 `(securityId, source, period)` 做跨插件触发+确认聚合，但输出仍是逐定义的 `TacticalEvent`，且不落独立实体 | `libs/strategy/src/tactical-event/tactical-event-aggregator.ts` |
| 信号持久化 | `StrategySignal` + `StrategyAlertEvent` 单事务写入，无执行意图 outbox | `apps/signal/src/realtime/live-strategy-persistence.service.ts:42` |
| 回测撮合 | `SimulatedBroker.onBar` 次根开盘价 + 固定滑点；一字板/T+1/费用已实现 | `libs/strategy/src/execution/simulated-broker.ts:175` |
| 下单裁决 | `ExecutionRiskArbiter` 单仓位、全押、无跨策略预算 | `libs/strategy/src/execution/execution-risk-arbiter.ts:75` |
| 持仓账本 | `PositionStateMachine` 以标的为粒度，无通道子账本 | `libs/strategy/src/position/position-state-machine.ts:27` |
| 盘口数据 | QMT native tick 保留 `native` 原对象（含档位），但 `CanonicalRealtimeSnapshot` 只暴露 last/open/high/low/lastClose | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:39`、`apps/mist/src/realtime/realtime.types.ts:10` |
| 实盘交易 | 无 Broker 适配、无账户/订单/成交表、无实盘开关 | `docs/realtime-strategy-signal-pipeline.md` 第 5 节；`docs/project-quality-governance-guide.md` §6.7 |

> 结论：当前系统是 **signal-level** 的；本变化是第一次把「执行」作为一等能力引入，必须
> 显式更新治理文档中「组合级回测/主动交易执行延期」的边界，但不复用已延期的
> `feat/strategy-portfolio-backtesting` 分支。

## 三、目标 (Goals)

1. **跨策略信号聚合**：以 `(securityId, emittedAt)` 为聚合纪元，把同一决策时刻到达的所有通道
   信号收敛为最多一个 `AggregatedOrderPlan`，并保留每个通道的分配量与抑制原因。
2. **订单簿撮合**：定义标准 `OrderBookSnapshot` 契约，按档位吃单，支持部分成交、限价保护、
   盘口参与率上限、A 股涨跌停/停牌/集合竞价/T+1/整手/费用。
3. **组级归因账本**：物理账户一本账，策略归因按 `(securityId, ledgerGroupKey)` 拆分子账本；
   成交按分配量回写，费用按成交额分摊，日终与物理账对账。
4. **三形态同构**：回测（历史盘口回放）、模拟盘（实时盘口、不下真单）、实盘（真实 Broker）
   共用同一套聚合、下单、分配、账本逻辑，仅 `BrokerPort` 与 `BookSource` 不同。
5. **可审计、可重放、可降级**：任一订单都能追溯到信号、聚合计划、盘口快照与分配明细；
   盘口缺失/过期/交叉时显式降级，不静默假装成交。

## 四、非目标 (Non-Goals)

- 不改变策略求值语义、决策树、战术事件规则；本变化只消费其输出。
- 不做完整交易所仿真（排队位置、逐笔委托、隐藏单、撤单风暴）；首期只做**主动吃单**
  （marketable limit），被动挂单排队模型留到后续阶段。
- 不支持期货、期权、融资融券、ETF 申赎；只做 A 股现货。
- 不恢复旧 `feat/strategy-portfolio-backtesting` 分支，不复用其 migration 编号与表结构。
- 首期不做前端交易终端；只提供后端执行状态查询与审计接口。

## 五、变更内容 (What Changes)

1. **执行意图 outbox**：`apps/signal` 在信号事务内写 `execution_intents`，携带通道、账本组、
   意图类型、`emittedAt` 与有效期；提交后发布，失败可补发。
2. **执行聚合器**：按 `(securityId, emittedAt)` 聚合，完成去重、通道状态对账、`EXIT_FIRST`
   冲突裁决、`RISK_CUT` 优先级、组预算、组合限额与抑制审计。
3. **订单簿契约与数据面**：新增 `OrderBookSnapshot` 投影，从 QMT native tick 取 L1 档位，
   Redis 热存 + 按日归档 + 覆盖率元数据；不修改现有 canonical candle 快照。
4. **订单簿撮合引擎**：marketable limit 保护、逐档吃单、参与率上限、部分成交、A 股制度、
   费用与成交分配。
5. **双账本**：物理账户账本 + `ledgerGroup` 归因子账本；成交按比例分配，费用分摊，日终/重连
   对账；支持 `UNASSIGNED` 组承接无法归属的持仓。
6. **单写者执行进程**：新增 `apps/execution`，消费 intents 与 book，拥有订单、成交、账本；
   回测在进程内复用同一引擎，模拟盘与实盘只替换 `BrokerPort`。
7. **回测扩展**：新增 `executionModel: 'bar' | 'orderbook'` 与同标的多策略组合回测；默认
   `bar` 行为不变。
8. **治理更新**：同步 §6.7 的延期边界，明确旧 portfolio 分支不可复用。

## 六、能力变更 (Capabilities)

### New Capabilities

- `execution-signal-aggregation`：跨通道信号去重、冲突裁决、预算分配、组合限额、抑制审计、
  执行意图 outbox。
- `orderbook-execution`：盘口快照契约、数据面、限价保护、逐档撮合、部分成交、费用、
  通道分配、物理/通道账本、降级与对账。

### Modified Capabilities

- 无。现有 `tactical-event-pipeline`、`realtime-strategy-evaluation`、`backtest-trade-decision`
  的语义保持不变；本变化在其下游新增执行域。

## 七、影响 (Impact)

- **新增代码域**：优先在现有 `libs/strategy/src/execution` 边界内扩展纯领域引擎（P0/P1），
  待 `unify-quant-pipeline-architecture` 的 Sink 方向落地后再评估是否抽出独立 `libs/execution`；
  新增 `apps/execution` 作为单写者守护进程（P2 起）。
- **新增数据**：执行意图 outbox、聚合计划、订单、成交、分配、通道持仓/批次、审计日志；
  盘口原始快照走 Redis 热存 + 列式文件归档，不写 MySQL 大表。
- **新增适配**：QMT 盘口快照适配（优先）、TDX 能力探测、QMT 交易 API 适配（实盘阶段）。
- **现有代码**：`SimulatedBroker` 保留为 `bar` 撮合模式；新增 `orderbook` 模式，回测默认不变。
- **配置**：公共仓只放契约与保守默认值；通道权重、预算、优先级等策略相关配置放私有仓，
  由既有私有配置加载机制注入，公共仓不得出现私有策略名称。
- **治理**：需同步更新 `docs/project-quality-governance-guide.md` §6.7，把「主动交易执行」
  从「明确延期」调整为「由本变化按阶段引入」，并保留旧 portfolio 分支不可复用的约束。
- **风险**：实盘交易涉及真实资金，必须默认 `DISARMED`、人工武装、单笔限额、对账漂移自动
   disarm；首期实盘只允许小资金验证。
