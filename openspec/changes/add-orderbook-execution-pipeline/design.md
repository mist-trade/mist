> **状态：已作废（2026-11-23）。** 本变化中的订单簿撮合、账本、独立执行进程不再实施；
> 最新结论见 `docs/strategy-signal-aggregation-decisions-2026-11-23.md`。

# 技术方案设计：信号聚合与订单簿执行管线 (Design)

> 状态：设计稿（不含实现代码）
> 适用范围：公共策略与私有策略共用的执行域，覆盖回测、模拟盘、实盘三形态
> 关联变化：`unify-quant-pipeline-architecture`（Sink 方向）、`isomorphic-decision-flow-exit-engine`
> （出场信号与入场同构）；本变化位于两者下游，不修改其语义

---

## 一、设计原则与边界

### 1.1 三条硬边界

1. **策略层保持无状态、纯市场状态**：执行层不得把持仓、成本、可用资金回注到策略求值上下文。
   策略只发观点，执行层负责「能不能做、做多少、怎么成交」。
2. **执行层是唯一持有账户状态的地方**：物理账户、通道子账本、订单、成交、冻结、T+1 全部
   归执行域；策略层与信号层不得直接改账。
3. **公共/私有策略在执行层完全平权**：执行层只认 `ledgerGroup`、`signalChannel` 与配置，
   不读取插件名、策略名或 `originPluginId` 做裁决。公私差异只存在于私有配置文件。

### 1.2 与现有战术聚合层的关系

现有 `TacticalEventAggregator` 解决的是**同一 `(securityId, source, period)` 组内、跨插件的
触发+确认**问题，输出仍是逐定义的战术事件；它属于策略层，不感知持仓与资金。

本设计新增的**执行聚合器（Execution Aggregator）**解决的是**跨定义、跨周期、跨公私仓、
带持仓与预算约束**的问题；它属于执行层，消费战术事件，不重复战术确认逻辑。战术层的
`EdgeDetector`、观察窗、`cooldownBars` 继续保留，执行层的去重只针对「同一纪元、同一账本组
的下单意图」，两者职责不同，不得互相替代。

```text
策略层（纯）                          执行层（有状态）
─────────────────────────────────    ─────────────────────────────────────────
KernelSignal
  → TacticalEventAggregator
  → TacticalEvent  ────────────────→  ExecutionSignal
                                       → Execution Aggregator（跨策略）
                                       → AggregatedOrderPlan
                                       → OrderBook Execution Engine
                                       → Fills / Allocations / Ledgers
```

### 1.3 关键设计取舍

| 取舍 | 选择 | 理由 |
|---|---|---|
| 聚合放在策略层还是执行层 | 执行层 | 聚合需要持仓、现金、组合限额；放策略层会破坏无状态边界 |
| 跨策略是否净额对冲 | 首期不净额，默认 `EXIT_FIRST` | 单账户净额会让通道归因失真；先保证「不产生自相矛盾的成交」 |
| 首期是否支持被动挂单排队 | 不支持，只做主动吃单 | 排队模型需要逐笔委托/撤单数据，首期用 marketable limit 已能覆盖大部分场景 |
| 订单簿回测数据 | 优先录制真实盘口；无数据时显式 synthetic | 不把「用 Bar 伪造盘口」伪装成真实订单簿回测 |
| 账本粒度 | 物理账户一本账 + `ledgerGroup` 子账本 | 既满足归因，又允许「公共入场 + 私有出场」共享同一持仓 |
| 实盘默认状态 | `DISARMED` | 真实资金，必须人工武装 + 对账 + 限额 |

---

## 二、时间语义：从双时间戳到三时间戳

现有契约是双时间戳：`signalTime`（决策确立 Bar 的 timestamp）与 `pivotTime`（形态极值）。
但 `signalTime` 等于 Bar 的 **bucket start**（例如 30m Bar 的时间戳是 10:00，实际在 10:30
才封存），不能直接用作执行排序键。执行域必须再引入一个「可执行时刻」：

| 时间戳 | 语义 | 来源 | 用途 |
|---|---|---|---|
| `signalTime` | 决策依据 Bar 的时间戳（bucket start） | 内核 `bar.timestamp` | 图表定位、策略归因、信号去重 |
| `emittedAt` | 信号真正可被执行的时刻（1m 封存触发/事务提交） | 实时 Job 的 trigger 接收时刻；回放用录制值 | **聚合纪元、因果律下界、订单排序** |
| `receivedAt` | 执行域收到意图/盘口的时刻 | 队列消费时间；回放用录制值 | 延迟度量、盘口新鲜度、TCA |

**因果律断言**：

- 任何成交使用的盘口快照必须满足 `book.receivedAt > intent.emittedAt`；
- 任何成交的 `fillTime` 必须满足 `fillTime >= book.eventTime > intent.signalTime`；
- 禁止用 `signalTime` 直接比较盘口时间，否则 30m 信号会在 Bar 尚未封存时「提前成交」。

回测/回放必须使用录制的 `emittedAt` 与 `receivedAt`，不得用回放机器的 wall clock 代替。

**批次共享**：同一次 1m 封存触发产生的所有意图（可能横跨多个周期、多个策略）必须共享同一个
`emittedAt`（取该次 trigger 的接收时刻），不得对每行使用 `now()`；否则默认 `aggregationSlackMs = 0`
时同一批信号无法聚合。

---

## 三、核心契约

### 3.1 ExecutionSignal（执行意图）

由确认后的 `TacticalEvent` 转换而来，是执行域的唯一输入。

| 字段 | 说明 |
|---|---|
| `intentId` | 确定性 ID：`hash(ledgerGroupKey, securityId, side, kind, source, riskScope, signalTime, signalChannelKey)` |
| `signalId` | 对应 `strategy_signals.id`，用于回溯 |
| `signalChannelKey` | `definitionId:period`，信号归属（谁发的） |
| `contributors[]` | 触发信号与确认信号的 `signalChannelKey` 列表，仅审计/归因，不参与定量 |
| `ledgerGroupKey` | 持仓归属（谁持有的），默认 `definition:<definitionId>`，可由配置映射 |
| `definitionId` / `versionId` / `period` | 归因字段，不参与策略裁决 |
| `securityId` | 标的 |
| `side` | `BUY` / `SELL` |
| `kind` | `ENTRY` / `EXIT` / `RISK_CUT` |
| `source` | `STRATEGY` / `RISK_ENGINE` / `MANUAL`；风控引擎与人工干预不经过策略层 |
| `riskScope` | `RISK_CUT` 的作用域：`GROUP`（只清该组） / `SECURITY`（该标的全组禁买）；默认 `GROUP` |
| `signalTime` | 决策 Bar 时间戳 |
| `emittedAt` | 可执行时刻（见第二节） |
| `triggerPrice` | 决策确认价（非成交价） |
| `pivotPrice` | 结构止损参考，可空 |
| `confidence` | 置信度；首期仅观测，不参与定量，也不作为交易开关 |
| `expiresAt` | 意图有效期；过期未执行则作废并记录原因 |
| `budgetHint` | 可选的预算提示（私有策略可给目标名义金额），执行层可裁剪 |
| `exitRatio` | 可选的部分平仓比例，默认 1.0；由出场插件/规则给出 |
| `origin` | `public` / `private`，仅观测，不参与裁决 |

