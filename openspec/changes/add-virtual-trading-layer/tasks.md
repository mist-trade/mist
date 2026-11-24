# 任务清单：虚拟交易层与统一 TradingEngine (Tasks)

## 1. 交易层域核心（libs/strategy/src/trading/，纯域、DB 无关）

- [ ] 1.1 域模型：`AttributedSignal` / `SignalGroupInput` / `AccountSnapshot` /
      `TradeInstruction` / `TradeRejection` / `TradingDecision` 类型定义；
- [ ] 1.2 组排序策略：`GroupOrderingStrategy`（interim = 先出后进、置信度降序、
      alertEventId 升序），作为引擎参数留冲突因子插拔缝；
- [ ] 1.3 规则管线：`Rule` / `Verdict` 类型 + 信号裁决管线（entry：
      regimeGate → cashGate → sizingRule；exit：signalExit）+ Bar 巡检管线
      （systemicCrunch / hardStop）+ fallback 兜底拒绝；引擎账户结构性预检
      （NO_POSITION / INSUFFICIENT_CASH 含费 / T1_FROZEN）；
- [ ] 1.4 `TradingEngine.decide`：合成 bar（signalTime/triggerPrice）→ 逐信号
      Arbiter 裁决 → 指令 + 拒绝 + 假定成交账户投影（含手续费，复用
      `slippage-fee-calculator`）；
- [ ] 1.5 `VirtualFillLogPort` 端口定义（append / loadBySecurity）；
- [ ] 1.6 单测：纯函数确定性（同输入重放恒等）、先出后进、卖出释放资金可供买入、
      拒绝原因精确、整手取整、T+1 冻结、手续费计入现金、整数厘舍入点唯一；
- [ ] 1.7 规则管线移植：`ExecutionRiskArbiter` 三级平仓 / 买入管卡逻辑 → 规则
      序列（类退役，既有 spec 用例移植）；`SizingStrategy` 默认 AllInWithBuffer
      （0.95 × 整手取整，ELEVATED_RISK 减半）；
- [ ] 1.8 `SimulatedBroker` 移植：撮合语义零改动（Next-Bar / 一字板 / T+1 /
      STOP / 日结）、算术重写整数厘；orderId/eventId 改业务键派生
      （`ord-{intentId}`，禁 `Date.now()`）；
- [ ] 1.9 费率计算器整数厘重写（费率语义零改动，唯一舍入点 half-up 取厘）+
      `CapitalLedger` / `PositionStateMachine` 整数厘移植与 rehydrate 入口；
- [ ] 1.10 黄金文件回放基线：`trading/__fixtures__/` 版本化 fixture
      （信号序列 + 快照序列 → 决策序列），golden diff 分类审查工具。

## 2. 账本持久化（libs/shared-data + migration 037）

- [ ] 2.1 `deploy/database/migrations/037_create_virtual_fill_events.sql`
      （金额列 BIGINT 厘、价格列 DECIMAL(10,3)，REQ-ENGINE-07）；
- [ ] 2.2 `libs/shared-data/src/entities/virtual-fill-event.entity.ts` +
      index 导出；
- [ ] 2.3 notification 侧 TypeORM `VirtualFillLogPort` 实现（append 事务 +
      loadBySecurity），引擎装配（种子资金 env `NOTIFICATION_VIRTUAL_SEED_CAPITAL`
      默认 1,000,000、cashAllocationRatio 0.95）。

## 3. 交易手册渲染（apps/notification）

- [ ] 3.1 交易手册渲染器（header 带账户快照、▶ 指令行 + 归因与 trace 链、
      ✗ 拒绝行 + 原因）；
- [ ] 3.2 `renderTraceChain` 迁入交易层报告模块；
- [ ] 3.3 `notification-envelope.ts` 信号列表渲染退役，channel handler 接引擎
      与报告渲染器，整批 SENT 语义保持。

## 4. 回测执行端迁移（apps/backtest）

- [ ] 4.1 executor 内联 Arbiter 编排 → `engine.decide`（每 Bar 信号批），指令交
      Broker submitOrder；per-bar 风控裁决路径（hardStopLoss / SYSTEMIC_CRUNCH）
      走引擎；
- [ ] 4.2 内存端口注入（随跑随弃）；engine 配置透传（SizingStrategy 0.95、硬止损
      -0.08 规则参数、lot 100；硬止损归属待拍板——暂引擎透传、倾向改策略定义，
      见 design 11.4）；
- [ ] 4.3 回测对账（黄金回放）：迁移前旧路径生成 golden 基线 → 迁移后 diff——
      语义变化（先出后进、0.95 预算、规则管线序、厘级舍入）显式归类审查。

## 5. dev server 迁移（tools/strategy-dev）

- [ ] 5.1 删除手写交易流水线（`server.ts:899-985` 手写 sizing / onSignal 出场 /
      0.95），换引擎 + 内存端口；
- [ ] 5.2 dev 前端回测响应字段保持兼容（signals/trades 不变）；
- [ ] 5.3 `PositionStateMachine.onSignal` 决策分支删除（回归纯记账；全库唯一
      调用方 dev server:969 已迁引擎）。

## 6. 同构门禁与回归

- [ ] 6.1 交易层同构测试：同组信号 + 同快照，三端适配器 `TradingDecision` 逐字段
      相同；
- [ ] 6.2 引擎确定性测试（重放 N 次深比较恒等）；
- [ ] 6.3 全量回归：typecheck + eslint + 相关 jest；dev server 端到端回测
      （000001 30m、definition 3、2024 Q1）输出交易手册并核对交易语义；
- [ ] 6.4 私仓回归（regime context 角色与出场插件不受影响）。

## 7. 文档与状态

- [ ] 7.1 AGENTS.md 三层架构准则更新（交易层待建设 → 已实施，组件清单）；
- [ ] 7.2 `docs/strategy-signal-aggregation-decisions-2026-11-23.md` 增补
      交易层定稿与回归数字；
- [ ] 7.3 记忆更新（project_orderbook_execution_pipeline）。

## 8. 管线门面与私仓离线接入

- [ ] 8.1 分组提取：`libs/strategy/src/trading/grouping.ts` 纯函数
      `groupSignals(...)`，apps/signal processor 与门面共用；
- [ ] 8.2 `libs/strategy/src/pipeline/run-trading-pipeline.ts`：Bars 按
      `(availabilityKey, period)` 归并驱动 kernel → 分组 → engine.decide →
      交易手册（零基础设施，内存 fill 日志，离线合成幂等 id）；
- [ ] 8.3 私仓 `build.mjs` alias 增补（@app/strategy / @app/market-data）+ 私仓
      边界守卫增加 `src/types.ts` FactorPlugin 与公共契约的结构兼容断言；
- [ ] 8.4 私仓 `scripts/run-pipeline.js`：本地 K 线 + 预设编译 + 门面 →
      交易手册打印 / JSON 导出；
- [ ] 8.5 门面单测：确定性、离线幂等、报告与投递渲染同源。

## 9. 后续（本 change 外，记录缝位）

- [ ] 9.1 `VirtualExitPolicyPort` 账户视图注入：私仓 `MultiLotVirtualPosition`
      改为从 `virtual_fill_events` 派生批次，消除出场策略持仓与执行账本的偏差面
      （design.md 第四节的下一阶段）；
- [ ] 9.2 同刻同票冲突裁决因子化研究（替换 interim 先出后进排序）；
- [ ] 9.3 成交回写 / 券商 API 对账（人工交易闭环，用户后期决定）。
