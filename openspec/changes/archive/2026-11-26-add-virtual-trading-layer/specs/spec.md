# 规约规范：虚拟交易层与统一 TradingEngine (Specification)

## 一、术语与领域实体定义

### 1.1 `SignalGroupInput`
聚合层产出的一个信号组（本 change 之前的"聚合组"），交易层的裁决单元：
- `securityId: number` / `securityCode: string`：标的身份；
- `effectiveTime: Date`：组内全部信号共同的可用时刻（`availabilityKey`）；
- `tradingDay: string`：北京时间交易日（YYYY-MM-DD）；
- `signals: readonly AttributedSignal[]`：组内全部信号，各带 `idempotencyKey`
  （幂等锚点：实时 = alertEventId 字符串化，离线 = 合成幂等串）、`KernelSignal`
  与归因（策略名 / 周期标签 / 置信度 / 渲染好的紧凑 trace 链）。

### 1.2 `AccountSnapshot`
交易层账本的只读快照：
- `cash: number`：组合级现金（跨票共享）；
- `positions: ReadonlyMap<securityId, PositionSnapshot>`：按票持仓快照
  （复用 `position.types.ts` 的 `PositionSnapshot`）；
- `tradingDay: string`：账本已推进到的交易日。

### 1.3 `TradeInstruction` / `TradeRejection` / `TradingDecision`
- `TradeInstruction`：一条可执行交易指令——`instructionId`（业务键派生
  `ti-{idempotencyKey}`）、`idempotencyKey`（回链聚合层锚点）、`action: 'BUY' |
  'SELL'`、`quantity`（整手股数）、`referencePrice`（信号 triggerPrice）、
  `estimatedValueLi`（整数厘）、`reason`、归因（策略名 / 周期 / 置信度 / trace 链）；
- `TradeRejection`：一条被拒信号——原信号 + 结构化 `reason`
  （`ALREADY_HOLDING` / `NO_POSITION` / `INSUFFICIENT_CASH` / `T1_FROZEN` /
  `SYSTEMIC_CRUNCH` / `BELOW_LOT`）+ 人类可读 `detail`；
- `TradingDecision`：`instructions` + `rejections` + `accountAfter`
  （假定成交后的账户投影）。

### 1.4 `PipelineFacade`
管线门面（`runTradingPipeline`）：交易层的独立运行入口——输入内存 Bars、编译后的
`KernelPlan`、插件注册表；内部完成 Bar 归并驱动 → 信号收集 → 分组 → 逐组
`TradingEngine.decide` → 交易手册。零 NestJS / DB / Redis 依赖，可被私仓 esbuild
捆绑；回测执行器、dev server、实时投递与私仓脚本全部是它的数据适配器。

### 1.5 `VirtualFillLogPort`
账本持久化端口（交易层域核心定义、app 层实现）：
- `append(event: VirtualFillEvent): Promise<void>`：追加成交事实（幂等锚点
  `alert_event_id` 唯一）；
- `loadBySecurity(securityId: number): Promise<readonly VirtualFillEvent[]>`：
  按 id 序加载，供 fold 重建账户快照。

### 1.6 `交易手册`
交易层产出的最终投递内容（代码层标识沿用 InstructionReport）：账户快照头
（可用现金 / 持仓）+ 指令行（方向 / 股数 / 参考价 / 估算金额 / 策略名 / 周期 /
置信度 / trace 链）+ 拒绝行（信号摘要 + 结构化原因）。四条链路（回测 / 实时 /
dev / 私有研究）的最终产物同源同构；本文档中"指令报告"自本节起统一称"交易手册"。

### 1.7 `Rule` / `Verdict` / `SizingStrategy`
- `Rule`：纯函数裁决规则 `(ctx: RuleContext) => Verdict`；管线内首条终局裁决生效，
  末位 fallback 规则兜底显式拒绝（REQ-ENGINE-04）；
- `Verdict`：`{ action: 'INSTRUCT', order } | { action: 'REJECT', reason, detail }`；
- `SizingStrategy`：仓位策略，与裁决分离——输入（账户快照 / 合成 bar / regime），
  输出整手股数；默认 `AllInWithBuffer`（可用现金 × 0.95 × 整手取整，
  ELEVATED_RISK 预算减半语义保留）。

### 1.8 `厘`（整数货币单位）
域核心一切金额的表示与运算单位（1 元 = 1000 厘，整数）。费率折算（佣金万 2.5、
印花税万 5 等）是唯一舍入点（half-up 取厘），其后全整数运算；市场价（A 股 ≤3 位
小数）在数据边界一次转换，精确无损。落库：金额列 BIGINT 厘，价格列 DECIMAL(10,3)。

---

## 二、行为需求规约 (Behavioral Requirements)

### 2.1 引擎决策规约 (Engine)

- **REQ-ENGINE-01 (纯函数确定性)**：`TradingEngine.decide` 必须是纯函数——同组
  信号 + 同账户快照，任意次重放的 `TradingDecision` 深比较恒等；引擎内部禁止
  I/O、墙钟、随机数。
