# OpenSpec 缺口清单（2026-11-26 修订，基线 11-26）

> 本文件是 Mist 平台 OpenSpec 缺口全景的**唯一权威清单**。**更新任何 change 状态时同步修订本文件。**

## 状态速览

- `openspec/specs/`：**121 个已采纳 Live Spec**（2026-11-26 归并更新 `trading-engine`、`decision-flow-engine`、`factor-plugin-contract`、`chan-fibonacci-overlay`、`backtest-trade-decision`、`market-breadth-gauge`、`native-terminal-visualization`、`realtime-provider-anomaly-capture`，移除 `CONSENSUS` 与启发式信号置信度规约，引入两阶段同向归并，全量 Live Spec 100% 校验通过）
- `openspec/changes/`：**0 个活跃未实施 Change（全部演进闭环或作废归档）**
- **核心架构演进闭环（2026-10 ~ 2026-11）**：
  - **两阶段同向归并与全链路置信度退役（2026-11-26 归档 `consolidate-same-direction-signals-and-remove-confidence`）**：解决原 `add-virtual-trading-layer` **Task 10.2**，物理删除 `sellFirstByConfidence` 排序与 `confidence` / `minConfidence` / `CONSENSUS` 子系统，升级为先出后进两阶段同向归并（`consolidation.ts`、`共振(N)` 手册），补全离线幂等键与跌停配对撤单，新增 forward-only `038_drop_signal_confidence_columns.sql` 与编译边界严格 Fail-Closed 校验
  - **两层单向架构与完整交易引擎最终定稿（2026-11-26 归档 `add-virtual-trading-layer`）**：取消“聚合层 → 交易层”独立分段，全系统收口为 **「信号层 → 完整交易引擎（含聚合、裁决、整数厘账本、撮合与交易手册正式指令输出）」**；正式作废原 Task 10.1 双账本反向注入，确立「策略/插件私有虚拟账本仅用于产出信号；真实账本平仓在交易引擎内部闭环，严禁反向发信号或注入状态到信号层」铁律
  - **出场插件同构化与决策树收敛（2026-11-26 归档 `isomorphic-decision-flow-exit-engine`）**：14/14 任务完成，`category: 'EXIT'` 插件与外部加载器、决策树 `SELL` 分流与归因透传全部落地
  - **时序管道与客户端生命周期对账作废归档（2026-11-26 归档 `obsolete-unify-quant-pipeline-architecture` 与 `obsolete-lifecycle-driven-kline-reconciliation`）**：管道抽象由 `runTradingPipeline` 门面与 `TradingEngine` 彻底取代；数据同步由 `mist-market-data-sync` 技能自动化稳定承接，存量 active change 全部清零
  - **战术事件层退役（2026-11-24）**：`TacticalEventAggregator`（EdgeDetector / TemporalWindowEngine / CooldownTracker）整体删除，`tactical-event-pipeline` 冻结为退役记录；`role: 'context'` 插件纪律落地
  - **历史订单簿提案作废归档（2026-11-26 归档 `obsolete-add-orderbook-execution-pipeline`）**：不再实施独立订单簿撮合与 `apps/execution`，由完整交易引擎取代
  - **PA 纯数学核心与视觉适配器落地（2026-11-25）**：`@app/pacore`（FVG / WickGap / PinBar / Sweep / GapProjection / Neckline）+ `PaVisualAdapter` + `toPaKSeries` 纯边界映射落地
  - **通用虚拟出场与 5m 监护周期传播（2026-11-25 ~ 11-26）**：硬止损从交易引擎退役回归信号层 `PriceDefenseExitPlugin` / `PriceLevelExitPolicy`，内核支持 `surveillancePeriods` 轻量监护周期与同 Bar 先出后进

---

## 1. 活跃 / 待执行 Change

当前无进行中的活跃 Change（0 个）。Mist 平台全系统 OpenSpec 演进闭环已全面达成。

---

## 2. 近期归档（2026-10-16 ~ 2026-11-26）

