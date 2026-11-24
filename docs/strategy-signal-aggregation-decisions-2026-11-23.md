# 策略信号聚合与 K 线左右标口径 — 讨论纪要

- 日期：2026-11-23
- 状态：时间模型已实施（2026-11-23）；战术事件层已整体删除（2026-11-24）；下一步重新设计消息聚合、状态过滤与时间口径
- 适用范围：公共策略 + 私有策略的买卖点聚合、飞书通知、人工交易
- 关系：本文件取代 `openspec/changes/add-orderbook-execution-pipeline/` 中的订单簿撮合、
  账本、独立执行进程设计；那份设计不再作为实施依据

---

## 一、本轮已经确认的结论

1. **只做消息和人工买卖**，不做自动下单、不做订单簿成交、不做撮合引擎。
2. **不做账本**，不记录持仓/成本/盈亏；只保留“买入/卖出点”和策略归因。
3. **不新增进程**；聚合放在现有 `apps/notification`（飞书投递所在进程）里。
4. **不需要新的 outbox**；现有 `StrategyAlertEvent` + `strategy_alert_deliveries` + BullMQ
   已经是持久化事件 + 投递状态 + 重试/死信的模式。
5. **不把防未来函数下沉到聚合层**；封存 Bar 的因果保证留在信号层，下一根 K 开盘的成交假设
   留在回测/执行层。
6. 用户所说的“T+1”= **当前 K 出信号、下一根 K 开盘成交**，不是 A 股“当日买入不可卖”的
   结算制度。消息层不实现它；人工看到消息后自行决定何时下单。
7. 聚合的产出是**一条带多策略归因的飞书消息**，不是订单、不是指令、不是账本。
8. **回测与实时共用同一个 `effectiveTime` 口径**；回测在查询/展示时计算，不新增 DB 列。
9. 战术事件层已于 2026-11-24 **整体删除**：`TacticalEventAggregator`、EdgeDetector、
   TemporalWindowEngine、CooldownTracker 及其配置/类型全部移除；`apps/signal`、
   `apps/backtest`、`tools/strategy-dev` 改为直接消费 `KernelSignal`。
   归因改走 `StrategySignal.decisionTrace.trace`，不再依赖 `TacticalEvent.contributors`。
   重新设计见第七节，时间口径待重看见第八节。

---

## 二、现状代码事实

### 2.1 信号时点

| 环节 | 现状 | 代码 |
|---|---|---|
| 策略 Bar 类型 | `complete` / `incomplete` | `libs/market-data/src/strategy-bar.ts:30` |
| 实时触发 | 只接受封存的 1m Bar，`type` 必须是 `complete` | `libs/strategy/src/kernel/adapters/realtime-period.builder.ts:178` |
| 信号时间 | `signalTime = bar.timestamp`（Bar 标签，不一定是封存时刻） | `libs/strategy/src/kernel/strategy-evaluation-kernel.ts:527` |
| 内容可用时刻 | `availabilityKey(bar)` 统一换算成封存时刻 | `libs/strategy/src/kernel/availability.ts:27` |
| 回测归并 | 按 `(availabilityKey, period)` 升序，等价于实时触发到达序 | `libs/strategy/src/kernel/historical-bar-source.ts:64,208` |
| 实时 hydration | 按 `availabilityKey` 过滤未闭合 slot | `libs/strategy/src/kernel/adapters/realtime-kernel-pool.ts:318` |

### 2.2 成交与 T+1

| 事情 | 现状 | 代码 |
|---|---|---|
| 同 Bar 不成交 | `bar.timestamp <= signalTime` 直接跳过 | `libs/strategy/src/execution/simulated-broker.ts:234` |
| 下一根 K 开盘成交 | 买/卖都取下一根 Bar 的 `open` + 滑点 | `libs/strategy/src/execution/simulated-broker.ts:259-292` |
| 当日买入不可卖 | 买入记 `frozenQuantity`，日终 `settleDayClose` 解锁 | `libs/strategy/src/execution/simulated-broker.ts:402,316` |
| 持仓状态机 | 只记账、出场策略，不判断 T+1 | `libs/strategy/src/position/position-state-machine.ts` |

结论：

- **信号层**只保证“Bar 封存后才求值”，不做 T+1。
- **Broker/持仓层**负责“下一根 K 开盘成交”和“当日买入不可卖”。
- 这两件事都不能搬到聚合层；聚合层只有已经持久化的信号，没有 Bar 序列和持仓。

### 2.3 通知链路

```text
apps/mist 封存 1m candle
  → BullMQ strategy-trigger
  → apps/signal worker（concurrency 1）
  → 写 StrategySignal + StrategyAlertEvent
  → BullMQ strategy-alert-delivery（deliver.fanout → deliver.channel）
  → apps/notification worker（一个进程，concurrency 4）
  → Feishu webhook
```

关键代码：

- `apps/notification/src/main.ts:9`：单进程，端口 8006
- `apps/notification/src/delivery/strategy-alert-delivery.worker.ts`
- `apps/notification/src/delivery/alert-fanout.service.ts`
- `apps/notification/src/delivery/alert-channel-delivery.service.ts`
- `apps/notification/src/channels/feishu.channel-adapter.ts`
- `libs/contracts/src/signal/strategy-alert-delivery.contract.ts:19`：worker concurrency 4

飞书消息已经包含策略名、周期、信号时间、方向、价格、置信度：

- `apps/notification/src/delivery/notification-envelope.ts:54-56,114`

### 2.4 实时求值的边界

现行 spec 明确排除 snapshot 求值：

> V1 SHALL process deterministic `candle_finalized` triggers ... and SHALL exclude
> snapshot-update evaluation.
> 未来若要做未封存 K 的求值，必须单独开 focused change；不能要求回测模拟 snapshot。
> —— `openspec/specs/realtime-strategy-evaluation/spec.md:282-300`

所以“盘中一出现就发”不是聚合层能解决的，它必须在信号层新增一条盘中路径，并单独立 spec。

---

## 三、聚合方案（只发消息）

### 3.1 聚合键

```text
aggregateKey = securityId + availabilityKey(signalTime, period)
```

不按方向分组，这样一个时间片里的买入和卖出可以放进同一条消息。

为什么不用 `signalTime`：

- 1m 标签 09:59，封存 10:00
- 30m 标签 10:00，封存 10:00
- 日线标签 00:00，封存 15:01

按 `signalTime` 分组，1m 和 30m 永远差一分钟；按 `availabilityKey` 才能对齐。

### 3.2 数据与归因

- `strategy_signals` 一行一个**内核信号**（每个 definition 在每个求值周期、每根 Bar
  最多一条）。
- 归因不再造第二层事件：`decisionTrace.trace` 已经保存完整链路
  （regime / chan / vpci / terminal），消息直接渲染它。
- `strategy_alert_events` 保持“一条信号一条告警”，不新增 `tactical_event_key` /
  `contributors`。
- 不需要账本，也不需要新表/新列。

### 3.3 投递流程

1. `apps/signal` 写 `StrategySignal` + `StrategyAlertEvent`（每个候选一条）。
2. `deliver.fanout` 看到可聚合的 alert 后，投一个延迟 3 秒的 `deliver.aggregate` job，
   jobId 用 `aggregate:<aggregateKey>` 去重。
3. `deliver.aggregate`：
   - 取同一 `aggregateKey` 下所有 PENDING 的 AlertEvent
   - 一次 `IN` 查询关联 `strategy_signals`，读 `decisionTrace.trace`
   - 合成一条飞书消息
   - 成功后把这批子事件标记 SENT，写同一个 providerMessageId
4. 窗口结束后才到的信号，自己成为下一组 leader，补发一条；不做复杂水位补偿。

### 3.4 消息格式

```text
[Mist] 600000 浦发银行 买入 @ 10.23 | 10:00
- 策略A 30m 二买 [HIGH 85%]
- 策略B 1m 底背离 [MEDIUM 70%]

[Mist] 600000 浦发银行 卖出 @ 10.23 | 10:00
- 策略C 1m 顶背离 [HIGH 80%]
```

- 同一时间片同时有买入和卖出：一条消息分两段，卖出在前，不净额。
- 只有一条信号：保持现有单条消息格式，向后兼容。
- 聚合层不判断“该不该交易”，只做归因合并。

---

## 四、K 线左标/右标：特殊理由

> 术语说明：这里说的是 K 线**时间戳标签**的左标/右标，不是买卖价格的左值/右值。
> 如果你指的是形态端点的“左价/右价”，见 4.5。

### 4.1 三种标签约定

| 周期 | 标签约定 | 历史实测（000001/QMT，2026-10-25） |
|---|---|---|
| 1m | **左标**：桶起点 `bucketStartMs` | 241 根/天，09:30..11:30 + 13:00..15:00，含 11:30/15:00 终端根 |
| 5/15/30/60m | **右标**：槽终点 `slotStart + period` | 48/12/8/4 根/天，09:35/09:45/10:00/10:30 起 |
| 1440 日线 | **日期身份 00:00(D)**：既非左标也非右标 | QMT 日线 00:00 标签实测 |

### 4.2 为什么不能统一成一种标签

不是随便选的，是**对齐各周期历史数据的原生约定**：

1. **1m 历史就是左标**
   生产库的 1m K 线是 241 根/天，09:30..15:00，含 11:30/15:00 终端根；这与 mist producer
   的左标 242 桶宇宙同构。实时 1m 保持左标，实时/历史天然同标签，无接缝。
   如果实时改右标，所有 1m 历史、Redis key、trigger 契约、HIL fixture 都要迁移。

2. **5/15/30/60m 历史是右标**
   QMT 历史 5m 是 48 根/天，09:35 起；30m 是 8 根/天，10:00 起。实时派生 bar 必须用右标，
   才能和 canonical 历史同刻同标签。否则回测读历史、实时读派生，同一根 30m 会对不上。

