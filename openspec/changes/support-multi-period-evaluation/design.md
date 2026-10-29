# Design: Support Multi-Period Strategy Evaluation

## 1. 架构全景

```
plan: { evaluationPeriod: 30, contextRequirements: { 5: 120, 1440: 10 } }   ← 编译边界由插件元数据推导

                ┌─ 回测/推演：MultiSeriesHistoricalBarSource
                │   （每周期独立 canonical loadReplayWindow/readReplayPage，k 路时间戳归并）
StrategyEvaluationKernel ─┤
（每周期一个窗口）        └─ 实时：RealtimeKernelPool（(securityId, source) 组，组内多周期窗口；
                             09:20 盘前预热 / 懒加载兜底；历史 canonical + 当日触发源）
                    │ push 按 bar.period 入窗；同刻低周期先推、高周期后推
                    ▼
        只在 bar.period == plan.evaluationPeriod 且上下文齐备时求值
                    ▼
  FactorContext.attributes['series.<period>'] = 只读窗口快照（<= 当前时间戳）
```

三链路差异仍只在输入/输出适配：求值核心、相位判定、发射语义不变。

## 2. 内核多周期（`libs/strategy`）

### 2.1 类型

```ts
// kernel.types.ts
interface KernelPlan {
  definitionId: number;
  versionId: number;
  flow: DecisionFlowNode;
  signalKind?: 'entry' | 'exit';
  ruleSnapshot: Readonly<Record<string, unknown>>;
  /** 求值周期：该 plan 只在此周期的 bar 收盘时求值（沿用现有 period 字段语义） */
  readonly period: number;
  /** 求值周期窗口预算（沿用现有 requiredBarCount） */
  readonly requiredBarCount: number;
  /** context 周期 → 最少 bar 数；编译边界由插件元数据推导，不含求值周期 */
  readonly contextRequirements: Readonly<Record<number, number>>;
}

interface KernelConfig {
  securityId: number;
  securityCode: string;
  publicFrom: Date;
  plans: readonly KernelPlan[];
  registry?: FactorPluginRegistry;
  // 删除单值 period —— 组内周期集合 = ∪ plans(period ∪ contextRequirements keys)
}
```

- 每周期一个独立 `StrategySeriesImputer`，窗口预算 = 该周期上所有 plan 需求的最大值；
- per-period 单调游标（重复/乱序 per period 静默忽略）；跨周期乱序由数据源保证。

### 2.2 相位与预热

- 相位仍由时间轴判定：`timestamp < publicFrom` 预热相，`>= publicFrom` 公开相；
- **预热按周期分别推进**：每个周期的预热段整段 push（全部落预热相），
  `preWarmActual[period]` 独立计数；
- **每个求值周期的首个公开 bar** 到达时，对该周期做一次静默预热求值
  （沿用"插件游标推进、不发射"语义），随后进入公开相；
- `prewarmStatus` 聚合取最差：任一周期 `empty` → `empty`；否则任一 `partial` →
  `partial`；全 `full` → `full`。回测 `prewarm_min_actual/expected` 继续记录
  求值周期，多周期明细进 `context_snapshot` 诊断（不加列）。

### 2.3 求值与黑板注入

```
push(bar of period P):
  window[P].append(bar); trim(P)
  if bar.timestamp < publicFrom: return []                       // 预热相
  if first public bar of P: silentEvaluate(P at lastPrewarmTs[P])
  if window[P].length < budget[P]: return []                     // insufficient_history
  for plan where plan.period == P:
     if ∃q ∈ contextRequirements: window[q].length < required[q]:
         skip plan; diagnostics.planSkips += 1; continue          // fail-closed
     evaluate(plan.flow, context)
```

`buildContext(timestamp)` 在求值前向黑板写入：

- `series.<period>` → 该周期窗口的**只读快照**（frozen 数组，只含
  `<= timestamp` 的 bar）；
- 键名收口在公共常量 `SERIES_ATTRIBUTE_PREFIX = 'series.'`，配套只读访问器
  `readContextSeries(attributes, period)`；公共仓不写任何私有键名。