- **REQ-ENGINE-02 (先出后进执行序)**：组内处理顺序必须为 EXIT 先于 ENTRY；同
  kind 内按置信度降序、并列时按 `idempotencyKey` 字典序（确定性平局规则）。卖出
  指令假定的资金释放当刻可用于后续买入裁决。账本侧因果时序见 REQ-LEDGER-02。
- **REQ-ENGINE-03 (规则管线统一裁决)**：指令生成必须经由规则管线（信号裁决
  `signalRules` + Bar 风控巡检 `riskRules`），规则为纯函数 `(ctx) => Verdict`，
  首条终局裁决生效、末位 fallback 兜底显式拒绝；引擎不得私设第二套裁决规则，
  入场与出场必须同处一条管线（不存在第二条出单路径）。仓位计算必须来自
  `SizingStrategy`（默认 0.95 × 整手取整），禁止散落的手写 sizing。
- **REQ-ENGINE-04 (拒绝必须显式)**：每个未产出指令的信号必须输出 `TradeRejection`
  并携带结构化原因；**严禁静默丢弃信号**。被拒信号不落成交事实，但其可审计性由
  `StrategySignal` 行 + `TradingDecision` 渲染保证。
- **REQ-ENGINE-05 (合成 Bar 因果等价)**：实时路径无真实 Bar 时，引擎必须以
  `timestamp = signal.signalTime`、`close = signal.triggerPrice` 构造合成 Bar 喂入
  Arbiter；合成 Bar 的时间与价格必须与信号确认 Bar 严格一致，禁止任何偏移。
- **REQ-ENGINE-06 (冲突裁决留缝)**：组内排序必须以 `GroupOrderingStrategy` 参数
  注入；interim 实现（先出后进）可被未来"冲突裁决因子"整体替换，禁止将排序逻辑
  硬编码进引擎主体。
- **REQ-ENGINE-07 (整数厘制)**：域核心一切金额必须以整数厘表示与运算（1 元 =
  1000 厘）；费率折算只在唯一舍入点发生（half-up 取厘），其后全整数；禁止 float
  金额在域核心流转；市场价在数据边界一次转换（A 股价格 ≤3 位小数，转换精确
  无损）。落库：金额列 BIGINT 厘、价格列 DECIMAL(10,3)。

### 2.2 虚拟账本规约 (Ledger)

- **REQ-LEDGER-01 (事件溯源单一事实源)**：成交事实的唯一权威载体是
  `virtual_fill_events` 追加日志；账户快照必须可由日志 fold 完整重建；禁止维护
  与日志脱节的第二状态。
- **REQ-LEDGER-02 (先出后进执行序)**：同一信号组内出现出场与入场时，账本必须
  严格遵循"先平仓、后开仓"的因果时序（与 isomorphic-decision-flow-exit-engine
  的账本规约一致）。
- **REQ-LEDGER-03 (幂等回填)**：幂等锚点必须唯一约束（DB 列 `alert_event_id`
  承载实时数值锚点；域内键为字符串 `idempotencyKey`）——同一告警事件至多产生
  一条 fill；投递重试、幂等重放、进程重启都不得产生重复回填。
- **REQ-LEDGER-04 (指令即成交)**：实时虚拟账本按"指令已正常成交"推进——BUY 按
  `referencePrice` 全额成交（含手续费，费率模型沿用 `slippage-fee-calculator`
  语义、算术为整数厘重写版，REQ-ENGINE-07），现金扣减、持仓推进、T+1 冻结由
  `PositionStateMachine` + `CapitalLedger` 现有逻辑承担。
- **REQ-LEDGER-05 (组合级现金)**：现金为组合级（跨票共享），持仓按票独立；
  初始资金默认 1,000,000，必须可通过环境变量配置。
- **REQ-LEDGER-06 (拒绝不落账)**：被拒信号不得产生 fill 事件，不得影响现金与持仓。

### 2.3 执行端适配规约 (Adapters)

- **REQ-ADAPT-01 (回测同构迁移)**：回测执行器必须经由 `TradingEngine` 产出指令，
  经 `SimulatedBroker` Next-Bar 真实撮合；per-bar 风控路径（hardStopLoss /
  SYSTEMIC_CRUNCH）必须统一走引擎 `surveilBar` 巡检；执行器内禁止内联裁决调用与
  手写 sizing。
- **REQ-ADAPT-02 (实时交易手册)**：`deliver.channel` 处理必须在渲染前执行
  `engine.decide`，最终投递消息为**交易手册**（账户快照头 + 指令行 + 拒绝行）；
  信号列表渲染退役。报告时间 = 组的 `effectiveTime`（上海时区渲染）。
- **REQ-ADAPT-03 (dev 同构)**：dev server 必须删除手写交易流水线并改用引擎 +
  内存端口；其对外响应字段（signals / trades）保持兼容。