`RISK_ENGINE` / `MANUAL` 意图使用保留的 `signalChannelKey`（`risk:engine` / `manual`），
`ledgerGroupKey` 指向被平仓的组；它们没有对应的 `strategy_signals` 行，但仍写审计链。
`riskScope` 缺省为 `GROUP`；只有配置或插件事先声明 `SECURITY` 时才做全标的禁买，避免默认
误伤其他策略。

**有效期规则**：按信号周期配置。1m 信号默认 90s，5m 默认 6m，30m 默认 35m，日线默认到
下一交易日 09:35。有效期的作用是允许同一决策时刻的多周期信号聚合，同时防止隔夜旧信号被
当成新信号执行。若计划因交易阶段（集合竞价/非交易时段/停牌）无法执行，意图进入 `DEFERRED`
状态，不消耗有效期；在下一个可执行阶段重新聚合并生成新计划。

### 3.2 AggregatedOrderPlan（聚合订单计划）

| 字段 | 说明 |
|---|---|
| `planId` | 确定性 ID：`hash(securityId, side, asOf, sorted(intentIds))` |
| `securityId` / `side` | 标的与方向 |
| `asOf` | 聚合水位（最大的 `emittedAt`） |
| `totalQty` | 计划总股数（已过组合限额） |
| `allocations[]` | 每个 `ledgerGroup` 的分配量、贡献的 `intentId` 列表 |
| `suppressed[]` | 被抑制的意图与原因码 |
| `urgency` | `NORMAL` / `URGENT`（RISK_CUT 或跌停逃命为 URGENT） |
| `limitPolicy` | 到达价、保护档位、最大滑点 bps、涨跌停价 |
| `deadline` | 执行截止时刻；超时未成交的剩余量按策略处理 |
| `bookPolicy` | `REQUIRE_BOOK` / `ALLOW_SYNTHETIC` |

### 3.3 OrderBookSnapshot（盘口快照）

| 字段 | 说明 |
|---|---|
| `snapshotId` | 确定性 ID：`hash(securityId, eventTime, receivedAt, sequence)` |
| `securityId` / `source` | 标的与数据源 |
| `eventTime` / `receivedAt` / `sequence` | 交易所事件时间、执行域接收时间、源内序号 |
| `phase` | `PRE_OPEN` / `CALL_AUCTION` / `CONTINUOUS` / `CLOSE_AUCTION` / `HALTED` / `CLOSED` |
| `bids[]` / `asks[]` | 档位数组：`price`、`volume`（股）、`orderCount`（可选） |
| `lastPrice` / `prevClose` | 最新价、昨收 |
| `limitUp` / `limitDown` | 当日涨跌停价（由 `SecurityTradingProfile` 计算） |
| `quality` | `kind`（L2/L1/SYNTHETIC）、`stale`、`crossed`、`levels`、`latencyMs`、`gaps` |

**单位约定**：价格用 `Decimal8`（支持 0.001 元 ETF  tick）；数量统一为**股**（整数），
QMT 的「手」在适配层乘以 100；金额用 `Decimal8`。禁止浮点参与撮合。

### 3.4 BookFill（成交）

| 字段 | 说明 |
|---|---|
| `fillId` | 确定性 ID：`hash(planId, snapshotId, levelIndex, sequence)` |
| `orderId` / `planId` | 订单与计划 |
| `securityId` / `side` | 标的与方向 |
| `price` / `quantity` | 本档成交价与股数 |
| `levelIndex` / `snapshotId` | 盘口档位与快照，用于审计 |
| `fees` | 佣金、过户费、印花税、总费用 |
| `allocations[]` | 每个 `ledgerGroup` 的分配量、费用分摊、成本 |

### 3.5 账本

| 账本 | 键 | 内容 |
|---|---|---|
| `PhysicalLedger` | 账户 | 现金、冻结现金、持仓总量、可用量、冻结量、均价 |
| `LedgerGroupPosition` | `(securityId, ledgerGroupKey)` | 总量、可用、冻结、均价、已实现盈亏、累计费用 |
| `LedgerLot` | `(securityId, ledgerGroupKey, lotId)` | 买入批次：数量、成本、买入日、可卖日（T+1） |
| `OrderRecord` | `orderId` | 父订单/子订单状态机、委托价、数量、已成交、拒绝原因 |
| `AllocationRecord` | `fillId + ledgerGroupKey` | 成交分配、费用分摊、成本更新 |

---

## 四、信号聚合设计

### 4.1 聚合输入与触发

- **输入**：消费 `TacticalEvent` 确认后的执行意图，以及执行层风控引擎直接生成的 `RISK_CUT`
  （硬止损、组合回撤熔断）与人工 `KILL`/平仓指令。原始 `KernelSignal` 不得直接进入执行域，
  避免状态类插件造成下单风暴。执行层风控与人工指令来源标记为 `RISK_ENGINE` / `MANUAL`，
  优先级高于策略意图，且不受 `EXIT_FIRST` 的买入让位逻辑影响。
- **落库**：`apps/signal` 在写 `StrategySignal`（以及启用告警时的 `StrategyAlertEvent`）的同一
  事务内，追加一条 `execution_intents` outbox 记录（含完整 payload 快照）。这样即使告警投递
  失败，执行意图也不丢失；即使信号表后续归档，执行仍可重放。