**缺上下文必须显式失败**：插件读到未声明的 `series.*` 键时抛
`MissingContextSeriesError`（有界错误类型）；内核按 plan 捕获 → 该 plan 本次
不判定并记有界诊断，绝不把错误转成 NEUTRAL 或让整组崩溃。

## 3. context 需求推导（编译边界）

延续"策略定义不存调用方 lookback"（`strategy-definition-registry`）：

```ts
// factor.types.ts（FactorPluginMetadata 可选扩展）
resolveContextRequirements?(
  params?: Record<string, unknown>,
): Readonly<Record<number, number>>;   // { 5: 120, 1440: 10 }
```

- `compileStoredDefinitionVersion` 遍历决策流树全部插件节点（GUARD / EXTRACTOR /
  CONSENSUS），从插件注册表取元数据并调用 `resolveContextRequirements(params)`，
  按 period 取 max 合并为 plan 的 `contextRequirements`；
- 插件不在注册表 → 编译失败（fail-closed）；声明值必须为正安全整数；
- `decision_flow` / `rule_dsl` / `chan_bsp` 三种来源统一走此推导；
  无 context 插件的 plan 语义与现状完全一致；
- rule JSON、DTO、数据库 schema 零改动。

外部插件适配：下游因子插件声明各自多周期需求
（如 `{5: 120, 1440: 10}`），改读 `series.<period>`，特定衍生指标由插件从相应周期序列自算。

## 4. 多序列合并推流（回测/推演）

- `HistoricalBarSource` → 多序列：周期集合 = 求值周期 ∪ context 周期；
  每周期独立 `loadReplayWindow`（预热）+ `readReplayPage` 页序（公开区间）；
- 归并器（纯函数）：k 路按 timestamp 升序输出；**同一时间戳低周期在前**
  （5m → 30m → 1440）。由此保证：
  - 30m 求值（如 10:00）时 5m 上下文已含 10:00 收盘那根；
  - 30m 求值看不到当天日线（日线 15:00 最后闭合）——无未来函数；
- `onBar` / `onSignal` 仅对**求值周期** bar 触发：context bar 只进窗口，
  不得驱动 broker / 持仓状态机 / NAV 日结（否则同一天会被多周期重复日结）；
- 预算：`BACKTEST_MAX_BARS_PER_RUN` 覆盖全部推送 bar（含 context bar）——
  多周期会加速消耗预算，属预期行为，不另设周期配额。

## 5. 实时多周期与 R2（`libs/signal` + `apps/signal`）

### 5.1 分组与求值分派

- `RealtimeKernelPool` 组键 `(securityId, source)`；组内核持有全部声明周期窗口；
- `RealtimeStrategyEvaluationService.evaluate(bar, plans)` 不再按
  `bar.period` 预过滤 plan（现状会直接丢掉 context bar，内核窗口永远等不来）：
  全部 bar 进池，内核按 plan 求值周期分派；候选的 `period` = plan 求值周期；
- `RealtimePeriodBuilder.accept` 的周期集合 = 求值周期 ∪ context 周期（含 1440）；
- `retainGroups` / 诊断 / 内存释放按 `(securityId, source)` 组与 per-period 窗口对齐。

### 5.2 R2 数据接缝

- `loadRealtimeWindow`：`timestamp < 当日 dayStart` 的历史段走 **canonical**
  （与回测同一 `marketDataPolicy`，公共仓只认 resolver）；当日段只来自
  **触发源**（Redis 封存 1m + 派生）。一天内不换源；
- `StrategyDefinition.sources` 仍只约束触发源资格（allowed-source set 语义不变）；
- 接缝差（canonical 历史 vs 当日触发源，≤0.01）用户已确认接受，不做额外对齐；
- 量化已证：QMT 原生 30m 与同刻 5m 收盘 2,476 对全等；日线与当日最后 5m
  差异 ≤0.01（唯一例外 399006 熔断日 0.03）。