- **REQ-ADAPT-04 (账本持久化端口隔离)**：交易层域核心禁止依赖 TypeORM /
  shared-data；持久化经由 `VirtualFillLogPort` 在 app 层实现（传输边界守卫）。

### 2.4 交易手册规约 (Report)

- **REQ-MSG-01 (报告完整性)**：交易手册必须包含：账户快照头（可用现金 / 持仓）、
  每条指令行（方向 / 股数 / 参考价 / 估算金额 / 策略名 / 周期 / 置信度 / trace 链）、
  每条拒绝行（信号摘要 + 结构化原因）。**严禁省略或静默丢弃任何组内信号**。
- **REQ-MSG-02 (卖出在前)**：多指令交易手册中卖出行必须先于买入行。
- **REQ-MSG-03 (归因随行)**：每条指令行必须携带其信号的紧凑 trace 链（复用
  `renderTraceChain`），归因不可与指令分离。

### 2.5 管线门面规约 (Facade)

- **REQ-FACADE-01 (零基础设施)**：门面必须为纯函数编排——输入内存 Bars / 计划 /
  注册表，输出信号 / 分组 / 决策 / fill 日志 / 报告；禁止依赖 NestJS、数据库、
  Redis 或任何进程内单例状态。
- **REQ-FACADE-02 (归并驱动)**：门面必须按 `(availabilityKey, period 升序)` 合并
  全部周期 Bars 逐根驱动内核（与 HistoricalBarSource 归并规则一致），禁止乱序
  求值。
- **REQ-FACADE-03 (分组单一实现)**：聚合分组逻辑必须提取为纯域函数，线上
  （apps/signal）与离线（门面）共用同一实现；禁止两份分组代码。
- **REQ-FACADE-04 (离线幂等)**：离线 fill 的幂等锚点必须为确定性合成 id
  （`offline-{definitionId}-{signalTime.getTime()}-{kind}`）；同输入重放不得产生
  重复回填。
- **REQ-FACADE-05 (报告同源)**：门面的交易手册与线上投递消息必须由同一渲染器
  产出，严禁两份消息模板。
- **REQ-FACADE-06 (私仓结构兼容)**：私仓 `FactorPlugin` 类型副本必须与公共契约
  结构兼容，且必须有 CI 断言守护（防止类型漂移导致门面装配失败）。

### 2.6 同构门禁规约 (Isomorphism)

- **REQ-ISO-01 (交易层三端同构)**：同组信号 + 同账户快照，回测适配器 / 实时
  适配器 / dev 适配器产出的 `TradingDecision` 必须逐字段相同（指令、拒绝、账户
  投影）。该门禁是信号层同构门禁（`strategy-dual-timestamp.guard.spec.ts`）的
  姊妹门禁，必须以 CI 测试固化。
- **REQ-ISO-02 (引擎重放确定性)**：引擎对同一输入的 N 次求值必须深比较恒等。
- **REQ-ISO-03 (标识业务键派生)**：引擎与撮合端产出的全部标识（instructionId /
  orderId / eventId）必须派生自幂等业务键（`ti-{idempotencyKey}` /
  `ord-{idempotencyKey}` / `fill-{idempotencyKey}`）；禁止墙钟（`Date.now`）、
  随机源与自增计数器——同输入重放与跨端同构逐字段比较的前提。
- **REQ-ISO-04 (黄金文件回放)**：引擎回归与四端迁移对账必须以版本化黄金文件为准
  ——`(信号序列, 账户快照序列) → 决策序列` 固化为 fixture；任何语义变化必须经
  golden diff 显式审查，厘级舍入差异须归类标注，禁止静默重生成基线。

---

## 三、边界与不变式 (Boundaries & Invariants，2026-11-26 终审收口)

- **两层单向架构**：取消独立的“聚合层 → 交易层”分段，全系统收口为「信号层 → 完整交易引擎」；信号聚合分组（`groupSignals` + 契约 V2）、规则管线裁决、事件溯源账本、撮合与交易手册输出均归属于完整交易引擎；
- **信号层纯度与私有账本定界**：内核 / 决策流 / 虚拟出场子系统仅负责产出 `KernelSignal`；策略/插件维护的私有虚拟持仓状态机唯一目的是产出买卖信号，与交易引擎账本物理隔离、零资金/DB 耦合；
- **真实账本内部闭环（严禁反向注入）**：交易引擎真实/虚拟执行账本自身触发的任何风控平仓或账户处置必须在交易引擎内部闭环并直接输出交易指令，**严禁向信号层反向发信号**，亦**严禁将 `virtual_fill_events` / `AccountSnapshot` 反向注入回信号层**（原 Task 10.1 已永久作废）；跨层状态偏差由交易引擎通过 `NO_POSITION` 等结构化拒绝显式审计拦截；
- **防未来函数不变**：`signalTime ≡ StrategyBar.timestamp`、Next-Bar 撮合、严禁 `pivotPrice` 入场或作为绩效基准；
- **实时执行端 = 人工下单**：无券商 API、无自动下单（2026-11-23 定稿）。