- **现状缺口**：实时边界目前丢弃了 `channel` / `intent` / `originPluginId`
  （`libs/signal/src/runtime/realtime-strategy-evaluation.service.ts:138`、
  `apps/signal/src/realtime/candle-finalized-job.processor.ts:219`）。本变化要求 outbox 显式
  携带 `signalChannelKey`、`ledgerGroupKey`、`intent` 与 `emittedAt`，不得再从 `signalKind`
  反推后丢失版本与周期信息；这些字段只进入执行域，不回注策略层。另，当前
  `LiveStrategyPersistenceService.persist` 只收到 `isTacticalEvent` 布尔值，拿不到
  `TacticalEvent` 本体；需要改为传事件快照或事件引用，否则执行域无法获得
  `confirmingSignals`、`badgeText`、`riskScope` 等归因与风控信息。
- **投递**：事务提交后 best-effort 发布到 `execution:intents` 流；未发布的 outbox 由扫描器
  补发，消费端按 `intentId` 幂等。
- **聚合触发**：执行域按 `emittedAt` 水位推进。所有 `emittedAt` 相同的意图进入同一聚合纪元；
  允许配置 `aggregationSlackMs`（默认 0）把极近的时刻合并。在线运行时，同一纪元的意图在
  `epochLatenessMs`（默认 500ms）内到达均可加入，超时后纪元关闭，后到者记 `LATE` 且不回溯
  修改已生成计划；回放按录制的到达时间重放同一迟到规则。**纪元的排序键始终是 `emittedAt`，
  不是 wall clock**；`epochLatenessMs` 只控制等待窗口，不改变顺序。不同 `emittedAt` 的意图
  是不同决策，按顺序处理，但会看到前一笔成交后的最新账本状态。

### 4.2 聚合步骤（确定性顺序）

1. **过滤**：`emittedAt <= asOf`、`asOf < expiresAt`、未处理过的 `intentId`。
2. **通道状态对账**：
   - `ENTRY` 且该 `ledgerGroup` 已有持仓 → 抑制 `ALREADY_HOLDING`（除非配置允许加仓）；
   - `EXIT` 且可用量为 0、总量 > 0 → 延迟 `T1_LOCKED`，下一交易日重试；
   - `EXIT` 且总量为 0 → 抑制 `NO_POSITION`。
3. **去重**：同一 `(ledgerGroupKey, securityId, kind, signalTime)` 只保留一条；同一组同期多条
   `EXIT` 取「最大平仓量」，不相加；同一组同期多条 `ENTRY` 取「最大目标量」，不相加
   （除非显式允许加仓）。这是防止同一策略多周期重复下单的关键。
4. **冲突裁决**（按 `securityId` 分组）：
   - 存在 `RISK_CUT` → 先执行所有卖出的 `URGENT` 计划；买入抑制范围按 `riskScope`：
     `SECURITY` 抑制该标的所有买入，`GROUP` 只抑制该组买入。`SECURITY` 作用域下该标的
     保持 `RISK_BLOCKED`，直到相关组清零或配置的冷却期结束。
   - 同时存在 `BUY` 与 `SELL`（非 RISK_CUT）→ 默认 `EXIT_FIRST`：先执行卖出组，买入组
     抑制 `CONFLICT_EXIT_FIRST`，但保留在待处理区直到 `expiresAt`；下一纪元若仍有效且已无
     持仓冲突，可再执行。
   - 可选 `NET` 模式：按 `ledgerGroup` 的目标变化量净额；默认关闭，因为单账户净额会让
     「A 组买入、B 组卖出」变成「不成交」，两组账本都无法自洽。
   - 可选 `INDEPENDENT` 模式：仅用于多账户/分仓场景；单账户首期不支持。
5. **预算与目标量**：
   - 预算按 `ledgerGroup` 分配，组内多周期共享一个预算，避免同策略 1m/30m 双倍下注。
   - 默认 `EQUAL_WEIGHT`：可用现金 / 当日有买入意图的组数；可配置 `FIXED_NOTIONAL` 或
     `STRATEGY_HINT`（策略给目标名义金额）。
   - 买入目标量 = `floor(budget * allocRatio / referencePrice / lot) * lot`；
     卖出目标量 = `min(group.available, group.total * exitRatio)`，`exitRatio` 默认 1.0。
   - `referencePrice` 优先用当前盘口中间价，其次最新价，最后 `triggerPrice`；仅用于定量，
     不用于成交。
6. **组合限额**：
   - 单标的权重上限、总多头/净头寸上限、现金缓冲、单日换手上限；
   - 买入超限时按各组合请求量比例缩放（最大余数法，按 `ledgerGroupKey` 升序破平），
     缩到不足 1 手的组直接剔除并记录 `CAPACITY`；
   - 卖出只受可用量约束，不做比例缩放。
7. **产出计划**：每个 `(securityId, side)` 每个纪元最多一个计划；写 `execution_plans` 与
   `execution_plan_allocations`，发 `execution:plans` 流。

### 4.3 抑制原因码（必须落库）

| 原因码 | 含义 |
|---|---|
| `ALREADY_HOLDING` | 该组已有持仓，重复入场 |
| `NO_POSITION` | 无持仓可平 |
| `T1_LOCKED` | 当日买入冻结，T+1 才可卖 |
| `DUPLICATE` | 同组同纪元重复意图 |
| `CONFLICT_EXIT_FIRST` | 存在反向卖出，买入让位 |
| `RISK_CUT_ACTIVE` | 标的处于风控清仓状态 |
| `CAPACITY` | 组合/单标的/现金限额不足 |
| `STALE` | 超过 `expiresAt` |
| `LATE` | 低于已处理水位，按迟到丢弃 |
| `BOOK_UNAVAILABLE` | 盘口不可用且策略不允许 synthetic |
| `DEFERRED_PHASE` | 当前交易阶段不可执行，保留到下一阶段（非作废） |
| `LOT_ROUNDING` | 定量不足 1 手 |

> 抑制不是静默丢弃：每条都要写 `execution_intent_suppressions`，供复盘和策略调参。

### 4.4 聚合的确定性规则

- 输入按 `(emittedAt, ledgerGroupKey, intentId)` 全序排序；
- 比例分配用最大余数法，余数相同按 `ledgerGroupKey` 升序；
- 所有金额/数量用 `Decimal8`，除法先放大再取整，禁止浮点；
- 同一输入流在任何进程、任何回放机器上必须产出逐字节一致的 `planId`、分配量与抑制原因；
- 不用随机数、不用 wall clock、不用「当前持仓市价」以外的外部状态。

### 4.5 聚合示例

同一 `emittedAt = 10:30` 到达三条意图：

| 意图 | 通道 | 账本组 | 方向 | 类型 | 当前组持仓 |
|---|---|---|---|---|---|
| A | 公共定义 10 / 30m | G1 | BUY | ENTRY | 0 |
| B | 私有定义 23 / 30m | G2 | BUY | ENTRY | 0 |
| C | 定义 10 / 1m | G1 | SELL | EXIT | 0 |