| 日期 | Change | 内容与状态 |
|---|---|---|
| **11-26** | `2026-11-26-obsolete-unify-quant-pipeline-architecture` | **已作废归档**（2026-11-26 作废归档）：原定 `QuantPipeline` 与回测执行器抽象已被今日落地的两层单向架构 `runTradingPipeline` 门面与 `TradingEngine` 完整交易引擎彻底取代；`apps/backtest` 生产栈已退役，故不再实施 |
| **11-26** | `2026-11-26-obsolete-lifecycle-driven-kline-reconciliation` | **已作废归档**（2026-11-26 作废归档）：收盘数据同步由 `mist-market-data-sync` 技能自动化稳定承接，盘中由实时行情封存守门，无需在边缘 Windows Python 桥引入脆弱的反向对账与 Migration 034 审计表 |
| **11-26** | `2026-11-26-consolidate-same-direction-signals-and-remove-confidence` | **已完成归档**（29/29 全部完成；Live Spec 同步合并至 `trading-engine`、`decision-flow-engine`、`factor-plugin-contract`、`chan-fibonacci-overlay`、`backtest-trade-decision`）：解决 Task 10.2，两阶段同向归并取代 `sellFirstByConfidence`、全链路物理移除 `confidence`/`minConfidence`/`CONSENSUS`（含 `038_drop_signal_confidence_columns.sql`）、编译边界严格 Fail-Closed、离线幂等键与跌停配对撤单加固 |
| **11-26** | `2026-11-26-add-virtual-trading-layer` | **已完成归档**（Groups 1–9 全部完成，Task 10.1 架构评审驳回永久作废；Live Spec 沉淀至 `openspec/specs/trading-engine/spec.md`）：完整交易引擎落地（`groupSignals` 聚合 + `TradingEngine` 规则管线 + 整数厘 `virtual_fill_events` migration 037 + `SimulatedBroker` 厘算术移植 + `buildTradingManual` 交易手册 + `runTradingPipeline` 门面 + 四端同构门禁），退役 `ExecutionRiskArbiter` / `PositionStateMachine.onSignal` / 信号列表渲染 |
| **11-26** | `2026-11-26-isomorphic-decision-flow-exit-engine` | **已完成归档**（14/14 完成；Live Spec 同步至 `openspec/specs/decision-flow-engine/spec.md`）：出场插件 `category: 'EXIT'` 同构契约、外部加载器平权注册、决策流 `BranchNode` / `TerminalNode(SELL)` 归因透传与虚拟持仓纯化 |
| **11-26** | `2026-11-26-obsolete-add-orderbook-execution-pipeline` | **已作废归档**（2026-11-23 作废，2026-11-26 归档）：原独立订单簿撮合、多组子账本与 `apps/execution` 进程方案不再实施，由 `trading-engine` 完整交易引擎取代 |
| **11-14** | `2026-10-*`（13 个历史变更批量归档） | 涵盖 `upgrade-backtest-decision-and-parity-engine`、`introduce-canonical-market-series`、`support-multi-period-evaluation`、`add-backtest-intraday-execution`、`add-vendor-market-data-import`、`implement-cys13-market-breadth-and-panic-gauge`、`integrate-native-terminal-visualization`、`capture-realtime-provider-anomalies` 等历史阶段收口 |

---

## 3. 跨环境与生产部署验收（HIL / Ops 待办）

以下属于代码与单测已完成，但依赖 **Windows 宿主机 + 生产 MySQL / 真实行情终端** 的上线与实盘验收项：

1. **生产库 Migration 037 / 038 与虚拟账本配置上线**：在生产 MySQL 按序执行 `037_create_virtual_fill_events.sql` 与 `038_drop_signal_confidence_columns.sql`（含停用库内含 `minConfidence` / `CONSENSUS` 的旧 `decision_flow` 定义），并在 `notification` 容器配置 `NOTIFICATION_VIRTUAL_SEED_CAPITAL`（默认 `1000000`），验证实时交易手册投递与 `virtual_fill_events` 幂等落库。
2. **实时策略实盘观察与切 On 决策**：`REALTIME_PRODUCTIZATION_MODE=shadow` 实盘运行观察，评估切换为 `on`。
3. **实时订阅断流恢复实盘演练**：真实 TDX/QMT 进程重启后断流检测与告警阈值实盘校准。

---

## 4. 明确作废与已清理项

- `unify-quant-pipeline-architecture`（统一量化时序管道抽象）：**2026-11-26 确认作废归档**，由完整交易引擎（`TradingEngine`）与 `runTradingPipeline` 彻底取代。
- `lifecycle-driven-kline-reconciliation`（客户端生命周期对账）：**2026-11-26 确认作废归档**，由自动化收盘同步技能（`mist-market-data-sync`）与实时封存流取代。
- `add-virtual-trading-layer` **Task 10.1**（`virtual_fill_events` 反向注入 `VirtualExitPolicyPort`）：**2026-11-26 架构评审正式驳回并永久作废**——信号层策略私有虚拟账本仅用于产出信号，真实账本平仓在交易引擎内部闭环，严禁反向注入或反向发信号。
- `add-orderbook-execution-pipeline`（订单簿撮合与独立执行进程）：**2026-11-23 作废，2026-11-26 归档**。
- `tactical-event-pipeline`（`TacticalEventAggregator` 边沿/窗口/冷却中间层）：**2026-11-24 整体删除并冻结退役**。
- `ExecutionRiskArbiter` 与 `PositionStateMachine.onSignal` / 旧 `ExitPolicyPort`：**2026-11-25 彻底退役删除**。
- `feat/strategy-portfolio-backtesting`（历史多策略组合回测分支）：已废弃。
- `migrate-stack-to-linux-node-with-ssh-tunnel`（Linux 迁移）：已放弃并删除。