3. **日线历史是 00:00(D) 日期身份**
   QMT 日线标签是交易日 00:00，不是 15:00。实时日线由当日 242 个 1m 桶聚合，时间戳也用
   00:00(D)，回测/实时同构。展示时必须表述为“交易日 D 的已完成日 K”，不能读成
   “00:00 时刻形成的数据”。

**结论：派生周期对齐历史，不迁移历史。** 统一标签是系统级重做，不值得，也会破坏
实时/历史同构。

### 4.3 终端桶吸收

11:30 和 15:00 的 1m 终端根（含收盘竞价）要并入当日最后一个派生窗口：

- 5/15/30/60m 的最后一窗吸收 11:30/15:00 终端桶；
- 终端桶是可选成分：sealed 并入 OHLCV，discarded 不造数；
- 完整性只按常规成分根数判，终端桶缺席不标 `incomplete`，否则会与历史 `complete` 冲突。

### 4.4 可用时刻键 `availabilityKey`

裸标签跨周期不可比较，必须换算成“内容封存时刻”：

| 周期 | `availabilityKey` |
|---|---|
| 1m | `label + 1min`（桶封存） |
| 5/15/30/60m 常规窗 | `label`（右标 = 窗口事件末） |
| 5/15/30/60m session 末根（11:30/15:00） | `label + 1min`（随终端桶封存） |
| 1440 | `15:01(D)`（末成分 = 15:00 终端桶） |

它解决两处真实的未来函数：

1. **5m 09:35 求值**（覆盖 09:30–09:35）如果按裸标签 `<=` 过滤 1m 上下文，会把 1m 09:35
   根（内容 = [09:35,09:36) 的未来分钟）放进快照。
2. **日线 00:00(D)** 排在当日所有分钟 bar 之前；30m 09:30 求值会看到当日日线（含当日收盘），
   回测自身就有未来函数。

回测归并按 `(availabilityKey, period)` 升序，恰好等于实时触发到达序：

```text
同一个 1m 触发 T 携带：1m-T + 以 T 桶为末成分的 5m/15m/30m/60m + 日线
组内顺序：1m → 5m → 15m → 30m → 60m → 1440
```

### 4.5 作用域边界（当时用户确认过）

`availabilityKey` 只作用于**数据可用性**：

- 归并顺序
- 窗口保留
- 上下文快照

**严禁触碰信号发射侧**：

- 不过滤
- 不延迟
- 不抑制
- 不重排

信号侧因果（t 决策、t+1 撮合）归执行引擎层；两层不得互相越界。

这条边界正是现在讨论“信号要马上发”时最重要的约束：

- 不能为了聚合对齐，用 `availabilityKey` 去延迟信号；
- 聚合层只能在信号已经发出后，按 `availabilityKey` 分组；
- 想让信号更早，只能在信号层新增盘中触发/临时信号。

### 4.6 如果你说的是“形态端点的左价/右价”

系统里有另一组左右概念，和上面的时间标签不是一回事：

| 字段 | 含义 | 用途 |
|---|---|---|
| `signalTime` | 确认 Bar 的时间戳（右侧闭合确立时刻） | 信号归因、撮合因果、图表 marker 的时间基准 |
| `triggerPrice` | 确认 Bar 的收盘价（决策观察价） | 信号价格展示，**不是成交价** |
| `pivotTime` | 形态端点发生的时间（左/右端点、笔/段端点、分型极值） | 图表几何定位、形态结构归因 |
| `pivotPrice` | 形态端点价格（如一买最低价） | 初始止损参考、结构锚点 |

特殊理由：

- 不能用左端点的价格当信号价格，否则等于用形态起点的旧价格发信号；
- 不能用左端点的时间当信号时间，否则会回溯到过去，破坏单调游标；
- 信号价格用确认 Bar 收盘价，形态端点价格只作为止损/结构参考；
- 成交价不在信号层产生，由执行层在下一根 K 开盘决定。

---

## 五、“信号要马上发”的三层延迟

| 延迟来源 | 现状 | 能否消除 |
|---|---|---|
| **Bar 未封存** | 1m 最多 60s，30m 最多 30min | 不能，除非做盘中临时信号/价格触发器 |
| **消息显示的时间** | 1m 显示 09:59，实际 10:00 封存；日线显示 00:00，实际 15:01 | 能，改用 `availabilityKey` 显示 |
| **封存后的管道** | 封存 → signal worker → DB → fanout → Feishu | 能，测量后优化队列/写入 |

### 5.1 先修显示（已实施 2026-11-23）

`notification-envelope.ts:56` 用的是 `signal.signalTime`（Bar 标签）。改成
`availabilityKey({ period, timestamp: signalTime })` 作为“信号生效时间”：

- 1m 显示 10:00，而不是 09:59
- 日线显示 15:01，而不是 00:00
- 30m 不变（右标就是封存时刻）

这不改任何信号语义，也不需要新字段。实时 `StrategySignalVo`、回测
`BacktestSignalResultVo`、dev server 都已补 `effectiveTime`，飞书消息已改用它。

### 5.2 量真实延迟

可以用现有字段算“封存 → 送达”：

```text
StrategyAlertDelivery.sentAt - availabilityKey(signalTime, period)
```

- 如果只有几百毫秒，主要问题是显示；
- 如果几秒，再优化管道（减少队列跳数、合并 fanout/channel、提高 worker 并发）。

### 5.3 如果确实要盘中发

两条路，都属于**信号层的新能力**，不是聚合层：

**A. 价格触发器**

- 封存 Bar 上预先算关键价位（突破位、止损位、目标位）
- 实时最新价穿越即发
- 不重绘，可用 tick/快照回放验证
- 只适用于“价格到位就成立”的信号

**B. 盘中临时信号（Provisional）**

- 用当前正在形成的 K 跑策略，条件满足就发 `[未确认]`
- 封存时发 `[已确认]` 或 `[已取消]`
- 会重绘，Bar 回测复现不了，需要 tick 数据
- 消息必须明确标注未确认

现行 spec 明确要求：未封存 K 的求值必须单独开 focused change，且不能要求回测模拟 snapshot。
所以这条路要单独立项，不能在聚合层偷偷做。

---

## 六、全系统时间字段盘点（保留 / 派生 / 废弃 / 移出）

> 目标：当前只做“消息 + 人工买卖”，时间字段只保留真正参与决策、归因、展示、审计的部分。
> 执行/账本类时间不进入信号与通知域。

### 6.0 一页结论

| 问题 | 结论 |
|---|---|
| 要不要第三个时间？ | 不要。`availabilityKey(signalTime, period)` 已经是统一的可执行时刻 |
| 要不要 `triggerTime`？ | 信号域不要；只保留在 `candle_finalized` 传输契约 |
| 每条信号保留几个语义时间？ | 两个：`signalTime`（确认 Bar）、`pivotTime`（形态极值） |
| 消息显示哪个时间？ | `effectiveTime`（派生），不是 Bar 标签 |
| 回测怎么算？ | 同一 `availabilityKey`，查询/展示时派生，不落库 |
| 归因为什么丢？ | Aggregator 先用跨定义共享的 Edge/Cooldown 丢掉第二个策略，再把事件压成 definition 集合；告警主体又是确认信号 |
| 归因怎么修？ | 信号直发 + 按 `(securityId, effectiveTime)` 聚合 + 渲染 `decisionTrace.trace`；不再造 `TacticalEvent` / `contributors` |
| 战术层现在做了什么？ | 已整体删除（6.14）；删除前实测只做单点事件 + Cooldown，Edge/Window 空转（6.12） |

> 时间与归因是同一条链上的两件事：`effectiveTime` 决定“哪些信号属于同一时刻”，
> `decisionTrace.trace` 决定“这条信号由哪些节点/插件贡献”。
> 前者已经落地，后者已经存在于每条 `StrategySignal` 里，不需要再造事件层。

### 6.1 分层

| 层 | 回答的问题 | 是否进入信号/通知 |
|---|---|---|
| 市场时间 | 这根 K 是什么时候的？内容什么时候可用？ | 是 |
| 信号时间 | 哪根 Bar 确认了信号？形态极值在哪？ | 是 |
| 运营时间 | 什么时候落库、发送、确认？ | 只做审计/延迟 |
| 执行时间 | 什么时候成交、持仓、结算？ | 否（回测/执行域） |

> 所有 TypeORM 实体的 `created_at` / `updated_at` 统一视为数据库审计时间，不参与信号/通知语义；
> 本表不逐一列出。

### 6.2 保留（必要）

| 字段 | 层 | 用途 | 说明 |
|---|---|---|---|
| `StrategyBar.timestamp` | 市场 | Bar 标签 | 1m 左标、5/15/30/60m 右标、日线 00:00(D) |
| `CanonicalRealtimeSnapshot.eventTime` / `capturedAt` | 市场 | 快照事件/接收时间 | 行情入口、质量判定、延迟观测 |
| `CandleFinalizedTriggerV1.triggerTime` | 传输 | 1m 桶触发、jobId、同日校验 | **只属于队列/触发契约**，不是信号时间 |
| `KernelSignal.signalTime` | 信号 | 决策确认 Bar 标签 | 归因、图表 marker、回测 |
| `KernelSignal.pivotTime` | 信号 | 形态几何极值 | 图表定位、初始止损参考 |
| `TacticalEvent.timestamp` | 战术 | 合成事件的**确认时刻** | 复合事件的确认 Bar；不要删 |
| `TacticalEvent.triggerSignal.signalTime` | 战术 | 合成事件的**触发时刻** | 复合事件的触发 Bar；用于归因 |
| `StrategySignal.signalTime` / `pivotTime` | 持久化 | 同上 | DB 只保留这两列语义时间 |
| `BacktestSignalResult.signalTime` / `pivotTime` | 回测 | 与实时同义 | 回测信号同样只有这两个语义时间 |
| `StrategySignal.createdAt` | 运营 | 落库时间 | 延迟统计、审计 |
| `StrategyAlertEvent.createdAt` / `acknowledgedAt` | 运营 | 告警创建/人工确认 | 投递、人工确认 |
| `StrategyAlertDelivery.sentAt` | 运营 | 飞书发送时间 | 端到端延迟、审计 |
| `FactorContext.timestamp` | 求值输入 | 当前求值 Bar | 插件只读，不持久化 |
| `KernelDiagnostics.lastPushedTimestamp` | 诊断 | 最后推进的 Bar | 仅诊断，不是契约 |
| `ActiveObservationWindow.openTimestamp` | 战术内部 | 观察窗开启 | 仅内存，不持久化 |

