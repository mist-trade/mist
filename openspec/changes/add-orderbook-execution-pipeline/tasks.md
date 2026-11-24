> **状态：已作废（2026-11-23）。** 本变化中的订单簿撮合、账本、独立执行进程不再实施；
> 最新结论见 `docs/strategy-signal-aggregation-decisions-2026-11-23.md`。

# 实施任务清单：信号聚合与订单簿执行管线 (Tasks)

> 本清单只定义阶段、依赖与验收证据，不包含实现代码。每个 Phase 结束必须停顿并提交
> 《Phase 交付与审计报告》，获得明确批准后才能进入下一 Phase。
> P3（真实资金）之前不得接线任何实盘 Broker。

## Phase 0：治理与契约底座

- [ ] 0.1 更新治理文档 §6.7：把「主动交易执行」调整为「由本变化按阶段引入」，保留旧
  `feat/strategy-portfolio-backtesting` 分支不可复用的约束。
- [ ] 0.2 定义并评审执行域契约：`ExecutionSignal`、`AggregatedOrderPlan`、
  `OrderBookSnapshot`、`BookFill`、物理/组账本、订单状态机、抑制原因码。
- [ ] 0.3 建立确定性测试底座：Decimal8 全链路、可控时钟、盘口 JSONL fixture、
  逐字节回放 harness。
- [ ] 0.4 盘点现有共享资产复用点：`calculatePriceLimits` / `isEtfSecurity` /
  `TRADING_RULES` / `@app/timezone` / `@app/decimal` / `@app/utils`，形成复用清单。
- **Gate 0**：契约评审通过；fixture 可回放；无生产接线。

## Phase 1：信号聚合 + 合成盘口回测

- [ ] 1.1 `apps/signal`：在同一事务写 `strategy_signals`、可选 `strategy_alert_events` 与
  `execution_intents` outbox；outbox 携带 `signalChannelKey`、`ledgerGroupKey`、`intent`、
  `emittedAt`，并实现提交后发布与补发扫描。
- [ ] 1.2 执行聚合器：去重、通道状态对账、`EXIT_FIRST` 冲突裁决、`RISK_CUT` 优先、
  组预算、组合限额、最大余数分配、抑制原因落库。
- [ ] 1.3 `SyntheticBookSource`：由 Bar 确定性构造盘口，标记 `SYNTHETIC`，不得伪装真实盘口。
- [ ] 1.4 `BookExecutionEngine`：限价保护、逐档吃单、参与率上限、部分成交、费用、
  A 股制度；先只做主动吃单。
- [ ] 1.5 `apps/backtest`：新增 `executionModel: 'bar' | 'orderbook'`，默认 `bar`；
  `orderbook` + synthetic 结果带质量标记。
- [ ] 1.6 组合回测：同一标的加载多个 `definitionId` 的 plan（公共 + 私有），共用内核与
  执行聚合器；现有单策略回测保持不变。
- **Gate 1**：聚合/撮合/账本单测全绿；同一信号流在两种模式下可跑通；确定性回放逐字节一致；
  组合回测能复现冲突裁决与多组预算分配。

## Phase 2：实时盘口录制 + 模拟盘

- [ ] 2.1 `apps/mist`：从 QMT native tick 投影 `OrderBookSnapshot`，发布到
  `market:book:{securityId}`；不修改 `CanonicalRealtimeSnapshot`；实现去重、排序、质量标记。
- [ ] 2.2 盘口归档：Redis 热存 + 按交易日列式冷存；`book_coverage` 元数据表；缺口检测。
- [ ] 2.3 `apps/execution`：单写者守护进程，消费 intents 与 book，`paper` 模式模拟成交，
  写物理/组账本、订单、成交、分配、审计。
- [ ] 2.4 对账：物理账 vs 组账、paper 成交 vs bar 模式、盘口覆盖率/过期率/滑点分布。
- [ ] 2.5 多源仲裁：QMT 优先、TDX 降级的整快照切换；禁止跨源拼接；切换审计。
- **Gate 2**：连续 5 个交易日模拟盘无账本漂移；盘口质量指标达标；降级路径有告警与审计。

## Phase 3：实盘 Broker（小资金，需单独批准）

- [ ] 3.1 QMT 交易 API 能力探测：下单、撤单、查单、查持仓、回报机制、账户权限。
- [ ] 3.2 `QmtBrokerAdapter`：实现 `BrokerPort`；Broker 回报为成交权威；`UNKNOWN` 只查询不重发。
- [ ] 3.3 实盘开关：默认 `DISARMED`、人工武装、有效期、单笔/单日限额、`KILL`。
- [ ] 3.4 对账与熔断：启动/重连/日终对账；漂移自动 `DISARMED`；只允许平仓。
- [ ] 3.5 HIL：小资金连续 10 个交易日，验证无重复下单、无超限、回报一致、零漂移。
- **Gate 3**：HIL 报告通过；资金放大必须再次人工批准。

## Phase 4：进阶执行（按需）

- [ ] 4.1 被动挂单与队列位置模型（需要逐笔委托/成交数据）。
- [ ] 4.2 TWAP/VWAP 切片与冲击模型。
- [ ] 4.3 组间内部撮合（internal crossing）评估。
- [ ] 4.4 多账户/分仓、行业与相关性集中度风控。

## 跨阶段验证命令（实现阶段使用）

- `pnpm -C mist typecheck`
- `pnpm -C mist test libs/execution apps/execution apps/backtest`
- 既有四大门禁：`strategy-pipeline-homogeneity`、`strategy-dual-timestamp`、
  `strategy-boundary`、`dev-server-boundary` 全绿
- `openspec validate add-orderbook-execution-pipeline --strict`（如本地具备 CLI）