### 5.3 时间标签体系（实测定案）

四条实测事实（2026-10-25 生产库，000001/QMT）：

1. **1m 历史就是左标**：241 根/天，`09:30..11:30 + 13:00..15:00`，含 11:30 与 15:00
   终端根——与 mist producer 的左标 242 桶宇宙同构。**1m 实时/历史天然同标签，
   无接缝**；"左标解决 11:30/15:00 晚到数据"的决策已被历史数据内化，B 不动 1m 层。
2. **5m/30m/60m 历史是右标**：48/8/4 根每天，`09:35`/`10:00` 起。
3. **1440 历史标签是 00:00(D)**（交易日零点身份），不是 15:00。
4. **session 末根聚合含终端打印**：QMT 5m 15:00 根 = 连续段 964.8M + 240.6M 竞价
   （1m 15:00 根 523.4M，两套聚合归属不同、日合计三方精确相等）；且 1m 与 5m 在
   窗口级本就互有出入（13:45 +180.5M / 13:50 −165.5M 等），volume 不可能逐窗对齐。

因此：

- **派生 5/15/30/60m `timestamp = slotStart + period`**（右标）；预热/水位过滤改为
  "slot 边界 <= anchorAt 才进入窗口"（进行中 slot 不注入，修复现状违反 live spec
  的缺陷）；
- **1m 封存 bar 维持左标**（与 producer、1m 历史三方一致）；
- **终端桶吸收**：现状 `slotOffset = floor(120/30)*30 = 120` 把 11:30/15:00 终端桶
  放进永不闭合的孤儿 slot——**晚到打印/竞价从未进入任何派生 bar**。修法：每个
  session 的最后一窗吸收终端桶作为**可选成分**（sealed 则并入 OHLCV，discarded
  不造数），窗口在终端桶触发时闭合；完整性只按常规成分根数判（终端桶缺席不标
  incomplete，否则与历史 complete 类型冲突、破坏三链路同构）。

### 5.4 1440 日线派生

- `REALTIME_STRATEGY_PERIODS` 扩展 `[1, 5, 15, 30, 60, 1440]`；
- 日线由当日 1m 桶聚合：期望 242 桶（`[09:30,11:31) ∪ [13:00,15:01)`）；
- **闭合时点**：15:00 会话终端桶封存（sealed 或 discarded）触发日结 bar；
  全部桶在 → `complete`；缺桶 → `incomplete`（同一 canonical 语义）；
- **时间戳 = 当日 00:00**（canonical 日线身份），与回测日线 bar 同一身份；
  日线 plan 的 `signalTime = 00:00(D)`——回测/实时同构（求值均发生在该 bar 闭合后）；
  **语义注记（用户确认项）**：00:00(D) 必须在文档/接口元数据/推送展示中表述为
  "交易日 D 的已完成日 K"（成分 = D 当日 242 桶、含 D 收盘竞价），严禁被读作
  "00:00 时刻形成的数据"或"当天尚未走完的 bar"——展示层按交易日日期表述；
- 09:20 预热与盘中重启的 hydration 不得注入未闭合的当日日线（可用键 15:01 >
  anchor 自然排除）。

### 5.5 可用时刻排序键（availability key）

混标签并流下裸时间戳排序/过滤有两处未来函数：

1. 5m 09:35 求值（覆盖 09:30–09:35）若按裸标签 `<=` 过滤 1m 上下文，会把 1m 09:35
   根（内容 = [09:35,09:36) 的**未来分钟**）放进快照；
2. canonical 日线 00:00(D) 排在 D 日所有分钟 bar 之前——30m 09:30 求值会看到当日
   日线（含当日收盘价），**回测自身就有未来函数**。

修法：定义 `orderKey(bar) = 内容封存时刻`：

| 周期 | orderKey |
|---|---|
| 1m | `label + 1min`（桶封存时刻） |
| 5/15/30/60m 常规窗 | `label`（右标 = 窗口事件末） |
| 5/15/30/60m session 末根（11:30/15:00） | `label + 1min`（随终端桶封存） |
| 1440 | `15:01(D)`（末成分 = 15:00 终端桶） |

