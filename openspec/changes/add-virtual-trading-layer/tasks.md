# 任务清单：虚拟交易层与统一 TradingEngine (Tasks)

## 1. 交易层域核心（libs/strategy/src/trading/，纯域、DB 无关）

- [ ] 1.1 域模型：`AttributedSignal` / `SignalGroupInput` / `AccountSnapshot` /
      `TradeInstruction` / `TradeRejection` / `TradingDecision` 类型定义；
- [ ] 1.2 组排序策略：`GroupOrderingStrategy`（interim = 先出后进、置信度降序、
      alertEventId 升序），作为引擎参数留冲突因子插拔缝；
- [ ] 1.3 拒绝原因预判：在调用 Arbiter 前输出结构化原因（ALREADY_HOLDING /
      NO_POSITION / INSUFFICIENT_CASH / T1_FROZEN / BELOW_LOT / SYSTEMIC_CRUNCH）；
- [ ] 1.4 `TradingEngine.decide`：合成 bar（signalTime/triggerPrice）→ 逐信号
      Arbiter 裁决 → 指令 + 拒绝 + 假定成交账户投影（含手续费，复用
      `slippage-fee-calculator`）；
- [ ] 1.5 `VirtualFillLogPort` 端口定义（append / loadBySecurity）；
- [ ] 1.6 单测：纯函数确定性（同输入重放恒等）、先出后进、卖出释放资金可供买入、
      拒绝原因精确、整手取整、T+1 冻结、手续费计入现金。

## 2. 账本持久化（libs/shared-data + migration 037）

- [ ] 2.1 `deploy/database/migrations/037_create_virtual_fill_events.sql`；
- [ ] 2.2 `libs/shared-data/src/entities/virtual-fill-event.entity.ts` +
      index 导出；
- [ ] 2.3 notification 侧 TypeORM `VirtualFillLogPort` 实现（append 事务 +
      loadBySecurity），引擎装配（种子资金 env `NOTIFICATION_VIRTUAL_SEED_CAPITAL`
      默认 1,000,000、cashAllocationRatio 0.95）。

## 3. 指令报告渲染（apps/notification）

- [ ] 3.1 指令报告渲染器（header 带账户快照、▶ 指令行 + 归因与 trace 链、
      ✗ 拒绝行 + 原因）；
- [ ] 3.2 `renderTraceChain` 迁入交易层报告模块；
- [ ] 3.3 `notification-envelope.ts` 信号列表渲染退役，channel handler 接引擎
      与报告渲染器，整批 SENT 语义保持。

## 4. 回测执行端迁移（apps/backtest）

- [ ] 4.1 executor 内联 Arbiter 编排 → `engine.decide`（每 Bar 信号批），指令交
      Broker submitOrder；per-bar 风控裁决路径（hardStopLoss / SYSTEMIC_CRUNCH）
      走引擎；
- [ ] 4.2 内存端口注入（随跑随弃）；engine 配置透传（0.95 预算、硬止损 -0.08、
      lot 100）；
- [ ] 4.3 回测输出对账：同批信号下指令集与旧路径决策一致（允许组内顺序与预算比例
      的既定语义变化，偏差需显式解释）。

## 5. dev server 迁移（tools/strategy-dev）

- [ ] 5.1 删除手写交易流水线（`server.ts:899-985` 手写 sizing / onSignal 出场 /
      0.95），换引擎 + 内存端口；
- [ ] 5.2 dev 前端回测响应字段保持兼容（signals/trades 不变）。

## 6. 同构门禁与回归

- [ ] 6.1 交易层同构测试：同组信号 + 同快照，三端适配器 `TradingDecision` 逐字段
      相同；
- [ ] 6.2 引擎确定性测试（重放 N 次深比较恒等）；
- [ ] 6.3 全量回归：typecheck + eslint + 相关 jest；dev server 端到端回测
      （000001 30m、definition 3、2024 Q1）输出指令报告并核对交易语义；
- [ ] 6.4 私仓回归（regime context 角色与出场插件不受影响）。

## 7. 文档与状态

- [ ] 7.1 AGENTS.md 三层架构准则更新（交易层待建设 → 已实施，组件清单）；
- [ ] 7.2 `docs/strategy-signal-aggregation-decisions-2026-11-23.md` 增补
      交易层定稿与回归数字；
- [ ] 7.3 记忆更新（project_orderbook_execution_pipeline）。

## 8. 后续（本 change 外，记录缝位）

- [ ] 8.1 `VirtualExitPolicyPort` 账户视图注入：私仓 `MultiLotVirtualPosition`
      改为从 `virtual_fill_events` 派生批次，消除出场策略持仓与执行账本的偏差面
      （design.md 第四节的下一阶段）；
- [ ] 8.2 同刻同票冲突裁决因子化研究（替换 interim 先出后进排序）；
- [ ] 8.3 成交回写 / 券商 API 对账（人工交易闭环，用户后期决定）。