### 6.3 派生（不存储）

| 概念 | 来源 | 用途 | 说明 |
|---|---|---|---|
| `effectiveTime` | `availabilityKey(signalTime, period)` | 聚合分组、消息展示 | 1m = 标签+1m；30m = 右标；日线 = 15:01 |
| `StrategySignalVo.effectiveTime` | `availabilityKey(signal.signalTime, signal.period)` | 实时 API 展示 | 服务端计算，不新增 DB 列 |
| `BacktestSignalResultVo.effectiveTime` | `availabilityKey(result.signalTime, result.period)` | 回测 API/报告/导出 | 服务端计算，不新增 DB 列 |
| `aggregateKey` | `securityId + effectiveTime` | 多策略分组 | 不落库，或用一列索引 |
| `triggerTime`（信号域） | `signalTime.toISOString()` | 序列化/兼容 | 只在边界临时生成，不存字段 |
| `orderKey` | 同 `availabilityKey` | 数据归并排序 | 统一叫 `availabilityKey`，不再引入别名 |
| 消息里的“信号时间” | `effectiveTime` | 飞书展示 | 不再直接展示 Bar 标签 |

### 6.4 废弃 / 删除

| 字段 | 原因 | 处理 |
|---|---|---|
| `KernelSignal.triggerTime` | 与 `signalTime` 完全等价（ISO 字符串） | 从领域类型移除；序列化时临时生成 |
| `ShadowStrategyCandidate.triggerTime` | 同上 | 移除；用 `signalTime` |
| `contextSnapshot.triggerTime` | 同上 | 新写入不再包含；旧 JSON 保留 |
| `SignalPersistencePayload.triggerTime` | 同上 | 移除 |
| `DecisionTraceSnapshot.timestamp` | 未使用，默认 `new Date()`，非确定性 | 删除或强制传 `signalTime` |
| `StrategyAlertEvent.cooldownUntil` | 只写 `null`，无消费方 | 已删除列（migration 035） |
| `TacticalEvent.timestamp` | **不是重复字段** | 复合事件的确认时刻，保留 |
| `TacticalEvent.pivotTime/pivotPrice` | 可从 `triggerSignal` 读取 | 便利字段，可保留；不是主要时间膨胀源 |

### 6.5 移出当前范围

| 字段 | 归属 | 处理 |
|---|---|---|
| `Order.signalTime` / `createdAt`、`OrderFilledEvent.fillTime` | 回测/执行 | 留在执行域，不进入信号/通知 |
| `PositionSnapshot.entryTime`、`PositionClosedRecord.entryTime/exitTime` | 回测/执行 | 留在执行域 |
| `BacktestTradeResult.entryTime/exitTime`、`BacktestRun.startedAt/completedAt` | 回测 | 留在回测域 |
| `emittedAt` / `receivedAt` / `expiresAt` / `asOf` / `deadline` | 已作废设计 | 不引入 |
| `acquiredAt` / `availableAt` | 未实现的账本 | 不引入 |

> 注意：回测的**信号时间**仍按 6.2/6.3 的最小模型（`signalTime` + `pivotTime`，`effectiveTime` 派生）；
> 只有 `entryTime`/`exitTime`/`fillTime` 这类成交/持仓时间留在回测/执行域。

### 6.6 最小时间模型

```text
bar.timestamp（Bar 标签）
  ├─ availabilityKey（派生）→ effectiveTime → 聚合 / 消息展示
  ├─ signal.signalTime（= 确认 Bar 标签）→ 归因 / 图表
  └─ signal.pivotTime（形态极值）→ 图表 / 止损参考

运营时间（不属于信号语义）：
  createdAt / updatedAt / sentAt / acknowledgedAt
```

规则：

1. 每条 `strategy_signals` 只存两个语义时间：`signal_time`、`pivot_time`。
2. `effective_time` 永远派生，不落库。
3. 信号域不存 `triggerTime`；传输层的 `triggerTime` 保留在队列契约里。
4. 不引入 `emittedAt` / `receivedAt`；消息延迟用 `created_at`、`sent_at` 衡量。
5. 回测/执行时间留在回测/执行域，不进入信号/通知契约。
6. 确定性 payload 禁止 wall clock；`DecisionTrace` 如需时间，传 `signalTime`。
7. 复合事件保留两个时刻：触发 `triggerSignal.signalTime`、确认 `TacticalEvent.timestamp`；
   前者用于归因，后者用于消息/聚合。
8. 对外消息只展示一个时间：`effectiveTime`；图表用 `signalTime` + `pivotTime`。
9. 回测与实时共用同一个 `availabilityKey`；回测信号 VO/查询/导出必须带 `effectiveTime`（服务端计算，不落库）；成交 `entryTime`/`exitTime` 仍是成交时间，不替代 `effectiveTime`。

#### 6.6.1 计算落点（实时与回测）

| 场景 | 计算位置 | 说明 |
|---|---|---|
| 实时信号 API | `StrategySignalVo` 映射处 | `availabilityKey(signalTime, period)` |
| 实时飞书消息 | `apps/notification/src/delivery/notification-envelope.ts:56` | 用 `effectiveTime` 替代直接展示 `signalTime` |
| 回测信号 API | `apps/mist/src/strategy/services/backtest-run-query.service.ts:281` `mapResult` | `availabilityKey(result.signalTime, result.period)` |
| 回测报告/前端展示 | 复用同一 VO 映射 | 必须带 `effectiveTime` |
| 多策略聚合 | `aggregateKey = securityId + effectiveTime` | 不落库，或用一列索引 |
| 图表 marker | `signalTime` + `pivotTime` | 不用 `effectiveTime` 作为几何定位时间 |

> 回测不新增 DB 列：`BacktestSignalResult` 已有 `period` 和 `signalTime`，在查询/展示时计算即可（如有导出，复用同一映射）。
> 这样实时与回测共用同一个 `availabilityKey`，结果逐位一致。

### 6.7 归因缺口的根因（2026-11-24 补，代码级）

结论先说：归因丢失不是消息模板的问题，而是**告警主体选错了**，而且在到达告警之前，
Aggregator 已经用两个“跨定义共享”的去重键把第二个策略的事件丢掉了。完整因果链：

```text
KernelSignal[]（每个 definition 每根 Bar 最多一条）
  → EdgeDetector（状态按 pluginId 共享）        ← 第二个 definition 的同状态被抑制
  → TemporalWindowEngine（窗口按 security+period 共享）
  → CooldownTracker（按 securityCode:action 去抖） ← 第二个策略的同向入场被抑制
  → TacticalEvent[]（trigger + confirmingSignals + badge + reason）
  → Set<definitionId:versionId>                  ← 事件本体在这里丢失
  → persist(candidate, isTactical)
  → StrategyAlertEvent(strategySignalId = 确认信号)
  → 消息只读这一行确认信号
```

下面按这条链拆成八个根因。

#### 6.7.1 前提：内核每根 Bar 每个 definition 只产出一个信号

`StrategyEvaluationKernel.evaluatePublic`（`libs/strategy/src/kernel/strategy-evaluation-kernel.ts:467`）
按 plan 循环，只有 `decision.status === 'SIGNAL_EMITTED'` 且 action 为 BUY/SELL 时才 push
一个 `KernelSignal`。所以：

- 同一 definition 里的多个插件（`plugin.chan.bsp`、`plugin.tactics.volume-price-confirmation`
  等）不会各自产出信号；
- 信号只有一个 `signalType`（终端节点的 `signalTag`），不是 contributor 列表；
- “谁触发、谁确认”只存在于 `DecisionTrace.trace` 和 `TacticalEvent.triggerSignal/confirmingSignals` 里。

这是后面所有问题的前提：**归因不可能从 `strategy_signals` 的列里直接读出来。**

还有一个更早的丢失点：`toCandidate`
（`libs/signal/src/runtime/realtime-strategy-evaluation.service.ts:136-166`）只复制了
`definitionId/versionId/signalKind/signalTime/triggerPrice/pivotTime/pivotPrice/signalType/
confidence/decisionTrace/contextSnapshot/ruleSnapshot`，没有复制 `originPluginId`、`badgeText`、
`displayTag`、`channel`、`intent`；processor 再用 candidate 重建 `KernelSignal` 时也补不回来。
所以即使把 `TacticalEvent` 原样保留，contributor 的 `pluginId` / `badgeText` 也已经在边界上丢了。

#### 6.7.2 根因 1：EdgeDetector 的状态按 pluginId 共享，跨 definition 互相抑制

`TacticalEventAggregator` 是按 `securityId|source|period` 创建的
（`apps/signal/src/realtime/candle-finalized-job.processor.ts:212`），但 `EdgeDetector`
的 `lastPluginState` 只按 `pluginId` 建键
（`libs/strategy/src/tactical-event/edge-detector.ts:4,11-28`）。