- 回测归并按 `(orderKey, period)` 升序——**恰好等于实时触发到达序**（触发 T 携带
  1m-T 与以 T 桶为末成分的派生 bar，组内 1m → 5m → 30m → 60m → 日线）；
- 内核上下文快照 = 窗口已 push 内容（push 序即因果序），**不再用裸时间戳过滤**；
- 预热段选择/水位过滤全部按 orderKey 对边界比较（canonical 日线 00:00 标签按
  15:01 参与"是否 < publicFrom"判定，堵住盘中 startDate 的日线泄漏）；
- pool/内核的组级 `lastPushed` 守卫撤销，改为 per-period 游标（同刻多周期 bar
  不再被误丢）；
- **作用域边界（用户确认项）**：orderKey 只作用于数据可用性——归并顺序、窗口保留、
  上下文快照；**严禁触碰信号发射侧**（不过滤、不延迟、不抑制、不重排），发射语义与
  单周期内核完全一致；信号侧因果（t 决策、t+1 撮合）归执行引擎层
  （`upgrade-backtest-decision-and-parity-engine`）负责，两层不得互相越界。

## 6. 盘前多周期预热（承接原 change）

- `CRON_PRE_MARKET_STRATEGY_WARMUP_0920 = '0 20 9 * * 1-5'`（`@app/timezone`）；
- `apps/signal` 编排：交易日 09:20 取活跃组 → 每组按**周期集合**预热：
  canonical 历史（`anchorAt = 09:20`）+ 当日已封存段（此时恒空）；
- **Polars 向量化质检**（`validateBarSeriesWithPolars`，逐周期）：
  时间戳严格递增 / 价格非负 / `high >= low` / OHLC 无 NaN·Null；失败原因有界
  （`insufficient_bars` / `timestamp_reversed` / `invalid_price` /
  `price_boundary_violation` / `contains_null_or_nan` / `query_failed`）；
- 预构建组内核（`publicFrom = anchorAt`），历史段预热相静默 push；
  幂等：plan 签名与容量一致 → skipped；
- **跨日守卫**：交易日翻转时 `cursors` / `periodBuilder` 照常清空，
  组内核仅在不同交易日时清空——当日已预热组保留，首根封存 bar 零历史 I/O；
- **兜底**：预热失败标的开盘首根走既有懒加载路径；单标的失败隔离不抛出；
  `SignalHealthVo.preMarketWarmup`（state/warmedAt/anchorTradingDay/
  success/skip/fail/lastFailureCode）；
- 预热与回测读同一份 canonical：09:20 预热的历史 === 回测
  `loadReplayWindow` 同段——三链路同构在数据层也成立。

## 7. 门禁与验收

- 三链路同构门禁新增用例：同一多周期 plan，回测 replay / 会话驱动 / 实时
  （09:20 预热 + 封存 1m 回放）增量信号逐条一致；
- 双时间戳门禁沿用：多周期下 `signalTime` 仍 = 求值 bar 时间戳；
- 新增 fail-closed 用例：声明 context 不足 → plan 不判定；未声明 series 键 →
  显式失败（严禁 NEUTRAL）；
- 归并器纯函数用例：同刻低周期先推、跨段跨周期页边界、缺口、limit 截断；
- 右标对齐用例：canonical 历史 30m（右标）与实时派生 30m（右标）时间戳同构；
- 端到端验收：000001 30m + 5m/1d 上下文，2005-01-04→2026-10-20 canonical 回测，
  战术插件 `evidence.degraded` 不再为 true。

## 8. 开放点（实施前需用户确认）

1. **日线求值时点**：15:00 闭合当即评估（`signalTime = 15:00`）——本 spec 按
   此设计（三链路同构要求回测/实时一致），如需次日开盘评估需重开讨论；
2. **战术插件 context 参数值**（120 根 5m、10 根日线等）由用户在私有仓定，
   公共仓只承接推导机制。