结果（默认 `EXIT_FIRST` + 组内状态对账）：

- C 是 `EXIT` 但 G1 无持仓 → 抑制 `NO_POSITION`；
- A、B 同向买入，不同组 → 合并为一个买入计划，按 G1/G2 预算分配；
- 若 C 是 `RISK_CUT` 且 G1 有持仓：
  - `riskScope = GROUP` → C 生成 `URGENT` 卖出计划；A 抑制 `RISK_CUT_ACTIVE`；B 不受 G1
    风控影响，但仍受该标的的组合风控约束；
  - `riskScope = SECURITY` → C 生成 `URGENT` 卖出计划；A、B 均抑制 `RISK_CUT_ACTIVE`，
    直到该标的清零或冷却期结束。

这个例子说明：聚合不是简单投票，而是「先对账、再裁决、后定量」。

---

## 五、订单簿数据面

### 5.1 数据源能力分级

| 级别 | 数据 | 来源 | 可用能力 |
|---|---|---|---|
| A | L2 十档 + 委托笔数 + 逐笔成交 | QMT L2（若开通） | 完整档位撮合、队列模型、TCA |
| B | L1 五档（bid/ask price+vol） | QMT native tick（桥接层 `native` 原对象保留，待能力探测确认档数） | 逐档吃单、参与率上限 |
| C | L1 最优一档 | 部分 TDX/降级源 | 单档吃单，惩罚性参与率 |
| D | 仅最新价 | TDX 当前 canonical | 只能 synthetic，禁止实盘主动成交 |

**首期目标为 B 级**：桥接层保留的 QMT `native` 对象中可见 `bidPrice` / `askPrice` 数组，
但档数与单位必须通过能力探测确认；投影层只负责转换为 `OrderBookSnapshot`，不改变现有
candle 管线。

### 5.2 采集与分发

```text
QMT native tick
  → apps/mist realtime ingress（现有唯一入口）
      → candle 聚合（既有）
      → BookSnapshot projector（新增，仅投影，不反推 candle）
          → Redis Stream market:book:{securityId}（热，保留最近 N 条）
          → 列式归档（冷，按交易日 JSONL/Parquet）
```

- **订阅范围**：执行域的订阅集合 = 注册表策略标的 ∪ 当前持仓标的 ∪ 未完成计划标的；持仓标的
  即使策略已停用，也必须保持盘口订阅直到清仓，否则无法风控出场。执行域需要额外标的时，通过
  既有订阅控制接口声明，不另起一套 WS 连接。
- **不污染 canonical snapshot**：`CanonicalRealtimeSnapshot` 保持现有字段；盘口是独立投影，
  避免 candle 生产者为执行需求承担额外字段兼容。
- **去重与排序**：以 `(eventTime, receivedAt, sequence)` 排序；同一 `eventTime` 的重发按
  `snapshotId` 去重；发现时间倒序则标记 `out_of_order` 并丢弃。
- **存储**：热存只保留执行窗口所需（如最近 5 分钟）；冷存按交易日归档，供回测/审计；
  MySQL 只存 `book_coverage` 元数据（每日每标的的首末时间、条数、缺口、级别），不存快照本体。
- **交易阶段**：`phase` 优先取源字段；源不提供时由 `eventTime` + `@app/timezone` 的交易日历与
  会话边界推导，并标记 `phase_inferred`。集合竞价/连续竞价/收盘竞价的判定必须使用
  Asia/Shanghai 会话边界，不得用 UTC 小时硬编码。

### 5.3 质量判定

| 判定 | 规则 | 动作 |
|---|---|---|
| `stale` | `receivedAt - eventTime > maxAgeMs`（连续竞价默认 3s） | 禁止新开仓；平仓降级重试 |
| `crossed` | `bestBid >= bestAsk` 且非集合竞价 | 禁止撮合，记录异常 |
| `one_sided` | 买方或卖方为空 | 涨停/跌停/停牌判定，按制度处理 |
| `gapped` | 档位价格不连续超过 N 个 tick | 标记，参与率打折 |
| `stale_source` | 源超过 `sourceTimeoutMs` 无更新 | 断开订阅、告警、降级 |

### 5.4 多源仲裁

同一标的可能同时有 QMT 与 TDX 两个视图。盘口是交易所的单一事实，不能把两个源的档位拼成
一个快照；必须按源优先级整快照选用：

1. 优先 QMT（有深度、字段完整）；TDX 仅在 QMT 不可用且自身具备深度时降级使用；
2. 同一快照只能来自一个源，禁止跨源拼接 bid/ask；
3. 两源同时可用时，用 TDX 做健康交叉校验（最新价偏离、时间戳落后），不参与撮合；
4. 源切换必须记录 `source_switch` 审计事件，并在切换后的第一笔成交上标注来源。

---

## 六、撮合引擎

### 6.1 成交前置校验

1. 计划 `bookPolicy` 与当前盘口级别匹配；`REQUIRE_BOOK` 下 D 级直接拒绝。
2. 盘口通过质量判定；`stale`/`crossed` 按第七节降级。
3. `SecurityTradingProfile` 校验：板块、ST、停牌、涨跌停价、tick size、lot size、T+1。
4. 账户校验：买入现金（含费用）、卖出可用量、单笔名义上限、当日订单数上限。
5. 因果校验：`book.receivedAt > plan.asOf` 且 `book.eventTime >= plan.asOf`（`asOf` 是该计划所有
   意图 `emittedAt` 的最大值；不得用 DB 写入时间代替）。
6. 若无满足条件的快照，等待 `bookWaitMs`（默认 1500ms）：入场超时抑制 `BOOK_UNAVAILABLE`；
   出场继续按重试策略等待，`RISK_CUT` 不因等待而放弃。

### 6.2 限价保护

首期不使用交易所市价单，统一使用 **marketable limit**：

- `arrivalPrice` = 盘口中间价；无中间价时用最新价，再退 `triggerPrice`。
- 买入限价 = `min(limitUp, bestAsk + protectionTicks * tickSize, arrivalPrice * (1 + maxSlippageBps / 10000))`
- 卖出限价 = `max(limitDown, bestBid - protectionTicks * tickSize, arrivalPrice * (1 - maxSlippageBps / 10000))`
- 限价按 tick size 取整；买入向下取整、卖出向上取整，确保不越过保护带。
- `protectionTicks` 默认 5；`maxSlippageBps` 入场默认 50bp、出场默认 200bp、`RISK_CUT`
  可放宽到跌停价。