私仓 `tactical-aggregator.json` 把 `plugin.tactics.volume-price-confirmation`、
`plugin.tactics.bull-left-right-bsp`、`plugin.tactics.bear-left-right-bsp`、
`plugin.tactics.fibonacci-confluence`、`plugin.regime.shanghai-index` 都列进了 `edgePlugins`。
当两个 definition 同时挂这些插件时：

- 第一个 definition 的 BUY 把 `lastPluginState[pluginId]` 写成 `BUY`；
- 第二个 definition 的同一状态被判定为“无变化”，`detect` 返回 `null`；
- 第二个 definition 的确认信号根本进不了窗口引擎 → 它的复合事件不会产生。

这不是“同一条信号重复”，而是**两个独立策略被当成一个状态机**。状态键必须加
`definitionId`（`${definitionId}:${pluginId}`），否则多策略同标的时只有第一个策略能确认。

#### 6.7.3 根因 2：CooldownTracker 按 `securityCode:action` 去抖，跨策略压掉同向入场

`TacticalCooldownTracker` 的键是 `${event.securityCode}:${event.action}`
（`libs/strategy/src/tactical-event/tactical-cooldown-tracker.ts:11-34`，键在 `:21`），
`cooldownBars` 私仓配置为 3。也就是说：

- 同一标的、同一方向，**4 根 Bar 内最多只放行一个 ENTRY 事件**；
- 两个策略在同一根 Bar 都确认 BUY → 第一个写入 `lastEntryBars`，第二个
  `currentBarIndex - lastBar = 0 <= 3` → 直接抑制；
- 两个策略在相邻 Bar 确认 BUY → 同样抑制。

这是“多个策略同时出买点，只看到一个”的**最直接原因**。冷却本来是为了给同一个战术规则
去抖，但键里没有 `definitionId`，也没有触发标签，实际效果是跨策略去重。

这说明它不是“没用”，而是**放错了层**：

- 它原本服务的是回测/持仓。2026-10-28 引入战术汇聚层时，目标是解决复合树
  “平均持仓被碎割到 2.8 天、夏普 -0.6152”的问题
  （`openspec/changes/archive/2026-10-28-add-tactical-event-aggregation-layer/proposal.md:10`），
  `tactical-event-pipeline` 也把它写成了硬性要求
  （`openspec/specs/tactical-event-pipeline/spec.md:50`）。
- 但“入场后 K 根 Bar 内不再开新仓”是**持仓/执行**约束，不是**信号/消息**约束。
  现在聚合层只产消息和人工买卖点，没有自动开仓，这层冷却只剩下“少发一条消息”的效果。
- 它的键是 `securityCode:action`，测试里甚至明确把 `pullback_buy` 当成
  `breakout_buy` 的同向后续抑制（`libs/strategy/src/tactical-event/tactical-event-aggregator.spec.ts:185-275`）。
  这正是多策略归因丢失的直接原因。

建议：**从 `TacticalEventAggregator` 移除冷却**。如果回测仍需要“平仓后 K 根 Bar 内
不再入场”的防抖，把它下沉到 `ExecutionRiskArbiter`（那里已经有持仓和订单裁决），
而不是在信号层跨策略丢事件。短期可以先不改代码，把私仓
`tactical-aggregator.json` 的 `cooldownBars` 设为 0，跑一段震荡行情对比事件数、告警数
和回测成交数，再决定是否彻底删除。

#### 6.7.4 根因 3：事件被压成 definition 集合

`TacticalEventAggregator.push` 返回 `TacticalEvent[]`，每个事件带 `triggerSignal`、
`confirmingSignals`、`badgeText`、`reason`、`eventId`。但 processor 只用它算了一个集合：

```ts
const tacticalEventSet = new Set(
  tacticalEvents.map((te) => `${te.definitionId}:${te.versionId}`),
);
```

然后事件本体就被丢掉了（`apps/signal/src/realtime/candle-finalized-job.processor.ts:235-243`）。
后果：

- N 个事件 → 1 个 definition 集合；
- 触发腿、确认腿、合成 badge、`reason`、`elapsedBars` 全部在这一步消失；
- 后面无论消息怎么改，都没有数据可归因。

#### 6.7.5 根因 4：判定粒度是 definition，不是信号

`isTactical` 的判定是：

```ts
tacticalEventSet.has(`${candidate.definitionId}:${candidate.versionId}`)
```

而 `TacticalEvent.definitionId` 取的是**触发信号**的 definition
（`libs/strategy/src/tactical-event/temporal-window-engine.ts:398`）。同一个集合同时存在两种错判：

- **漏判（跨 definition）**：触发在 A，确认信号来自 B。确认候选的 definition 不在集合里
  → `isTactical=false` → **不生成 AlertEvent，消息完全消失**。
- **误判（同 definition）**：集合里有 A，那么 A 在这根 Bar 上的任何候选都会
  `isTactical=true`，即使它只是开了一个新窗口、并不是确认事件 → **把原始触发信号当成
  战术事件发出去**。

生产配置里这不是理论问题：私仓 `market-data/presets/` 的 `regime-chan-tactics`（legacy 2）
和 `full-resonance-tactics`（legacy 3）都覆盖 `000001`，都支持 5/15/30/60/1440，且都挂载了
`plugin.chan.bsp` + `plugin.tactics.volume-price-confirmation`。聚合器键是
`securityId|source|period`（`apps/signal/src/realtime/candle-finalized-job.processor.ts:212`），
不区分 definition。只要两个 definition 同时启用，A 的窗口就可能被 B 的确认信号满足，
而 B 的候选不在 `tacticalEventSet` 里。

#### 6.7.6 根因 5：告警主体是“确认信号”，不是“战术事件”

`LiveStrategyPersistenceService.persist` 的签名是
`persist(candidate, { isTacticalEvent: boolean })`，事务里：

- 插入一行 `StrategySignal`（确认信号）；
- 如果 `isTactical`，插入一行 `StrategyAlertEvent`，`strategySignalId = 确认信号 id`
  （`apps/signal/src/realtime/live-strategy-persistence.service.ts:70-76`）。

告警表没有 `eventId`、没有 `triggerSignalId`、没有 `contributors`。所以即使同一根 Bar 上
有两个复合事件（例如“缠论+放量”和“牛熊战术+放量”同时成立），它们共享同一个确认信号
→ 只能生成**一条**告警，另一个事件被静默吞掉。

#### 6.7.7 根因 6：去重键也是信号级

`liveStrategyAlertDedupeKey` 的组成是
`live-v1:definitionId:versionId:securityId:source:period:signalKind:signalType:signalTime`
（`apps/signal/src/realtime/live-strategy-persistence.service.ts:111-135`），没有 `eventId`。
即使把告警主体改成事件，只要同一根 Bar 的多个事件共用同一个确认信号，唯一索引
`uq_strategy_alert_events_dedupe_key` 仍会把第二条打成 `duplicate_skipped`。

#### 6.7.8 根因 7：消息侧只能读到一个信号

`AlertChannelDeliveryService` 用 `alertEvent.strategySignalId` 查一行信号
（`apps/notification/src/delivery/alert-channel-delivery.service.ts:88-108`），
`buildNotificationEnvelope` 也只接收这一行 `signal`
（`apps/notification/src/delivery/notification-envelope.ts:44-80`）。所以消息里的策略名、
信号类型、置信度、原因，全部来自确认信号；触发腿、合成 badge、`TacticalEvent.reason`
（“Trigger [...] confirmed by [...]”）都到不了消息。

#### 6.7.9 根因 8：三条链路的 push 粒度不同（同构缺口）

- 实时：`aggregator.push(kernelSignals, bar)`，一根 Bar 的所有信号一次性推入
  （`apps/signal/src/realtime/candle-finalized-job.processor.ts:235`）。
- 回测：`aggregator.push([signal], bar)`，每来一个信号推一次
  （`apps/backtest/src/backtest-run.executor.ts:512`）。
- dev server：同回测（`tools/strategy-dev/server.ts:960`）。

`TemporalWindowEngine.push` 的顺序是“先检查已有窗口的确认，再开新窗口”。所以同一根 Bar 上
“触发 + 确认”同时出现时：

- 实时：确认检查发生在开窗之前 → 同一根 Bar 不能确认，事件落空或推迟；
- 回测/dev：A 先推入开窗，B 后推入确认 → 同一根 Bar 立即合成事件（`elapsedBars=0`）。

同一份历史数据，实时与回测可能得到不同的事件集合。这直接违反三链路同构门禁，也会让
“回测有、实盘没有”看起来像归因问题。

#### 6.7.10 附带发现：`onBar` 的超时事件是空实现

`TemporalWindowEngine.onBar` 只做 `advanceWindows`，然后 `return []`
（`libs/strategy/src/tactical-event/temporal-window-engine.ts:187-190`）。回测和 dev server
都在 `onBar` 里遍历 `timeoutEvents`，但永远是空数组。窗口超时只会被静默丢弃，不产生任何
事件或审计。这不是归因丢失的主因，但会让“窗口为什么没触发”无法复盘。

### 6.8 归因修复方案（事件为主体，不新增进程/账本）

> **2026-11-24 实测修正 + 已作废**：战术事件层已整体删除（6.14），本节的事件级方案
> 不再适用；归因改走 `decisionTrace.trace`。以下内容仅保留为设计复盘，不要按本节实施。

原则：

1. 告警主体从“信号”改为“战术事件”；
2. 事件键必须确定性，可跨实时/回测/重启复现；
3. contributors 落库一次，消息只读，不重算；
4. 去重键跟事件走，不跟信号走；
5. 三条链路 push 粒度对齐。

#### 6.8.0 前置：先修 Aggregator 的两个跨定义去重点

