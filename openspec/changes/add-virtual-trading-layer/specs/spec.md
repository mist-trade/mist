# 规约规范：虚拟交易层与统一 TradingEngine (Specification)

## 一、术语与领域实体定义

### 1.1 `SignalGroupInput`
聚合层产出的一个信号组（本 change 之前的"聚合组"），交易层的裁决单元：
- `securityId: number` / `securityCode: string`：标的身份；
- `effectiveTime: Date`：组内全部信号共同的可用时刻（`availabilityKey`）；
- `tradingDay: string`：北京时间交易日（YYYY-MM-DD）；
- `signals: readonly AttributedSignal[]`：组内全部信号，各带 `alertEventId`、
  `KernelSignal` 与归因（策略名 / 周期标签 / 置信度 / 渲染好的紧凑 trace 链）。

### 1.2 `AccountSnapshot`
交易层账本的只读快照：
- `cash: number`：组合级现金（跨票共享）；
- `positions: ReadonlyMap<securityId, PositionSnapshot>`：按票持仓快照
  （复用 `position.types.ts` 的 `PositionSnapshot`）；
- `tradingDay: string`：账本已推进到的交易日。

### 1.3 `TradeInstruction` / `TradeRejection` / `TradingDecision`
- `TradeInstruction`：一条可执行交易指令——`action: 'BUY' | 'SELL'`、`quantity`
  （整手股数）、`referencePrice`（信号 triggerPrice）、`estimatedValue`、`reason`、
  归因（策略名 / 周期 / 置信度 / trace 链）；
- `TradeRejection`：一条被拒信号——原信号 + 结构化 `reason`
  （`ALREADY_HOLDING` / `NO_POSITION` / `INSUFFICIENT_CASH` / `T1_FROZEN` /
  `SYSTEMIC_CRUNCH` / `BELOW_LOT`）+ 人类可读 `detail`；
- `TradingDecision`：`instructions` + `rejections` + `accountAfter`
  （假定成交后的账户投影）。

### 1.4 `VirtualFillLogPort`
账本持久化端口（交易层域核心定义、app 层实现）：
- `append(event: VirtualFillEvent): Promise<void>`：追加成交事实（幂等锚点
  `alert_event_id` 唯一）；
- `loadBySecurity(securityId: number): Promise<readonly VirtualFillEvent[]>`：
  按 id 序加载，供 fold 重建账户快照。

---

## 二、行为需求规约 (Behavioral Requirements)

### 2.1 引擎决策规约 (Engine)

- **REQ-ENGINE-01 (纯函数确定性)**：`TradingEngine.decide` 必须是纯函数——同组
  信号 + 同账户快照，任意次重放的 `TradingDecision` 深比较恒等；引擎内部禁止
  I/O、墙钟、随机数。
- **REQ-ENGINE-02 (先出后进执行序)**：组内处理顺序必须为 EXIT 先于 ENTRY；同
  kind 内按置信度降序、并列时按 `alertEventId` 升序。卖出指令假定的资金释放当刻
  可用于后续买入裁决。
- **REQ-ENGINE-03 (复用统一裁决)**：指令生成必须经由 `ExecutionRiskArbiter`
  （实时与回测共用同一 Arbiter 配置），引擎不得私设第二套裁决规则；仓位计算必须
  来自 Arbiter 的 `cashAllocationRatio` × 整手取整，禁止散落的手写 sizing。
- **REQ-ENGINE-04 (拒绝必须显式)**：每个未产出指令的信号必须输出 `TradeRejection`
  并携带结构化原因；**严禁静默丢弃信号**。被拒信号不落成交事实，但其可审计性由
  `StrategySignal` 行 + `TradingDecision` 渲染保证。
- **REQ-ENGINE-05 (合成 Bar 因果等价)**：实时路径无真实 Bar 时，引擎必须以
  `timestamp = signal.signalTime`、`close = signal.triggerPrice` 构造合成 Bar 喂入
  Arbiter；合成 Bar 的时间与价格必须与信号确认 Bar 严格一致，禁止任何偏移。
- **REQ-ENGINE-06 (冲突裁决留缝)**：组内排序必须以 `GroupOrderingStrategy` 参数
  注入；interim 实现（先出后进）可被未来"冲突裁决因子"整体替换，禁止将排序逻辑
  硬编码进引擎主体。

### 2.2 虚拟账本规约 (Ledger)

- **REQ-LEDGER-01 (事件溯源单一事实源)**：成交事实的唯一权威载体是
  `virtual_fill_events` 追加日志；账户快照必须可由日志 fold 完整重建；禁止维护
  与日志脱节的第二状态。