限价的作用是**保护**，不是追求成交；如果盘口在保护带内没有足够深度，允许部分成交并进入
剩余量处理。

### 6.3 逐档吃单

买入：

1. 卖档按价格升序；
2. 每档可成交流动性 = `floor(level.volume * maxParticipation / lot) * lot`；
3. 成交 `min(剩余量, 该档流动性)`，价格取该档价；
4. 若档价 > 限价，停止；
5. 汇总各档成交，得到 VWAP 与总费用。

卖出：

1. 买档按价格降序；
2. 每档可成交流动性 = `floor(level.volume * maxParticipation)`（卖出允许零股）；
3. 成交 `min(剩余量, 该档流动性)`，价格取该档价；
4. 若档价 < 限价，停止。

`maxParticipation` 默认 0.3，防止把展示深度当成全部可成交流动性。该参数按标的流动性、
盘口级别、时间段可配置；L1 五档建议 0.2–0.3，L2 十档可 0.3–0.5。

### 6.4 部分成交与剩余量

| 场景 | 默认策略 |
|---|---|
| 入场部分成交 | 剩余量 `CANCEL_REMAINDER`，避免追高；记录 `partial_fill` |
| 普通出场部分成交 | 剩余量 `RETRY_UNTIL_DEADLINE`，每次重试必须用更新的盘口 |
| `RISK_CUT` 部分成交 | 剩余量 `URGENT_RETRY`，允许打到跌停价，直到成交或收盘 |
| 涨跌停锁死 | 买入拒单 `BUY_REJECTED_LIMIT_UP`；卖出挂起 `SELL_BLOCKED_LIMIT_DOWN` |
| 停牌 | 撤未成交买单；卖单保留到复牌，告警 |
| 盘口消失 | 按第七节降级，不静默按最后价成交 |

重试必须有上限（次数 + 截止时间）和退避；每次重试生成新的 `attemptId`，但 `planId` 不变，
保证审计链完整。

### 6.5 费用

- 佣金：成交额 × 费率，单笔物理订单最低 5 元；
- 过户费：成交额 × 0.001%；
- 印花税：卖出股票 0.05%，ETF 免征；
- 滑点成本不再用固定比例，实际滑点由逐档成交价与 `arrivalPrice` 的差计算，仅用于 TCA，
  不再重复扣减现金；
- 费用按物理订单计算一次，再按各 `ledgerGroup` 的成交额比例分摊；最低佣金的分摊差额由
  最大分配组承担，确保分摊合计等于物理费用。

### 6.6 A 股制度表

| 制度 | 处理 |
|---|---|
| 买入整手 | 100 股整数倍；不足 1 手不买 |
| 卖出零股 | 允许卖出持仓中的零股（如分红送股） |
| T+1 | 当日买入计入 `frozen`，日终结算转 `available`；当日买入的股份当日不可卖 |
| 涨跌停 | 按 `SecurityTradingProfile`：主板 10%、创业板/科创板 20%、ST 5%、北交所 30% |
| 一字板 | 盘口单边锁死且无对手量，买入拒绝/卖出挂起 |
| 集合竞价 | 09:15–09:25、14:57–15:00；普通信号默认不主动在竞价成交；`RISK_CUT` 可在收盘竞价挂单，未成交顺延次日 |
| 停牌 | 无盘口更新，买单撤销，卖单保留并告警 |
| 交易时段 | 09:30–11:30、13:00–15:00（Asia/Shanghai）；非交易时段只允许排队，不撮合 |

> 制度参数必须复用现有共享资产，不得就地重写：涨跌停价与 ST/ETF 识别复用
> `libs/market-data/src/price-limit.util.ts`（`calculatePriceLimits` / `isEtfSecurity`），
> 整手/费率常量复用 `libs/constants/src/market.constants.ts`（`TRADING_RULES`），
> 交易时段与日期格式化复用 `@app/timezone`，金额/数量运算复用 `@app/decimal`。
>
> 未在 `SecurityTradingProfile` 中显式建模的标的（新股、退市整理、特殊品种）默认禁止实盘
> 开仓，只允许平仓；不得用主板规则猜测。

---

## 七、账本与归因

### 7.1 双账本

```text
PhysicalLedger（唯一真实账户）
  ├─ cash / frozenCash
  └─ positions[securityId] = { total, available, frozen, avgCost }

LedgerGroupPosition（归因子账本）
  └─ (securityId, ledgerGroupKey) = { total, available, frozen, avgCost, realizedPnl, fees }
        └─ LedgerLot[] = { qty, costPrice, acquiredAt, availableAt }
```

- **物理账本**是唯一与 Broker/资金账户对账的账本；
- **组账本**是策略归因账本；所有成交先落物理账，再按分配落组账；
- 组账本之和必须等于物理账本（数量、可用、冻结）；日终与每次重连后强制对账；
- 人工交易、公司行为、无法归属的历史持仓进入 `UNASSIGNED` 组，不允许静默丢弃；
  该组只用于对账与展示，不参与策略预算，也不会被自动交易；
- 组账本的 `avgCost` 用加权平均；卖出用 FIFO 批次扣减，支持部分平仓；
- `realizedPnl` 按「卖出价 - 批次成本 - 分摊费用」计算；未实现盈亏按最新价盯市。

**冻结与释放**：

- 买入提交时按 `委托价 × 数量 + 预估费用` 冻结现金；成交时按实际成交额与费用释放差额；
  撤单/拒单时全额释放；禁止同一笔现金被两个计划重复占用。
- 卖出提交时从组 `available` 冻结数量；成交时扣减；撤单/拒单时释放；T+1 冻结中的数量
  不得用于卖出冻结。
- 冻结是「下单即占用」，不是「成交才检查」；这样多计划并发时不会超买/超卖。
- 日终结算只处理 T+1 解锁，不改变冻结现金的归属；未成交订单跨日按交易所规则失效并释放。

### 7.2 成交分配

1. 计划里每个 `ledgerGroup` 有请求量 `requestedQty`；
2. 对每一笔 `BookFill`，按 `requestedQty` 比例分配：
   `alloc = floor(fillQty * requestedQty / totalQty)`；
