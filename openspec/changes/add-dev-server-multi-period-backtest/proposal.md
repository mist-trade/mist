# Proposal: Dev Server 多周期回测能力（上证指数 30m 入场 + 日线 context 长历史评测）

## Why

上一轮上证指数夏普率评测（`evaluate-private-tactical-strategies`，已完成）基于
**单周期日线**（`000001_1d.json`），dev server 回测路径 `runUnifiedSimulationBacktest`
只加载单周期 K 线、内核 plan 固定 `contextRequirements: {}`（server.ts:830）。

`support-multi-period-evaluation` 已交付多周期统一内核（求值周期 + context 周期、
`HistoricalBarSource` k 路归并、fail-closed 上下文契约），生产回测 run 48 已实证
**000001 30m 求值 + 5m/1440 context，canonical 序列 2005-01-04 → 2026-10-20** 可行。

用户已拍板：**更新版评测报告必须走 dev server（本地数据）**，后续调试都在本地。
当前 dev server 无法承载该评测，缺口两个：

1. **回测路径单周期**：不会喂 context 周期 bar，多级别战术插件永远 degraded/静默；
2. **本地数据缺口**：`tools/strategy-dev/data/kline/000001_30m.json` 仅 2025-07 起
   （QMT），2005→今的 30m/5m 长历史（vendor_a 161,979 / 971,849 行）未同步；且
   `sync.ts` 未消费 `k_quality` 质量掩码（000001 2011-07-27 前量额废数据会以裸值
   进入量能类因子）。

## What Changes

1. **dev server 回测多周期化（复用生产内核，严禁手写归并）**：
   - `runUnifiedSimulationBacktest` 改为经 `HistoricalBarSource.drive()` 推进：
     内存版 `StrategyReplayMarketDataPort`（本地 JSON kline 文件 → per-period 流）
     + k 路归并 `(availabilityKey, period)` 升序——与生产回测/实时同一条排序契约；
   - context bar 只进窗口，**绝不驱动 broker/持仓/NAV 日结**；onBar/onSignal 仅
     求值周期触发；
   - **存量定义本地重放**：`strategyDefinitionId` 支持从本地
     `mist/.data/strategy-definitions/`（gitignored）读取生产导出的定义版本 JSON，
     经编译边界唯一入口 `compileStoredStrategyDefinition` 编译为
     flow + contextRequirements——与生产回测同一条编译路径，评测/对账零手工抄参；
   - plan 的 `contextRequirements` 由因子插件元数据推导（复用编译边界唯一实现
     `deriveContextRequirements`，导出复用，不复制）；调用方**不可**传 lookback；
   - fail-closed：context 周期本地数据文件缺失 → 有界错误 + `dev:sync` 提示，
     严禁空窗兜底静默求值。
2. **本地同步工具保真（`tools/strategy-dev/sync.ts`）**：
   - SQL 关联 `k_quality`，按六个掩码将无效字段置 `null`（volume/amount 可空，
     透传给 `StrategyBar`，由因子插件按既有 null 契约降级/拒判）；
   - 每行落盘真实 `source`（vendor_a/qmt 分段），dev 回放透传进 `StrategyBar.source`
     （信号审计与生产对齐）；
   - 大序列写盘改紧凑 JSON（971k 行 pretty-print 不可接受）；SSH 拉取分段化，
     消除 `maxBuffer` 100MB 溢出；
   - 新增 `--definition <id>` 模式：导出生产存量策略定义版本（`strategy_definitions`
     + `strategy_versions.rule`）至 gitignored 本地目录，供 dev server verbatim 重放
     （文件含私有插件参数，仅存本地）。
3. **门禁延伸**：`dev-server-boundary.guard.spec.ts` 新增静态断言——dev server
   严禁自写跨周期归并/预热循环，必须复用 `HistoricalBarSource`（含
   `mergeByAvailability`）。
4. **评测执行（操作，非代码）**：`pnpm dev:sync --code 000001 --periods 1d,30m,5m`
   全量同步后，经 `POST /v1/strategy-backtests` 重跑评测矩阵（30m 求值 + 插件推导
   context），2005-01-04 起，输出更新版夏普率对比报告（贴对话界面）。
   **同构对账验收**：与生产 run 48 同形态策略（2008-03-03 / 2012-06-14 两条段级
   三卖）在 dev 链路复现一致，证明本地 lane 与 canonical 生产 lane 等价。

## Capabilities

### Modified Capabilities

- `dev-backtest-api`：回测 API 语义扩展为多周期（求值 + context）推流；新增
  context 推导、归并同构、本地数据保真需求。
  **前置**：先归档已全部完成的 `evaluate-private-tactical-strategies`（其 delta
  是 `dev-backtest-api` 的唯一来源，归档后本 change 的 MODIFIED 才有 live 锚点）。

## Impact

- `libs/strategy`：导出 `deriveContextRequirements`（纯函数，单测随迁）；无行为变更。
- `tools/strategy-dev`：`server.ts`（回测路径多周期化）、新增内存 replay port、
  `sync.ts`（k_quality/source/紧凑 JSON/分段拉取）、boundary guard 扩展。
- 数据文件（本地，不入库不提交）：`data/kline/000001_{1d,30m,5m}.json` 全量重同步。

## Non-Goals

- 不改生产回测运行时（apps/backtest）与实时链路；
- 不在 dev server 新增 WFA 端点（生产套件已有；本次报告不用 WFA）；
- 不改 `FactorContext` / 数据库 schema / API 破坏性变更（`POST /v1/strategy-backtests`
  请求体向后兼容，context 一律由插件推导）；
- 不做跨源合并新语义（拼接已在 SplicePolicy/canonical 层完成，本地 JSON 是其快照）；
- 不在公仓披露任何私有插件算法与参数（沿用保密契约）。
