# OpenSpec 缺口清单（2026-11-26 修订，基线 11-26）

> 本文件是 Mist 平台 OpenSpec 缺口全景的**唯一权威清单**。**更新任何 change 状态时同步修订本文件。**

## 状态速览

- `openspec/specs/`：**120 个已采纳 Live Spec**（2026-11-26 新增 `trading-engine` 完整交易引擎权威规范，同步更新 `decision-flow-engine` 同构出场插件规约与 `backtest-trade-decision` 替代注记）
- `openspec/changes/`：**2 个活跃未实施 Change**（`lifecycle-driven-kline-reconciliation`、`unify-quant-pipeline-architecture`）
- **核心架构演进闭环（2026-10 ~ 2026-11）**：
  - **两层单向架构与完整交易引擎最终定稿（2026-11-26 归档 `add-virtual-trading-layer`）**：取消“聚合层 → 交易层”独立分段，全系统收口为 **「信号层 → 完整交易引擎（含聚合、裁决、整数厘账本、撮合与交易手册正式指令输出）」**；正式作废原 Task 10.1 双账本反向注入，确立「策略/插件私有虚拟账本仅用于产出信号；真实账本平仓在交易引擎内部闭环，严禁反向发信号或注入状态到信号层」铁律
  - **出场插件同构化与决策树收敛（2026-11-26 归档 `isomorphic-decision-flow-exit-engine`）**：14/14 任务完成，`category: 'EXIT'` 插件与外部加载器、决策树 `SELL` 分流与归因透传全部落地
  - **战术事件层退役（2026-11-24）**：`TacticalEventAggregator`（EdgeDetector / TemporalWindowEngine / CooldownTracker）整体删除，`tactical-event-pipeline` 冻结为退役记录；`role: 'context'` 插件纪律落地
  - **历史订单簿提案作废归档（2026-11-26 归档 `obsolete-add-orderbook-execution-pipeline`）**：不再实施独立订单簿撮合与 `apps/execution`，由完整交易引擎取代
  - **PA 纯数学核心与视觉适配器落地（2026-11-25）**：`@app/pacore`（FVG / WickGap / PinBar / Sweep / GapProjection / Neckline）+ `PaVisualAdapter` + `toPaKSeries` 纯边界映射落地
  - **通用虚拟出场与 5m 监护周期传播（2026-11-25 ~ 11-26）**：硬止损从交易引擎退役回归信号层 `PriceDefenseExitPlugin` / `PriceLevelExitPolicy`，内核支持 `surveillancePeriods` 轻量监护周期与同 Bar 先出后进

---

## 1. 活跃 / 待执行 Change

| Change | 进度 | 状态与说明 |
|---|---|---|
| `lifecycle-driven-kline-reconciliation` | 0/20 | 未开始：数据源生命周期驱动的 K 线自愈对账（TDX/QMT 终端重启与心跳驱动自动缺口回填，依赖真实宿主机终端环境验证） |
| `unify-quant-pipeline-architecture` | 0/15 | 未开始：`libs/strategy` 物理包瘦身与统一 `QuantPipeline(Source, Kernel, Sinks[])` 重构（注：部分管线门面能力已由 `runTradingPipeline` 提前满足，启动前需按 2026-11-26 两层架构重审边界） |

---

## 2. 近期归档（2026-10-16 ~ 2026-11-26）

| 日期 | Change | 内容与状态 |
|---|---|---|
| **11-26** | `2026-11-26-add-virtual-trading-layer` | **已完成归档**（Groups 1–9 全部完成，Task 10.1 架构评审驳回永久作废；Live Spec 沉淀至 `openspec/specs/trading-engine/spec.md`）：完整交易引擎落地（`groupSignals` 聚合 + `TradingEngine` 规则管线 + 整数厘 `virtual_fill_events` migration 037 + `SimulatedBroker` 厘算术移植 + `buildTradingManual` 交易手册 + `runTradingPipeline` 门面 + 四端同构门禁），退役 `ExecutionRiskArbiter` / `PositionStateMachine.onSignal` / 信号列表渲染 |
| **11-26** | `2026-11-26-isomorphic-decision-flow-exit-engine` | **已完成归档**（14/14 完成；Live Spec 同步至 `openspec/specs/decision-flow-engine/spec.md`）：出场插件 `category: 'EXIT'` 同构契约、外部加载器平权注册、决策流 `BranchNode` / `TerminalNode(SELL)` 归因透传与虚拟持仓纯化 |
| **11-26** | `2026-11-26-obsolete-add-orderbook-execution-pipeline` | **已作废归档**（2026-11-23 作废，2026-11-26 归档）：原独立订单簿撮合、多组子账本与 `apps/execution` 进程方案不再实施，由 `trading-engine` 完整交易引擎取代 |
| **11-14** | `2026-10-*`（13 个历史变更批量归档） | 涵盖 `upgrade-backtest-decision-and-parity-engine`、`introduce-canonical-market-series`、`support-multi-period-evaluation`、`add-backtest-intraday-execution`、`add-vendor-market-data-import`、`implement-cys13-market-breadth-and-panic-gauge`、`integrate-native-terminal-visualization`、`capture-realtime-provider-anomalies` 等历史阶段收口 |

---

## 3. 跨环境与生产部署验收（HIL / Ops 待办）

以下属于代码与单测已完成，但依赖 **Windows 宿主机 + 生产 MySQL / 真实行情终端** 的上线与实盘验收项：

1. **生产库 Migration 037 与虚拟账本配置上线**：在生产 MySQL 执行 `037_create_virtual_fill_events.sql`（及前置 035/036），并在 `notification` 容器配置 `NOTIFICATION_VIRTUAL_SEED_CAPITAL`（默认 `1000000`），验证实时交易手册投递与 `virtual_fill_events` 幂等落库。
2. **实时策略实盘观察与切 On 决策**：`REALTIME_PRODUCTIZATION_MODE=shadow` 实盘运行观察，评估切换为 `on`。
3. **实时订阅断流恢复实盘演练**：真实 TDX/QMT 进程重启后断流检测与告警阈值实盘校准。

---

## 4. 明确作废与已清理项

- `add-virtual-trading-layer` **Task 10.1**（`virtual_fill_events` 反向注入 `VirtualExitPolicyPort`）：**2026-11-26 架构评审正式驳回并永久作废**——信号层策略私有虚拟账本仅用于产出信号，真实账本平仓在交易引擎内部闭环，严禁反向注入或反向发信号。
- `add-orderbook-execution-pipeline`（订单簿撮合与独立执行进程）：**2026-11-23 作废，2026-11-26 归档**。
- `tactical-event-pipeline`（`TacticalEventAggregator` 边沿/窗口/冷却中间层）：**2026-11-24 整体删除并冻结退役**。
- `ExecutionRiskArbiter` 与 `PositionStateMachine.onSignal` / 旧 `ExitPolicyPort`：**2026-11-25 彻底退役删除**。
- `feat/strategy-portfolio-backtesting`（历史多策略组合回测分支）：已废弃。
- `migrate-stack-to-linux-node-with-ssh-tunnel`（Linux 迁移）：已放弃并删除。