3. 余数按最大余数法分配，破平按 `ledgerGroupKey` 升序；
4. 保证 `Σ alloc = fillQty`；
5. 部分成交时，未成交的 `requestedQty` 按比例保留，后续成交继续按原比例分配；
6. 某个组被撤单/拒单时，其未成交分配释放；如需转给其他组，必须生成新的后续计划，
   不得修改已提交计划的分配。

### 7.3 对账

| 对账项 | 频率 | 不一致处理 |
|---|---|---|
| 物理持仓 vs Broker 持仓 | 启动、重连、每 5 分钟、日终 | 冻结新单，告警，人工确认后修复 |
| 物理现金 vs Broker 现金 | 同上 | 同上 |
| 组账本合计 vs 物理账本 | 每笔成交、日终 | 立即停止该标的下单，告警 |
| 订单状态 vs Broker 订单 | 启动、重连、每分钟 | `UNKNOWN` 订单查询 Broker，不盲目重发 |
| 成交回报 vs 本地成交 | 实时 | 以 Broker 回报为准，补写/冲正 |

对账漂移是实盘的**一级熔断**：自动 `DISARMED`，只允许平仓，不允许新开仓。

---

## 八、运行拓扑与单写者

```text
┌─────────────┐     outbox      ┌──────────────────┐
│ apps/signal │ ──────────────→ │ execution:intents│
└─────────────┘                 └────────┬─────────┘
                                         ▼
┌─────────────┐   market:book   ┌──────────────────┐
│ apps/mist   │ ──────────────→ │  apps/execution  │
│ realtime    │                 │  （单写者）       │
└─────────────┘                 │  Aggregator      │
                                │  Book Engine     │
                                │  Ledgers         │
                                └────────┬─────────┘
                                         │ BrokerPort
                                ┌────────▼─────────┐
                                │ Simulated / Paper │
                                │ / QMT Live Broker │
                                └──────────────────┘
```

- **单写者**：只有 `apps/execution` 修改执行账本；`apps/signal` 只写 outbox，`apps/mist` 只写
  盘口流。这样重启、对账、状态机只有一个权威来源。
- **至少一次 + 幂等**：outbox 补发、流消费重放都可能重复；所有写操作按 `intentId` /
  `planId` / `orderId` / `fillId` 幂等。
- **回测**：同一引擎在 `apps/backtest` 进程内运行，`BookSource` 换成 `HistoricalBookSource`，
  `BrokerPort` 换成 `SimulatedBookBroker`；不经过 Redis。
- **模拟盘**：`apps/execution` 消费实时盘口，`BrokerPort` 用模拟成交，不下真单；账本与实盘
  完全同构。
- **实盘**：`BrokerPort` 换成 QMT 交易适配；盘口只用于限价与 TCA，**成交以 Broker 回报为准**，
  本地不自行「撮合」实盘订单。

### 8.1 订单状态机

父订单（`OrderRecord`）：

```text
CREATED → VALIDATED → SUBMITTED → ACKED → PARTIALLY_FILLED → FILLED
                                  ├→ CANCELED
                                  ├→ REJECTED
                                  ├→ EXPIRED
                                  └→ UNKNOWN → (查询 Broker) → ACKED/FILLED/CANCELED/REJECTED
```

- `UNKNOWN` 只允许查询，不允许重发；
- 重试生成新的子订单，父订单保留原 `planId` 与 `attempt`；
- 所有状态迁移写审计事件，含操作者（系统/人工）、原因、前后快照。

### 8.2 与现有 `SimulatedBroker` / `ExecutionBrokerPort` 的关系

现有 `ExecutionBrokerPort` 是 **Bar 驱动**（`onBar(bar)`），服务于 signal-level 回测；
本变化不修改其签名，也不把盘口塞进 `StrategyBar`。执行域新增事件驱动的 `BookExecutionPort`
与 `BrokerPort`：

| 端口 | 驱动 | 用途 |
|---|---|---|
| `ExecutionBrokerPort`（现有） | `onBar` | 保留 `bar` 回测模式，行为不变 |
| `BookExecutionPort`（新增） | `onBook(snapshot)` / `onFill(fill)` | 订单簿撮合、模拟盘、实盘 |
| `BrokerPort`（新增） | 订单/回报事件 | 实盘下单、撤单、查询、回报 |

`ExecutionRiskArbiter` 的 all-in 定量与单仓位假设不适用于多策略执行域，本变化不直接复用其
定量逻辑；其中「硬止损、系统性清仓」保留为执行层 `RISK_ENGINE` 规则，但改为基于组账本与
组合预算计算数量。`ExecutionRiskArbiter` 在既有 bar 回测模式中保持不变。

两条通道并存，由回测的 `executionModel` 或执行域的 `mode` 选择；不在同一个 broker 实例里
混用 bar 与 book 两种时间推进方式。

**代码落位**：P0/P1 先在 `libs/strategy/src/execution` 内扩展，复用现有纯领域边界；若
`unify-quant-pipeline-architecture` 将执行资产收敛为 `BrokerExecutionSink`，则本引擎作为
`OrderBookExecutionSink` 挂载。是否独立为 `libs/execution` 由实施阶段按依赖方向决定，
在此之前 `libs/strategy` 不得引入 NestJS/TypeORM/Redis/BullMQ 等 I/O 依赖。

### 8.3 意图状态机与重启恢复

意图状态：

```text
NEW → PLANNED → ORDERED → PARTIALLY_FILLED → FILLED
        ├→ SUPPRESSED（终态）
        ├→ DEFERRED（可回到 PLANNED）
        ├→ EXPIRED（终态）
        └→ CANCELED（终态）
```

- 重启时只重新处理 `NEW` 与 `DEFERRED`；`PLANNED` / `ORDERED` 必须先与 DB 和 Broker 对账，
  确认是否已提交，禁止直接重新聚合导致重复下单；
- outbox 重发只对 `NEW` 生效；其他状态按 `intentId` 直接忽略；
- 计划与订单的恢复顺序：先物理账/组账，再订单，再计划，最后意图；任何一步不一致都进入
  `DISARMED`（实盘）或停止回测（确定性失败）。

---

## 九、风控

### 9.1 事前风控

| 检查 | 规则 |
|---|---|
| 单笔数量 | > 0、整手（买）、≤ 单笔上限 |
| 单笔名义 | ≤ `maxOrderNotional` |
| 价格 | 在涨跌停内、偏离到达价 ≤ 最大滑点 |
| 现金 | 买入含费用 ≤ 可用现金 - 缓冲 |
| 持仓 | 卖出 ≤ 组可用量；T+1 冻结不可卖 |
| 标的 | 非停牌、非退市整理、非风控黑名单 |
| 频率 | 单标的每分钟订单数、全账户每日订单数 |
| 自成交 | 同标的反向未成交单先撤再发，避免对倒 |
| 盘口 | 过期/交叉/单边锁死时禁止开仓 |