- **REQ-LEDGER-02 (先出后进执行序)**：同一信号组内出现出场与入场时，账本必须
  严格遵循"先平仓、后开仓"的因果时序（与 isomorphic-decision-flow-exit-engine
  的账本规约一致）。
- **REQ-LEDGER-03 (幂等回填)**：`alert_event_id` 必须唯一约束——同一告警事件至多
  产生一条 fill；投递重试、幂等重放、进程重启都不得产生重复回填。
- **REQ-LEDGER-04 (指令即成交)**：实时虚拟账本按"指令已正常成交"推进——BUY 按
  `referencePrice` 全额成交（含手续费，沿用 `slippage-fee-calculator` 费率模型），
  现金扣减、持仓推进、T+1 冻结由 `PositionStateMachine` + `CapitalLedger` 现有
  逻辑承担。
- **REQ-LEDGER-05 (组合级现金)**：现金为组合级（跨票共享），持仓按票独立；
  初始资金默认 1,000,000，必须可通过环境变量配置。
- **REQ-LEDGER-06 (拒绝不落账)**：被拒信号不得产生 fill 事件，不得影响现金与持仓。

### 2.3 执行端适配规约 (Adapters)

- **REQ-ADAPT-01 (回测同构迁移)**：回测执行器必须经由 `TradingEngine` 产出指令，
  经 `SimulatedBroker` Next-Bar 真实撮合；per-bar 风控路径（hardStopLoss /
  SYSTEMIC_CRUNCH）必须统一走引擎；执行器内禁止内联 Arbiter 调用与手写 sizing。
- **REQ-ADAPT-02 (实时指令报告)**：`deliver.channel` 处理必须在渲染前执行
  `engine.decide`，最终投递消息为**指令报告**（账户快照头 + 指令行 + 拒绝行）；
  信号列表渲染退役。报告时间 = 组的 `effectiveTime`（上海时区渲染）。
- **REQ-ADAPT-03 (dev 同构)**：dev server 必须删除手写交易流水线并改用引擎 +
  内存端口；其对外响应字段（signals / trades）保持兼容。
- **REQ-ADAPT-04 (账本持久化端口隔离)**：交易层域核心禁止依赖 TypeORM /
  shared-data；持久化经由 `VirtualFillLogPort` 在 app 层实现（传输边界守卫）。

### 2.4 指令报告规约 (Report)

- **REQ-MSG-01 (报告完整性)**：指令报告必须包含：账户快照头（可用现金 / 持仓）、
  每条指令行（方向 / 股数 / 参考价 / 估算金额 / 策略名 / 周期 / 置信度 / trace 链）、
  每条拒绝行（信号摘要 + 结构化原因）。**严禁省略或静默丢弃任何组内信号**。
- **REQ-MSG-02 (卖出在前)**：多指令报告中卖出行必须先于买入行。
- **REQ-MSG-03 (归因随行)**：每条指令行必须携带其信号的紧凑 trace 链（复用
  `renderTraceChain`），归因不可与指令分离。

### 2.5 同构门禁规约 (Isomorphism)

- **REQ-ISO-01 (交易层三端同构)**：同组信号 + 同账户快照，回测适配器 / 实时
  适配器 / dev 适配器产出的 `TradingDecision` 必须逐字段相同（指令、拒绝、账户
  投影）。该门禁是信号层同构门禁（`strategy-dual-timestamp.guard.spec.ts`）的
  姊妹门禁，必须以 CI 测试固化。
- **REQ-ISO-02 (引擎重放确定性)**：引擎对同一输入的 N 次求值必须深比较恒等。

---

## 三、边界与不变式 (Boundaries & Invariants)

- 信号层零改动：内核 / 决策流 / 虚拟出场子系统照旧（出场信号仍是 KernelSignal）；
- 聚合层分组与契约 V2 零改动：fanout payload / jobId / sweep / replay 照旧；
- 聚合层信号列表渲染退役，渲染权移交交易层报告模块；
- 防未来函数不变：`signalTime ≡ StrategyBar.timestamp`、Next-Bar 撮合、严禁
  `pivotPrice` 入场或作为绩效基准；
- 实时执行端 = 人工下单：无券商 API、无自动下单（2026-11-23 定稿）；
- 已知偏差（interim）：出场策略通道持仓（私仓 MultiLotVirtualPosition）按
  KernelSignal 推进，与本层 fill 事实存在理论偏差面（资金不足拒绝入场时的幻影
  批次）；归一路径见 design.md 第四节，作为 follow-up 任务跟踪。