如果只改 processor/消息，第二个策略的事件仍然到不了 processor。必须先处理：

1. `EdgeDetector.lastPluginState` 键：`pluginId` → `${definitionId}:${pluginId}`；
2. **移除** `TacticalCooldownTracker`：它属于持仓/执行层的“入场冷却”，不属于信号层。
   如果回测仍需要，在 `ExecutionRiskArbiter` 里按 `securityId`（或通道）实现
   “上次入场/平仓后 K 根 Bar 内不再开仓”。

单测：

- 两个 definition 在同一根 Bar 发同向 BUY → 两个事件都保留；
- 移除冷却后，回测的成交/持仓指标与基线对比（允许差异，但必须能解释）；
- 如果冷却下沉到 Arbiter：同一标的上次入场后 K 根 Bar 内的新入场被 Arbiter 拒绝。

#### 6.8.1 确定性事件键

当前 `eventId = evt_${definitionId}_${barMs}_${++eventCounter}`
（`temporal-window-engine.ts:397,436`），counter 随进程/重放变化，不能做去重键。

改为确定性：

```text
eventKey = sha1([
  'te-v1',
  trigger.definitionId,
  trigger.versionId,
  trigger.signalTime.getTime(),
  rule.triggerTag,
  bar.timestamp.getTime(),
  confirmingSignals
    .map(s => `${s.definitionId}:${s.versionId}:${s.signalTime.getTime()}:${s.signalType}`)
    .sort()
    .join(','),
].join('|'))
```

- 单点事件：`confirmingSignals` 为空，key 由 trigger + rule + bar 决定；
- 同一触发、同一确认集合，重放多少次 key 都一样；
- `eventId` 改为 `te:${eventKey}`；`eventCounter` 只用于日志，不参与身份；
- `boostSignals` 不进入身份：加成只改变 badge/confidence，不产生第二个事件。

#### 6.8.2 数据模型：告警表加事件级列

`strategy_alert_events` 增加：

| 列 | 类型 | 用途 |
|---|---|---|
| `tactical_event_key` | `varchar(64) NULL`，唯一索引 | 事件级去重与回放 |
| `tactical_kind` | `enum('ENTRY','EXIT','RISK_CUT') NULL` | 事件动作类型 |
| `badge_text` | `varchar(128) NULL` | 合成 badge（如“缠论多头+放量确认”） |
| `contributors` | `json NULL` | 触发/确认/加成快照 |
| `aggregate_key` | `varchar(128) NULL`，普通索引 | 通知聚合分组 |

`strategySignalId` 保留，指向**确认信号**（单点事件指向触发信号），用于关联原始信号行。

`contributors` 元素：

```json
{
  "role": "trigger",
  "definitionId": 2,
  "versionId": 7,
  "pluginId": "plugin.chan.bsp",
  "signalType": "一买",
  "signalKind": "entry",
  "signalTime": "2026-11-23T02:00:00.000Z",
  "pivotTime": "2026-11-23T01:45:00.000Z",
  "pivotPrice": 1234.5,
  "confidence": 0.82,
  "badgeText": "一买"
}
```

- 只存 id/plugin/信号快照，不存策略名；消息侧按 `definitionId IN (...)` 批量取一次名字。
- 历史 AlertEvent 没有这些列，保持 `NULL`；消息侧回退到单信号格式。

去重：

- 写入 `dedupe_key = 'live-v2:' + eventKey`，继续复用现有唯一索引；
- 新增 `uq_strategy_alert_events_tactical_event_key`，MySQL 允许多个 `NULL`，历史行不受影响；
- 同一确认信号可以挂多条事件告警，不再被信号级唯一键压掉。

#### 6.8.3 写入流程：按事件写，不按候选写

`CandleFinalizedJobProcessor`：

0. 先补边界字段：`ShadowStrategyCandidate` 与 processor 重建的 `KernelSignal` 增加
   `originPluginId`、`badgeText`、`displayTag`（或直接在 candidate 上保留原始 `KernelSignal`）。
   否则 contributors 只能从 `decisionTrace` 反推，脆弱且不完整。
1. 先持久化全部 `evaluated` 信号（`persistSignals`），不做告警；
2. 构造 `Map<KernelSignal, ShadowStrategyCandidate>`（`kernelSignals` 与 `evaluated` 一一对应）；
3. 遍历 `tacticalEvents`，为每个事件找确认信号：
   - 复合事件：`confirmingSignals` 最后一条（当前 Bar 产出），用 map 反查 candidate；
   - 单点事件：`triggerSignal`，用 map 反查；
   - 找不到（例如未来支持跨 Bar 延迟确认）：按
     `(definitionId, versionId, signalTime, signalType)` 查已持久化信号行。
4. 调用 `persistAlert(event, signalId, { securityId, period, source })`，一条事件一行告警；
5. 事务提交后逐条入队投递。

删除 `tacticalEventSet` 与 `isTacticalEvent` 布尔。

事务边界建议：**整根 Bar 一个事务**，先写全部信号，再写全部事件告警；提交后统一入队。
如果告警写入失败，整根 Bar 回滚，不会留下“有信号无告警”的半成品。

#### 6.8.4 消息渲染：按 contributors 展示

`buildNotificationEnvelope` 改为接收 `alertEvent` + `signal` + `contributors` + 批量解析的
`strategyDefinitions`，输出：

```text
[Mist] 000001 上证指数 买入 @ 3421.5 | 14:30
- 缠论一买 [HIGH 82%]（触发）
- 量价共振确认 [MEDIUM 70%]（确认）
- 波动挤压爆发（加成）
合成：缠论多头+放量确认
```

规则：

- `role=trigger` 在前，`confirm` 次之，`boost` 最后；
- 时间用 `availabilityKey(event.timestamp, period)`，与 6.6 的 `effectiveTime` 同口径；
- 单点事件没有 contributors 时，退化为现有单行格式，向后兼容；
- 方向、价格取事件的 `action` / `triggerPrice`，不再取确认信号的 `signalKind`。

#### 6.8.5 聚合：从“信号聚合”改为“事件聚合”

`aggregateKey = securityId + effectiveTime(event.timestamp, period)` 不变，但聚合对象改为
`StrategyAlertEvent`：

- 同一 `aggregateKey` 下可能有多条事件（不同 definition / 不同 trigger）；
- 每条事件保留自己的 `tactical_event_key`，聚合消息按它去重；
- 合并的是 contributors，不是信号行；
- 同一时间片买入/卖出同时存在时，仍按“一条消息两段、卖出在前、不净额”。

#### 6.8.6 同构：统一为“逐信号 push”

选 B（最小改动）：实时也改成按内核 plan 顺序逐个 push。

```ts
const tacticalEvents: TacticalEvent[] = [];
for (const signal of kernelSignals) {
  tacticalEvents.push(...aggregator.push([signal], bar));
}
```

理由：

- 回测/dev 已经是逐信号 push，实时对齐即可，不改历史数据源的 `onBar`/`onSignal` 顺序；
- kernel 输出顺序 = plan 顺序，三链路一致，结果确定；
- 同一根 Bar 内“先触发、后确认”可以合成事件（`elapsedBars=0`），这是真实语义，
  不再出现“实时永远不能同 Bar 确认”的隐性差异。

如果以后要禁止同 Bar 自确认，再引入显式的 `beginBar/endBar` 两阶段 API，而不是靠
push 粒度隐式实现。

加一条同构测试：同一段历史，实时适配器与回测适配器产出的 `tactical_event_key` 集合逐项相等。

#### 6.8.7 迁移与兼容

1. Migration 036：加 `tactical_event_key` / `tactical_kind` / `badge_text` /
   `contributors` / `aggregate_key` 与索引。
2. 历史 AlertEvent 不回填（无法从单信号反推事件），新列保持 `NULL`。
3. 消息侧：`contributors` 为 `NULL` → 走现有单信号格式；非空 → 走多 contributor 格式。
4. `dedupe_key` 保留，新写入为 `live-v2:<eventKey>`；旧行不动。
5. 投递链路不用改：`deliver-fanout-v1-<alertEventId>` 与
   `deliver-channel-v1-<alertEventId>-<channel>` 本来就是按 AlertEvent 去重，
   一条信号挂多条事件告警不会互相覆盖。
6. 观察一个交易日，确认同一确认信号可以稳定产生多条事件告警后，再考虑删除旧的
   信号级去重语义。

#### 6.8.8 验收

0. 两个 definition 同 Bar 同向入场：EdgeDetector 不再吞掉第二条，生成两条事件（冷却已移除）。
1. 单定义复合事件：消息同时显示 trigger 与 confirm 两个 contributor。
2. 跨定义复合事件：确认候选与触发 definition 不同也能生成告警，不再静默丢失。
3. 同一 Bar 两个复合事件：生成两条 AlertEvent，`tactical_event_key` 不同，各带自己的
   contributors。
4. 重启/回放：相同输入产出相同 `tactical_event_key`，不重复、不丢失。
5. 三链路：同一段历史，实时回放与回测的 event key 集合一致。
6. 非战术信号（regime/setup）不再被误标为战术事件。

### 6.9 时间迁移顺序（已完成）

1. 文档与类型标注 deprecated（先不改行为）。
2. 移除信号域的 `triggerTime` 重复字段（`KernelSignal`、`ShadowStrategyCandidate`、
   `SignalPersistencePayload`）。
3. 新写入不再包含 `contextSnapshot.triggerTime`；旧 JSON 保留。
4. 实时消息时间改用 `effectiveTime`；实时 `StrategySignalVo` 增加派生字段。
5. 回测 `BacktestSignalResultVo` / 查询 / 导出增加 `effectiveTime`（服务端计算，不落库）。
6. `cooldownUntil` 已删除（migration 035）。
7. 保留传输层 `triggerTime`、DB `created_at`/`updated_at`/`sent_at`/`acknowledged_at`。