### 9.2 组合风控

- 单标的权重上限（默认 20%）；
- 总多头暴露、净暴露上限；
- 现金缓冲（默认 2%）；
- 单日换手上限；
- 单日亏损 / 回撤熔断：触发后 `DISARMED`，只平不开；
- 相关性/行业集中度：后续阶段，首期只做单标的与总暴露。

### 9.3 熔断与开关

- `ARMED` / `DISARMED`：实盘默认 `DISARMED`，人工武装；武装需二次确认与有效期；
- `DISARMED` 时：撤销所有未成交买单，卖单可保留（允许退出）；
- 自动 disarm 条件：对账漂移、连续 N 次拒单、盘口长时间失效、Broker 断线超时、
  单日亏损超限；
- `KILL`：撤销全部订单（含卖单），停止执行，需人工恢复。

---

## 十、失败模式与降级

| 失败 | 检测 | 处理 |
|---|---|---|
| 盘口 stale | `receivedAt - eventTime > maxAge` | 禁止新开仓；平仓用更宽保护带重试；超 2×maxAge 转 synthetic 并告警 |
| 盘口 crossed | `bestBid >= bestAsk` | 禁止撮合，等待下一快照；持续则告警 |
| 盘口缺失 | 无快照 / 源断开 | `REQUIRE_BOOK` 下拒单；`ALLOW_SYNTHETIC` 下用 Bar 合成并标记 |
| 部分成交 | 档位耗尽 | 按 6.4 处理；记录 `partial_fill` |
| Broker 拒单 | 回报 | 映射原因；不可重试的（如资金不足）不重试，直接告警 |
| Broker 断线 | 心跳 | 停止新单；查询未成交；重连后对账 |
| 订单 UNKNOWN | 超时无回报 | 查询 Broker；不重发；人工确认 |
| 账本漂移 | 对账 | 立即停止该标的；`DISARMED`；告警 |
| 信号重复 | 幂等键 | 丢弃并记录 `DUPLICATE` |
| 信号迟到 | 低于水位 | 丢弃 `LATE`；不补做历史决策 |
| 进程崩溃 | 重启 | 从 outbox/DB 恢复；未完成计划重新聚合；订单先对账 |

**降级原则**：宁可少成交，不可错成交；任何降级都必须有显式状态、原因码和告警，不允许
「静默按最新价成交」。

---

## 十一、可观测性与审计

### 11.1 指标

- `execution_intents_total{result}`：accepted / suppressed / late / duplicate；
- `execution_conflicts_total{reason}`：exit_first / risk_cut / netted；
- `execution_orders_total{status}`：submitted / acked / filled / partial / rejected / canceled；
- `execution_fill_ratio`：成交量 / 计划量；
- `execution_slippage_bps{side, urgency}`：成交 VWAP vs 到达价；
- `execution_book_staleness_ms`、`execution_book_depth_levels`；
- `execution_latency_ms{stage}`：intent→plan→order→fill；
- `execution_ledger_drift`：组账本合计与物理账本差异；
- `execution_reconcile_failures_total`。

### 11.2 追踪与审计

- 每条链路带 `traceId`：`signalId → intentId → planId → orderId → fillId`；
- 审计表 `execution_audit` 追加写，记录：输入意图、聚合决策、抑制原因、盘口 Top-N 快照、
  限价计算、订单状态迁移、成交分配、人工操作；
- 盘口快照只存引用（`snapshotId` + 归档路径），避免审计表膨胀；
- 实盘所有人工操作（arm/disarm/kill/改配置）必须留操作者、时间、原因。

---

## 十二、配置与公私边界

### 12.1 公共仓默认配置（保守）

| 配置 | 默认值 | 说明 |
|---|---|---|
| `execution.mode` | `paper` | `backtest` / `paper` / `live` |
| `execution.conflictPolicy` | `EXIT_FIRST` | 冲突默认先卖后买 |
| `execution.aggregationSlackMs` | `0` | 同 `emittedAt` 才聚合 |
| `execution.epochLatenessMs` | `500` | 在线等待同纪元迟到意图的窗口；不影响排序 |
| `execution.maxSignalAge` | 1m:90s / 5m:6m / 30m:35m / 1d:至下一交易日 09:35 | 意图有效期 |
| `execution.maxSingleNameWeight` | `0.20` | 单标的权重 |
| `execution.cashBufferRatio` | `0.02` | 现金缓冲 |
| `execution.minTradeNotional` | `5000` | 低于此不交易 |
| `book.maxAgeMs` | `3000` | 连续竞价盘口过期 |
| `book.waitMs` | `1500` | 计划生成后等待首个合格快照的时限 |
| `book.maxParticipation` | `0.30` | 档位参与率 |
| `book.protectionTicks` | `5` | 保护档位 |
| `book.maxSlippageBps.entry` | `50` | 入场最大滑点 |
| `book.maxSlippageBps.exit` | `200` | 出场最大滑点 |
| `book.allowSynthetic` | `false` | 实盘/模拟盘默认禁止合成盘口 |

### 12.2 私有仓配置（策略相关）

以下内容只存在于 `mist-alpha-private`，公共仓不得出现私有策略名称或参数：

- `ledgerGroup` 映射：哪些 `definitionId` 共享一个持仓账本（例如「公共入场 + 私有出场」）；
- 每个组的预算模式与金额：`equal_weight` / `fixed_notional` / `strategy_hint`；
- 组权重、优先级、是否允许加仓、是否允许独立净额；
- 每组允许的 `conflictPolicy` 覆盖（默认仍为 `EXIT_FIRST`）；
- 风控黑名单、单标的额外限额、盘中禁买时段。

加载方式复用现有私有配置加载器模式：公共仓只定义 schema 与默认值，私有仓提供实现；
未挂载私有配置时，所有组按「每定义一组、等权预算、默认风控」运行。

### 12.3 公共仓洁净要求

- 执行层代码、日志、错误信息、指标标签中不得出现私有插件 id、策略名、私有参数；
- `origin` 字段只允许 `public` / `private` 两个值，不得细分私有策略；
- 聚合配置的匹配条件只允许 `definitionId` / `period` / `ledgerGroupKey`，不允许插件名。

---

## 十三、分阶段实施

### P0：契约与回放底座（无生产接线）

- 定义 `ExecutionSignal`、`AggregatedOrderPlan`、`OrderBookSnapshot`、`BookFill`、账本契约；
- 建立确定性时钟、Decimal8 运算、盘口 fixture、回放 harness；
- 不接 `apps/signal`，不接 Broker；用 JSONL fixture 做单元与黄金用例。

### P1：信号聚合 + 合成盘口回测

- 落 `execution_intents` outbox 与聚合器；
- 实现 `SyntheticBookSource`（由 Bar 构造，标记 `SYNTHETIC`）与 `BookExecutionEngine`；
- 回测新增 `executionModel: 'bar' | 'orderbook'`，默认仍为 `bar`；
- 新增**同标的多策略组合回测**：一次运行加载多个 `definitionId` 的 plan（公共 + 私有），
  共用同一内核与执行聚合器；现有单策略回测路径保持不变；
- 验收：同一信号流在 `bar` 与 `orderbook` 模式下都能跑通；`orderbook` 模式结果明确标注
  synthetic，不与真实盘口结果混比；组合回测能复现「同标的冲突 → EXIT_FIRST」与「多组预算分配」。

### P2：实时盘口录制 + 模拟盘

- `apps/mist` 投影 QMT L1 五档到 `market:book` 流；
- `apps/execution` 以 `paper` 模式运行，模拟成交，写账本与审计；
- 逐日对账：paper 成交 vs 同一时段 `bar` 模式成交，分析差异来源；
- 验收：盘口覆盖率、过期率、部分成交率、滑点分布达到预设阈值；无账本漂移。

### P3：实盘 Broker（小资金）

- QMT 交易 API 适配 `BrokerPort`；
- 实盘默认 `DISARMED`，人工武装，单笔/单日限额；
- 启动/重连/日终对账；`UNKNOWN` 订单查询；自动 disarm；
- 验收：连续 N 个交易日无账本漂移、无重复下单、无超限；成交回报与本地记录一致；
- 通过后才允许逐步放大资金。

### P4：进阶执行

- 被动挂单与队列位置模型；
- TWAP/VWAP 切片、冲击模型；
- 组间内部撮合（internal crossing）；
- 多账户/分仓；
- 行业/相关性集中度风控。

> 每个阶段必须单独评审、单独开关；P3 之前不得接真实资金。

---

## 十四、测试与验收

### 14.1 单元与契约测试

- **聚合**：同组多周期不双倍下注；跨组同向求和；反向 `EXIT_FIRST`；`RISK_CUT` 优先；
  T+1 延迟；重复/迟到/过期抑制；比例分配与最大余数；确定性排序。
- **撮合**：逐档吃单 VWAP 手算一致；限价保护不越界；参与率上限；部分成交；零深度；
  一字板；停牌；集合竞价；费用（最低佣金、印花税、ETF 免征）。
- **账本**：成交分配合计等于成交量；组账本合计等于物理账本；FIFO 批次；T+1 结算；
  费用分摊合计等于物理费用；现金守恒。
- **时间**：`book.receivedAt > intent.emittedAt`；`fillTime >= book.eventTime`；
  回放不使用 wall clock。

### 14.2 黄金回放

- 选取若干交易日，录制真实 L1 盘口 + 信号流，固定输入，逐字节比对订单/成交/账本；
- 回测与模拟盘使用同一 `BookSource` 与同一引擎时，`planId` / `fillId` / 分配结果必须一致；
  实盘只要求 `planId` / `orderId` 一致，`fillId` 由 Broker 回报映射，不要求与模拟成交一致；
- 任何差异必须能归因到 `BookSource` 级别或 Broker 回报，不允许「引擎随机性」。

### 14.3 不变量（property-based）

- `Σ allocation.qty == fill.qty`；
- `Σ group.total == physical.total`，`Σ group.available == physical.available`；
- `cash_before - cash_after == Σ fees + Σ turnover`（买入）或反向（卖出）；
- 任何时刻 `available >= 0`、`frozen >= 0`、`total = available + frozen`；
- 成交价永远在 `[limitDown, limitUp]` 内；
- 买入成交量是 lot 的整数倍（卖出零股除外）。

### 14.4 故障注入

- 盘口乱序、重复、缺口、交叉、过期、单边；
- Broker 拒单、部分成交、断线、回报延迟、UNKNOWN；
- 进程在 plan 写入后、订单提交前/后崩溃；
- 账本人为篡改，验证对账能发现并熔断。

### 14.5 验收门槛

- 聚合与撮合单测全绿；黄金回放逐字节一致；
- 连续 5 个交易日模拟盘无账本漂移；
- 实盘小资金连续 10 个交易日无重复下单、无超限、对账零漂移；
- 所有降级路径都有告警与审计记录；
- 公共仓无私有策略信息泄漏。

---

## 十五、开放问题（需要拍板）

1. **历史盘口数据**：QMT 是否提供可回放的历史 L1/L2？若没有，`orderbook` 回测只能从
   开始录制之日往后做，之前的区间只能用 synthetic。这是 P1 能否诚实交付的前提。
2. **QMT 交易 API**：账户权限、下单接口、回报机制、是否支持撤单/查单/查持仓；需要一次
   能力探测（与现有 datasource 能力探针同风格）。若运行环境收紧导致交易 API 或盘口历史不可用，
   P3 阻塞，但 P2 模拟盘仍可独立交付。
3. **组预算默认值**：等权、固定名义金额，还是策略给目标仓位？首期建议等权 + 私有配置覆盖。
4. **冲突默认**：`EXIT_FIRST` 是否会错过「反手」机会？首期建议先安全，后续用配置放开。
5. **日线信号执行时点**：15:00 收盘信号是当日收盘竞价成交，还是下一交易日开盘？建议默认
   下一交易日，避免收盘竞价流动性不足。
6. **跨定义共享账本**：是否允许「公共入场 + 私有出场」映射到同一 `ledgerGroup`？建议允许，
   但必须在私有配置显式声明，默认不共享。
7. **内部撮合**：是否允许组间反向内部成交（节省费用但产生虚拟成交）？建议 P4 再评估。
8. **实盘延迟预算**：从 1m 封存到订单提交的目标 P99 是多少？这决定是否需要独立盘口订阅、
   是否要在 `apps/signal` 进程内直接执行。
9. **组合回测范围**：首期只做「同一标的多策略」还是同时做「多标的组合」？建议首期只做
   同标的多策略 + 单标的资金分配，多标的组合与行业限额留到 P4；否则范围会迅速膨胀。