时间迁移已完成。归因修复（6.8）是独立的一次改动：先 migration 036，再改 processor 的
事件写入与消息渲染，最后用同构测试收口。

### 6.10 实施状态

| 项 | 状态 |
|---|---|
| 信号域移除 `KernelSignal.triggerTime` / `ShadowStrategyCandidate.triggerTime` / `SimulationSignal.triggerTime` | ✅ |
| `SignalPersistencePayload` 与 `contextSnapshot` 不再写 `triggerTime` | ✅ |
| 实时 `StrategySignalVo` 增加 `effectiveTime` | ✅ |
| 回测 `BacktestSignalResultVo` / `mapResult` 增加 `effectiveTime`（不落库） | ✅ |
| 飞书消息改用 `effectiveTime` | ✅ |
| dev server 信号结果增加 `effectiveTime` | ✅ |
| `DecisionTraceSnapshot.timestamp` 移除 | ✅ |
| `StrategyAlertEvent.cooldownUntil` 移除 + migration 035 | ✅ |
| 私有仓 plugins evidence 移除重复 `triggerTime` | ✅ |
| 私有仓 scripts 检查：只使用 `entryTime`/`exitTime` 成交时间，无重复 `triggerTime` | ✅（不改） |
| 复合事件归因根因定位（6.7） | ✅ 2026-11-24 |
| 归因修复方案（6.8） | 📝 已设计，待实施 |
| `tactical_event_key` / `contributors` / migration 036 | ⏳ 未实施 |
| 三链路 push 粒度统一（6.8.6） | ⏳ 未实施 |
| `CooldownTracker` 去留 | ✅ 已对比（6.11）：冷却不改变成交/夏普/回撤，只隐藏 4 个买点；建议移除 |
| 战术汇聚层实测 | ✅ 2026-11-24：当前是 pass-through，Edge/Window 空转（6.12） |
| 归因载体 | 🔄 改为 `decisionTrace.trace`，暂不依赖 `TacticalEvent.contributors` |
| EdgeDetector / TemporalWindowEngine 去留 | ✅ 已删除（2026-11-24） |
| `TacticalEventAggregator` 整体去留 | ✅ 已删除；dev server 兼容字段也已删除（前端无引用） |

> 历史 `market-data/backtest-results/*.json` 仍含 `triggerTime`，属于历史产物，不重写；
> 新查询/导出以 `effectiveTime` 为准。部署前需运行 migration `035_drop_strategy_alert_cooldown_until.sql`。

### 6.11 实测：CooldownTracker 去掉前后（2026-11-24）

样本：`000001` 30m、`full-resonance-tactics`（definition 3）、2024-01-01 ~ 2024-03-31，
初始资金 100 万；同一份本地 K 线、同一份信号序列，只改 `cooldownBars`。

| 指标 | cooldown=3 | cooldown=0 |
|---|---|---|
| 原始信号 | 104 | 104 |
| 战术事件 | 100 | 104 |
| 买入事件 | 6 | 10 |
| 成交笔数 | 5 | 5 |
| 夏普 | -1.2115 | -1.2115 |
| 总收益 | -2.30% | -2.30% |
| 最大回撤 | 3.32% | 3.32% |

被冷却掉的 4 个买点：

| 时间 | 与上一个买点的 Bar 间隔 |
|---|---|
| 2024-01-11 05:30 | 3 |
| 2024-01-23 05:30 | 3 |
| 2024-01-24 02:00 | 2 |
| 2024-01-24 07:00 | 2 |

这 4 个都是 `BEAR_TACTICS_SIGNAL`（本级底分型右买）。它们被冷却掉时账户已经持仓，
`ExecutionRiskArbiter` 本来就不会再买，所以**成交和绩效完全不变**。在这段样本里，
冷却对交易没有任何贡献，只让 4 个买点从消息里消失。

### 6.12 更大的发现：战术汇聚层当前是 pass-through

跑对比时发现，100/104 个事件全部是**单点事件**，没有任何“缠论多头+放量确认”之类的
合成 badge。原因不是冷却，而是 `tactical-aggregator.json` 的标签和内核实际发射的标签对不上：

- 配置用的是**插件 id**：`plugin.regime.shanghai-index`、`plugin.chan.bsp`、
  `plugin.tactics.volume-price-confirmation` 等；
- 内核发射的是**终端业务标签**：`REGIME_DEFEND_SELL`、`BEAR_TACTICS_SIGNAL`、
  `ENHANCED_CHAN_BSP`、`BULL_CHAN_BSP`、`TACTICS_FIRE_BUY` 等；
- `KernelSignal.decisionTrace` 没有顶层 `pluginId`，`EdgeDetector.findMatchingPluginId`
  查的是 `decisionTrace.pluginId`，所以**一个都匹配不上**；84 个 `REGIME_BEAR` 状态信号
  每根 Bar 都变成事件，就是证据；
- 私有 `full-resonance` 的决策流是**同一根 Bar 上的 AND 链**
  （regime → chan → vpci → terminal），终端只发一个信号；窗口引擎需要的是
  “触发在 t、确认在 t+1..t+W”的分离信号，这个决策流根本不会产生。

结论：

1. 当前战术层实际只做了两件事：把每个内核信号包成单点事件、用 cooldown 丢掉同向后续买点。
   EdgeDetector 和 TemporalWindowEngine 都是空转。
2. 只改配置标签不够。即使把标签改成业务标签，同一根 Bar 的 AND 链仍然不会产生
   “跨 Bar 触发 + 确认”的信号，窗口模型还是不会合成。
3. 归因不需要新表/新列：`strategy_signals.decision_trace` 已经保存了完整链路
   （regime guard、chan guard、vpci guard、terminal），消息直接渲染这个 trace 即可。
4. 如果确实要“触发后 W 根 Bar 内等确认”的语义，必须让内核按插件/节点发射独立信号，
   或把决策流拆成多个 plan；那是信号层的结构性改动，不是聚合层配置问题。

### 6.13 方案修正（以实测为准）

基于 6.11/6.12，优先级调整为：

1. **消息链路**：先把 `cooldownBars` 置 0 或移除 CooldownTracker，让每个内核信号都能
   落库/发消息；按 `(securityId, effectiveTime)` 聚合多个 definition 的信号；
   每条信号的归因直接渲染 `decisionTrace.trace`，不再依赖 `TacticalEvent.contributors`。
2. **回测链路**：把“入场后 K 根 Bar 内不再开仓”的规则（如果仍需要）下沉到
   `ExecutionRiskArbiter`；样本里冷却没有改变成交，说明这条规则至少不是当前的主要收益来源。
3. **战术合成**：暂时不做。`EdgeDetector`/`TemporalWindowEngine` 已于 2026-11-24 删除；
   当前的决策流是同日 AND 链，窗口模型没有输入；等信号层改成按插件/节点发射独立信号后，
   再恢复 6.8 的事件级设计。状态类信号的去重留待下一步的窄规则（6.14）。
4. **不要**为了“让窗口触发”去硬改 `tactical-aggregator.json` 的标签；标签匹配只是表层，
   同 Bar AND 链才是根因。

### 6.14 两个空转组件的去留（已删除 2026-11-24）

| 组件 | 当前状态 | 结论 | 替代 |
|---|---|---|---|
| `EdgeDetector` | 空转：`findMatchingPluginId` 查 `decisionTrace.pluginId`，内核没有这个字段；84 个 `REGIME_BEAR` 每根 Bar 都成事件 | 不保留在聚合层 | 告警层的**状态信号过滤**，只对 state 类信号生效 |
| `TemporalWindowEngine` | 空转：决策流是同一根 Bar 的 AND 链，没有“触发在 t、确认在 t+1..t+W”的分离信号 | 不保留 | 无；归因直接用 `decisionTrace.trace` |
| `CooldownTracker` | 只隐藏消息，不改变成交（6.11） | 不保留 | 回测防抖（如确需）下沉到 `ExecutionRiskArbiter` |
| `TacticalEventAggregator` | 以上三者的容器；当前实际只做“单点包装 + 冷却” | 从通知/回测路径移除 | 信号直发 + 按 `(securityId, effectiveTime)` 聚合 |

**2026-11-24 已执行删除**：`libs/strategy/src/tactical-event/` 整目录移除；
`apps/signal`、`apps/backtest`、`tools/strategy-dev` 已改为直接消费 `KernelSignal`；
`openspec/specs/tactical-event-pipeline/spec.md` 标记 RETIRED；私仓
`market-data/tactical-aggregator.json` 删除。

**2026-11-24 二次清理**：dev server 的 `tacticalEvents` / `tacticalEventCount` /
`layer=tactical` 兼容字段已彻底删除；回测响应只返回 `signals`。

**前端扫描结论**：`mist-fe` 没有 `TacticalEvent` 类型、字段或 API 依赖。仅在
`app/backtests/BacktestWorkspace.tsx` 与 `app/backtests/utils/backtest-signal-visual.util.ts`
里把 `"tactical_events"` 当作**图表图层名**使用，并向 `apps/mist` 传 `layer=tactical_events`；
`apps/mist` 的回测信号接口不解析 `layer`，所以没有功能依赖。这个图层名在重新设计图表层时
一并处理，不影响本次删除。

**当前行为**：每个 `StrategySignal` 都会落库并生成 AlertEvent。由于窄规则尚未做，
`REGIME_*` 这类状态信号会逐 Bar 发消息（样本里 84 条/3 个月）；这是已知的临时状态，
下一步再补“只对 state 类信号做状态变化过滤”。

**不要把 `EdgeDetector` 简单改成查 `originPluginId` 就继续用。** 当前 10 个买点全部是
`BEAR_TACTICS_SIGNAL` + `badgeText=本级底分型右买` + `action=BUY`；通用 edge 检测会把
它们当成同一个 `BUY` 状态，只保留第一个，后面 9 个全被吞掉。状态过滤必须只作用于
**state 类信号**（如 `REGIME_*`），不能作用于买/卖点。

建议的状态过滤：

- 在私有定义里给终端节点加 `signalNature: 'state' | 'event'`，或在
  `tactical-aggregator.json` 里声明 `stateSignals: ['REGIME_DEFEND_SELL', ...]`；
- 告警层按 `(securityId, signalType, action)` 记住上一次状态，只在状态变化时发消息；
- 买/卖点（`event` 类）不经过任何 edge/cooldown 过滤，每个点都发；
- 这样 84 条“上证熊市”会压成 1~2 条状态变化消息，10 个买点一个不少。

**移除后的调用点：**

| 位置 | 改法 |
|---|---|
| `apps/signal` 实时 | 停用 `TacticalEventAggregator`；每个 `ShadowStrategyCandidate` 都落库 + 告警；状态过滤放在告警层 |
| `apps/backtest` | 停用聚合器；`signal` 直接送 `ExecutionRiskArbiter`；如需防抖，在 Arbiter 加 K 根 Bar 入场冷却 |
| `tools/strategy-dev` | 聚合器与 `tacticalEvents` 兼容字段均已删除；只返回 `signals` |
| `libs/strategy/src/tactical-event` | 整目录已删除；无类型保留 |

## 七、重新设计的起点（2026-11-24，待讨论）

战术事件层删除后，当前链路是：

```text
KernelSignal（每个 definition 每根 Bar 一条，带 decisionTrace.trace）
  → StrategySignal / StrategyAlertEvent
  → 飞书消息 / 人工买卖
```

### 7.1 只设计三件事

1. **消息聚合**：按 `(securityId, effectiveTime)` 分组，一条消息列出同一时刻所有
   definition 的信号；买入/卖出同时出现时仍按“卖出在前、不净额”展示。
2. **归因**：每条信号直接渲染 `decisionTrace.trace`（regime、chan、vpci、terminal 等节点），
   不再造 `TacticalEvent`，也不新增 `contributors` 表/列。
3. **窄状态过滤**：只对 `state` 类信号（如 `REGIME_*`）做状态变化去重；买/卖点全发。
   这是下一步唯一需要新增的过滤逻辑，放在告警/通知层，不回信号层。

### 7.2 需要先定的三个口径

1. **状态信号怎么判定？**
   - 按 `signalType` 前缀（如 `REGIME_*`）；
   - 在私有定义里给终端节点加 `signalNature: 'state' | 'event'`；
   - 按 `decisionTrace.trace` 的节点类型（`GUARD` vs `EXTRACTOR`）。
2. **聚合窗口多大？**
   - 精确到 `effectiveTime` 的分钟；
   - 允许 3 秒/1 分钟的抖动（同一批触发可能跨秒到达）。
3. **同一时刻多个 definition 的消息格式？**
   - 一条消息多行（推荐，便于人工横向比较）；
   - 每个 definition 一条（信息更细，但同一时刻会多条）。

### 7.3 明确不做

- 不恢复 `TacticalEvent` / `EdgeDetector` / `TemporalWindowEngine` / `CooldownTracker`；
- 不做订单簿、账本、自动下单、独立执行进程、outbox；
- 不再引入 `emittedAt` / `receivedAt` / `expiresAt` 等执行域时间；
- 前端 `tactical_events` 图层名在重新设计图表层时改为 `backtest_signals` 或 `raw_signals`。

---

## 八、时间设计待重看

> 这一节不是新结论，是把当前已经落地的时间口径和需要重新确认的问题列出来。
> 重新设计前先过一遍，避免又加回执行域的第三个时间。

### 8.1 当前已定

| 项 | 现状 |
|---|---|
| `StrategyBar.timestamp` | 1m 左标；5/15/30/60m 右标；1440 = 00:00(D) |
| `signalTime` | `StrategyBar.timestamp` 逐字复制；不做可用时刻偏移；每条信号一个 |
| `pivotTime` | 形态几何极值；图表 marker / 止损参考 |
| `effectiveTime` | `availabilityKey(signalTime, period)` 派生，不落库；消息/聚合用 |
| `triggerTime` | 只在 `CandleFinalizedTriggerV1` 传输契约；`toStrategyTrigger` 把它映射为 1m `StrategyBar.timestamp`，不是第三个时间 |
| `createdAt` / `updatedAt` / `sentAt` / `acknowledgedAt` | 运营/审计时间，不参与信号语义 |
| 回测 `entryTime` / `exitTime` / `fillTime` | 成交时间，留在回测/执行域 |

### 8.2 待重看的问题

1. **`signalTime` 和 `effectiveTime` 是否仍然都需要？** 现在消息用 `effectiveTime`、
   图表用 `signalTime`、聚合用 `effectiveTime`；有没有场景必须只保留一个？
2. **多周期对齐是否覆盖完整？** 1m 左标 +1m、5/15/30/60m 右标、日线 15:01、
   11:30/15:00 终端桶 +1m；如果以后新增 2m/10m 等周期，规则怎么扩展？
3. **聚合窗口**：`effectiveTime` 精确分钟够不够？同一批触发的 1m/30m 信号是否一定
   落在同一个 `effectiveTime`？
4. **状态信号的时间**：`REGIME_*` 是“状态变化时刻”还是“当前 Bar 时刻”？如果只发状态变化，
   消息时间用变化时刻还是 `effectiveTime`？
5. **消息时间**：一条消息一个 `effectiveTime`，还是每个信号各自时间？买卖同时出现时
   如何排序（卖出在前是否仍成立）？
6. **回测时间**：`effectiveTime` 派生不落库；查询/展示/导出是否都需要？图表 marker
   继续用 `signalTime` + `pivotTime` 是否够？
7. **时区/会话日**：Asia/Shanghai、交易日 vs 自然日、午休/集合竞价边界是否还有遗漏？
8. **`pivotTime` 的职责**：是否仍只用于图表/止损？有没有策略把它当信号时间用？
9. **新增过滤/图层是否引入新时间字段？** 希望不引入；如果引入，必须先回答“它和
   `signalTime` / `effectiveTime` 的区别”。

### 8.3 重看顺序建议

1. 先确认“每条信号只保留 `signalTime` + `pivotTime` 两个语义时间”是否仍然成立；
2. 再确认 `effectiveTime` 的派生规则和聚合窗口；
3. 最后定消息展示时间、状态信号时间和前端图层时间轴。

---

### 8.4 chancore / pacore 用的时间

- `ChanK.time` / `PaK.time` 都是 `Date`，**逐字复制 `StrategyBar.timestamp`**，不做任何偏移。
- `toChanKSeries`（`libs/strategy/src/analysis/chan-derivation.ts:31`）是 bar → ChanK 的唯一映射：
  `time: b.rawBar.timestamp`。
- `PaK` 目前由工具/可视化适配器喂入（`tools/pa-*.ts` 的 `time: new Date(b.time)`；
  `PaVisualAdapter` 直接读 `PaK.time`），同样没有偏移。
- 两者派生的 `startTime` / `endTime` / `sweepTime` / `breakoutTime` 都是输入 bar 时间的
  复制或极值，不是新的“可用时刻”。
- 结论：纯数学库只认 Bar 时间身份；`availabilityKey` 只属于内核/消费端的可用性判断，
  不进入 chancore/pacore。

#### 8.4.1 适配器到底在做什么

| 事情 | `ChanK` | `PaK` |
|---|---|---|
| 时间字段 | `time` ← `rawBar.timestamp` | `time` ← bar time |
| 每根 bar 的 id | `id = index + 1`（唯一、正安全整数） | `id` 来自源 bar |
| 证券身份 | `symbol = String(securityId)`（必须非空且一致） | 无 |
| OHLC | `ohlc.effective`（**插补后**，不是 raw） | 原始/源 OHLC |
| 数量 | `volume.effective` / `amount.effective`（string） | `number`（string → number） |

**统一落点（2026-11-24 已实施）**：

- `toChanKSeries` / `toPaKSeries` 都在 `libs/strategy/src/analysis/pure-bar-mapper.ts`；
- Pa 工具的数据加载统一到 `tools/strategy-dev/pa-kline-loader.ts`（`loadPaKBars`），
  原来 4 份 `loadBars` 已删除；三个未跟踪的 PA 研究脚本
  （`pa-empirical-validation` / `pa-fvg-projection-audit` / `pa-bearish-fvg-audit`）
  已按用户决定删除，保留 tracked 且被 docs 引用的 `tools/inspect-pa-indicators.ts`；
- `libs/strategy` 的边界守卫新增 `@app/pacore` 白名单（纯计算库，无 I/O），与
  `@app/chancore` 同理；
- 只保留“一个纯库一个映射函数”，不再允许散落的 `time: new Date(...)` / `Number(volume)`。

所以适配器不是“改个字段名”，它是**语义边界**：

- Chan 需要 per-bar id、symbol、插补后的 OHLC/量；
- Pa 需要 numeric volume/amount、per-bar id；
- 两者的 time 都必须逐字复制 `StrategyBar.timestamp`。

#### 8.4.2 零成本方案评估

| 方案 | 能去掉什么 | 代价/风险 | 结论 |
|---|---|---|---|
| `ChanK.time` / `PaK.time` 改名 `timestamp` | 只去掉一个属性重命名 | ~160 处引用；纯库公共契约变更；适配器仍需 id/symbol/插补/数量转换 | 不推荐，收益只是 cosmetic |
| `StrategyBar` 直接传给纯库 | 去掉整个适配器 | 纯库要接受 `string \| null` 数量、可选 `id`/`symbol`；Chan 会失去 per-bar id/symbol 与插补 OHLC；数学结果可能变化 | 不推荐，语义风险大 |
| `id` / `symbol` 可选、库内派生 | 去掉 id/symbol 映射 | `ChanK.mergedIds` / `symbol` 输出语义变化；仍要数量转换/插补 | 不推荐 |
| 保留适配器，集中到一个函数 | 不去掉成本，但去掉重复 | 已实施：`pure-bar-mapper.ts` + `pa-kline-loader.ts` | **已采用** |

结论：**零成本不可取**。适配器是纯数学库与运行时 Bar 之间的必要语义边界；真正的成本是一次
O(n) 映射，相对于 Chan/Pa 的几何计算可以忽略。能优化的是“不要有第二份适配器”，
不是“去掉适配器”。

### 8.5 signalTime / pivotTime 的去留

| 字段 | 消费方 | 结论 |
|---|---|---|
| `signalTime` | DB 索引/排序/游标、`effectiveTime` 派生、broker 因果检查、通知、去重键、图表/回放 | **必须保留**；它是 Bar 标签，不是可推导的冗余 |
| `pivotTime` | Chan + 私有战术插件（`bull/bear-left-right-bsp`、`compass-grinding-bottom`、`fibonacci-confluence` 等）的 evidence；`decision-pivot-evidence` 提取、持久化/API、前端 marker 锚点（无则回退 `signalTime`）、`pivotPrice` 止损参考 | **可选保留**；它不是 Chan 专属，也不是“第二个信号时间” |
| `effectiveTime` | 消息、聚合、VO | 派生，不落库；保留 |

**`signalTime` 与 `effectiveTime` 的规则：**

```text
KernelSignal.signalTime === StrategyBar.timestamp（完全等价，逐字复制，不做偏移）
effectiveTime           = availabilityKey(signalTime, period)
  1m:                     +1m
  5/15/30/60m 常规窗:      同 signalTime
  11:30 / 15:00 终端桶:    +1m
  1440:                   15:01(D)
```

**信号时间单源派生（2026-11-24 固化）**：除原始 `StrategyBar.timestamp`（Bar 身份）外，
实时/回测/策略系统里的所有“信号时间”都必须由 `KernelSignal.signalTime` 派生：

- `effectiveTime = availabilityKey(signalTime, period)`；
- `aggregateKey = securityId + effectiveTime`；
- 消息展示时间 = `effectiveTime`；
- 去重键、回测游标 = 包含 `signalTime.getTime()`；
- 图表 marker = `signalTime`（+ 可选 `pivotTime` 结构锚点）。

不可派生的例外（不是信号时间，不允许从 `signalTime` 造出来）：

- `pivotTime`：结构极值，来自插件 evidence，早于或等于 `signalTime`，随信号携带；
- `createdAt` / `updatedAt` / `sentAt` / `acknowledgedAt`：墙钟审计时间；
- `entryTime` / `exitTime` / `fillTime`：Bar 流的成交时间（下一根 Bar），属于执行域，
  实时侧在信号发出时未来 Bar 还不存在，不能从 `signalTime` 推算；
- `triggerTime`：传输层上游（1m Bar 时间），是 `signalTime` 的来源，不是派生目标。

`signalTime` 是 Bar 标签，`effectiveTime` 才是“内容封存/可执行”的归一化时间。
`triggerTime` 只存在于传输层，映射后就是 1m 的 `StrategyBar.timestamp`。

> **命名说明（2026-11-24）**：`signalTime` 不是重复字段，而是信号契约里的“决策时刻”语义名；
> 它与 `StrategyBar.timestamp` 同值，但分属“行情事实层”和“信号输出层”。不要为了少一个名字
> 把 `signalTime` 改成 `timestamp`：这会改 DB 列（`signal_time`）、API 字段和前端，
> 且丢掉“哪根 Bar 确认了信号”的语义。真正冗余的 `triggerTime`（信号域）已经删除。

建议把“两条语义时间”改成“**一条信号时间 + 一个可选结构锚点**”：

- `signalTime` required；
- `pivotTime?` optional，chart/stop only；
- `effectiveTime` derived，message/aggregation only。

如果确认不需要“marker 锚在形态极值”，可以删除 `pivotTime` 及前端锚点逻辑，marker 统一用
`signalTime`；`pivotPrice` 仍可保留作止损参考。

**为什么不能用 `signalTime - 1` 推导 `pivotTime`（2026-11-24）**：

- pivot 与确认 Bar 的距离是**形态相关**的，不是固定偏移：
  - Chan 一买/二买：pivot 是趋势最低点，确认在右侧，距离 ≥ 1 且根数不定；
  - 斐波那契：pivot = 摆动单元端点，距离不定；
  - 磨底 / 牛熊左右侧：pivot 就是当前确认 Bar，距离 = 0（这种情况下 `pivotTime`
    与 `signalTime` 相同，确实是冗余复制）。
- 它与 `pivotPrice` 是一对**求值时产生的证据**：价格是止损锚，时间是图上定位；
  同一价位可能对应多根 K（含合并 K），用 `pivotPrice` 也反推不出唯一的时间。
- 所以只有两个选项：存储（现状，marker 锚结构点），或不存储并放弃该展示；
  不存在“由 `signalTime` 推导”的第三条路。

**`pivotTime` 的用途（2026-11-24 补充）**：

它回答“这个买卖点指的是哪一个结构位置”：

- `signalTime` / `triggerPrice` = **确认位置**（右侧确认 Bar 的时间与收盘价）；
- `pivotTime` / `pivotPrice` = **结构位置**（买卖点指向的极值点的时间与价格）。

唯一活消费方是前端图表 marker 锚点（+ 持久化/API 供前端取数）；消息和聚合不用。

生产方现状：

- Chan BSP：`pivotTime` = 买卖点事件的**结构 Bar**（分型/笔端点），通常早于确认 Bar，
  这是它唯一有信息量的场景；
- 私有插件（`compass-grinding-bottom` / `bull-left-right-bsp` / `bear-left-right-bsp`）：
  `pivotTime` = 当前确认 Bar，与 `signalTime` 相同，属于冗余复制；
- `pivotPrice` 是止损参考，必须保留，与 `pivotTime` 去留无关。

### 8.6 其他时间分类

| 时间 | 层 | 来源 | 现状 | 建议 |
|---|---|---|---|---|
| `StrategyBar.timestamp` | Bar 身份 | producer 标签 | 不可变 | 保留，固化 |
| `signalTime` | 信号 | `= StrategyBar.timestamp` | 必须等于 Bar 时间 | 保留 |
| `pivotTime` | 图表/止损 | 插件 evidence（结构极值） | 可选 | 保留为可选，或前端改造后删除 |
| `effectiveTime` | 派生 | `availabilityKey(signalTime, period)` | 消息/聚合 | 保留派生，不落库 |
| `triggerTime` | 队列传输 | 上游 1m Bar 时间 | jobId/同日校验/补偿 | 保留，不进信号域 |
| `createdAt` | 审计 | 墙钟 | 信号表/回测历史/扫描 | 保留 |
| `updatedAt` | 审计 | 墙钟 | 主要是 TypeORM/VO；信号表未展示 | 可从信号/告警 VO 去掉，DB 列可留 |
| `sentAt` | 投递审计 | 墙钟 | 投递服务写入；前端未用 | 保留用于延迟/审计 |
| `acknowledgedAt` | 人工确认 | 墙钟（人工动作） | 服务/API + 前端 `acknowledge` 按钮（`StrategiesWorkspace`） | 保留；这是产品功能，不是冗余字段 |
| `entryTime` / `exitTime` / `fillTime` | 回测/执行 | Bar 流（下一根 Bar） | 成交时间 | 保留在执行域 |

结论：其余时间不是“信号语义时间”，而是审计/传输/执行时间；不需要参与消息和聚合。
真正可删的候选只有 `pivotTime`（若放弃 marker 锚点）和 `updatedAt`（信号 VO 层）。
`acknowledgedAt` 已被前端确认按钮使用，不能删。

---

## 九、待确认（剩余）


**已决定，不再待确认：**

- 冷却已删除（6.11 / 6.14）：不改变成交，只隐藏买点；
- 战术事件层已整体删除（6.14）：`TacticalEvent` / EdgeDetector / Window / Cooldown 不再恢复；
- 6.8 的 `contributors` / migration 036 / 事件级去重不再实施；
- 三链路 push 粒度问题随战术层删除而消失（不再有窗口顺序）。

**还需要确认：**

1. 主要想加速哪个周期：1m 还是 30m？30m 的信号在 10:00 确认，人工有 30 分钟，封存延迟
   未必是问题；1m 的封存延迟最明显。
2. 你的信号是“价格穿越某个位”就成立，还是“必须等 K 收盘/形态确认”？
   - 前者优先做价格触发器；
   - 后者只能做临时信号，且要接受重绘。
3. 临时信号是否可接受？如果可以，消息用 `[未确认] / [已确认] / [已取消]` 三态。
4. 状态信号、聚合窗口、消息格式三个口径见 7.2。

---

## 十、参考

- `AGENTS.md`：三种标签约定、双时间戳、单调前沿门禁
- `libs/strategy/src/kernel/availability.ts`
- `libs/strategy/src/kernel/adapters/realtime-period.builder.ts`
- `libs/strategy/src/kernel/adapters/period-aggregation.helper.ts`
- `libs/strategy/src/execution/simulated-broker.ts`
- `apps/notification/src/delivery/notification-envelope.ts`
- `openspec/specs/realtime-strategy-evaluation/spec.md:282-300`
- `openspec/changes/archive/2026-10-26-support-multi-period-evaluation/design.md` 第 5.3–5.5 节
