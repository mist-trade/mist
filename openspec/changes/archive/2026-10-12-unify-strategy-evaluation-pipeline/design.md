# Design: 统一策略求值管线

## 1. 收敛点选择：编译边界（Compile Boundary）

**决策**：收敛发生在"存储定义 → 运行时求值计划"的编译边界，而非求值执行层。

- `apps/signal` `signal-registry.service.ts` 的 `compileRegistryDefinition`（:289-357）与
  `apps/backtest` `backtest-run-command.service.ts` 的 kind 分派（:100-131）统一改走共享编译
  helper：`rule_dsl` → `LegacyStrategyCompiler.compileRuleToDecisionFlow`，
  `chan_bsp` → `compileChanBspToDecisionFlow`，产出统一的 decision_flow 求值计划。
- 编译 helper 从 `libs/strategy` 导出（两处编译边界共用，杜绝编译语义漂移）。
- 运行时求值计划类型收敛：`RealtimeStrategyExecutionPlan`（libs/signal）与 backtest 侧
  plan union 缩减为单一 `decision_flow` 形态；`StrategyKind` 枚举值保留（DB 历史数据），
  仅编译边界与校验层使用。其中 `StrategyKind.CHAN_BSP` 枚举成员必须加 `@deprecated`
  JSDoc 注释（说明：独立执行分支已退役，存量配置经 LegacyStrategyCompiler 透明编译为
  决策流树，新建 chan_bsp 定义被拒绝，枚举值仅为 DB 历史数据保留）。
- `evaluateStrategyPlan`（DSL 求值器）与 `ChanBspDetector`/`ChanBspEpisodeCursor` 本体保留在
  `libs/strategy` / `libs/signal`——它们被 `LegacyStrategyCompiler` 编译出的
  `plugin.legacy.rule-dsl` / `plugin.chan.bsp` 因子插件复用，只是不再作为独立执行分支存在。

**Why 编译边界**：存量配置零迁移（用户拍板"透明编译"路线，见
`add-factor-plugin-decision-flow-architecture` 归档）；求值执行层单通路让同构门禁可静态扫描。

## 2. 统一内核与双 BarSource 适配器（用户拍板 Option A：一口气完成）

### 2.1 内核：StrategySimulationEngine 批处理形态 → 纯 push 核心

- 现构造器收 `allBars` 全量数组并逐帧物化缓存——实时链路给不了 allBars，回测大区间×
  大股票池内存不可控，批处理契约全部废除（应删尽删）。
- 新内核契约：`push(bar) → 当期增量信号`。相位由时间轴判定：`timestamp < publicFrom` =
  预热相（静默求值、插件游标推进、不发射）；`>= publicFrom` = 公开相（发射）。
- **发射去重整体删除（用户拍板 2026-09-27）**：`RealtimeEpisodeStore` 及其全部调用点
  （evaluation service 的 decide/activate、candle-finalized processor 落盘后激活）全删，
  不做内核收编。理由：现存去重语义存疑，且投递级抑制（去重/汇总/分级）本就归属未来独立
  "计算引擎"，不应混在求值层。删除后：chan bsp 信号去重由 `ChanBspFactorPlugin` 单调游标
  在插件内承担；DSL GUARD 连续 matched 的逐 Bar 原始发射属求值原始输出，实时与回测行为
  天然一致（parity 反而更简单）；实时侧 DSL 策略可能出现连续 Bar 信号，投递抑制留给
  计算引擎专项。
- 统一信号形状：五字段双时间戳契约（signalTime/triggerTime/pivotTime/triggerPrice/
  pivotPrice）+ signalType + decisionTrace；输出适配器各自映射。
- 逐帧物化缓存下沉 dev-server 会话层（stepPrev/seek 交互需求），内核不缓存帧。

### 2.2 两个 BarSource 适配器（push 模式，来源不同、协议相同）

- `HistoricalBarSource`（回测 + 推演）：开批先查 `timestamp < publicFrom` 的最近
  `requiredBarCount` 根（`loadReplayWindow` 现成语义）作为预热段 push，随后按页流式
  push 回放区间。
- `RealtimeSealedBarSource`（实时）：封存 candle 触发 → push；窗口缺失 → hydration
  拉取历史段作为预热段 push。
- **SharedStrategyWindowStore 吸收**（Option A）：每 `(securityId, source, period)` 组一个
  内核实例，组内全部 plans 共享同一窗口（与现 store 分组语义 1:1 映射）；盘前 09:20
  hydration、startup compensation、retain scope 清理改挂实例池管理层。

### 2.3 预热统一规则（"历史 K 线难预热"的平衡方案）

- 预热不是回测专属准备动作，而是 push 流里 `publicFrom` 之前的普通 bar 段；供给责任在
  数据源适配器，引擎不感知数据来源。
- 预热段拉不满（TDX 1m 稀疏 / 次新股上市晚 / 数据源起点=回测起点）→ **不报错、不造假
  数据**：`prewarmStatus: full | partial{actual,expected} | empty` 记入 run/会话元数据；
  窗口 < requiredBarCount 期间不判定不发射（现有 `insufficient_history` 语义，三链路统一）。
- 对称性论证：实时盘中新注册策略的冷启动 = 回测预热踩空，是同一个 situation、同一条
  降级路径；历史数据齐时两条链路都是满预热直判。无任何 lane 特判。

### 2.4 输出适配（三链路差异仅在此）

- 实时 → `LiveStrategyPersistenceService` 告警落盘 + 交付队列
- 回测 → `backtest_signal_results` 批量落盘（signalTime=确认 Bar、pivotTime=evidence 提取）
- 推演 → dev-server SSE frame
- 不做回测 SSE（用户拍板）；查看历史回测纯读 DB 不重算。

## 3. 双时间戳落盘契约

- `signalTime`（`signal_time` 列）：保持 trigger 语义 = 确认 Bar `timestamp`。chan_bsp 独立
  分支删除后，`:418` 的 `event.time` 误填随之消失；decision_flow 路径本就正确。
- `pivotTime`（新增 `pivot_time` 列，nullable）：从 `DecisionResult.trace` 触发链
  evidence（`ChanBspFactorPlugin` 发射的 `evidence.pivotTime` / `pivotPrice`，见
  `chan-bsp.plugin.ts:280-281`）提取；无 pivot 语义的信号（如纯 DSL 门禁）为 NULL。
- `strategy_signal`（实时）同步加 `pivot_time` 列（用户拍板"要补充"），提取路径相同。
- 提取 helper 放 `libs/strategy`（decision-flow 域），实时与回测共用，避免两处解析 trace。
- API DTO：backtest signals 查询与实时 signal 查询响应透传 `pivotTime`。mist-fe
  `backtest-signal-visual.util.ts` 已优先消费 `pivotTime`，前端零改动。

## 4. Migration 026（forward-only）

1. `ALTER TABLE backtest_signal_results ADD COLUMN pivot_time DATETIME NULL`
2. `ALTER TABLE strategy_signals ADD COLUMN pivot_time DATETIME NULL`
3. 存量回填：`UPDATE ... SET pivot_time = signal_time`（两表全量）——旧记录统一按
   pivot=signal 回填，前端回退逻辑下 Marker 位置与现状完全等价；新写入按真实 pivot 语义。
4. 存量 chan_bsp 停用：`UPDATE strategy_definitions SET status='disabled' WHERE kind='chan_bsp'`
   （`StrategyStatus.DISABLED`，可审计、不删数据）。
5. 编号占位：当前已到 025，本 change 取 026（`upgrade-backtest-decision-and-parity-engine`
   内过期的 "Migration 022" 编号作废，其落地时顺延）。

## 5. 三链路同构门禁（Guard）

新增 `libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts`，组合两种手法
（参照现有三个 guard）：

1. **静态源码扫描**（readdirSync + 正则禁模式，白名单驱动）：
   - `apps/signal`、`apps/backtest`、`apps/mist` 禁止 import `ChanBspDetector`、
     `ChanBspEpisodeCursor`、`evaluateStrategyPlan`（白名单：`libs/signal/src/runtime/chan-bsp/`
     实现库自身、`libs/strategy` 因子插件与编译器）；
   - 求值执行层禁止 `kind === 'chan_bsp'` / `kind === 'rule_dsl'` 运行时分派分支
     （允许出现在编译边界、枚举定义、migration）。
2. **运行时对账断言**：同一 Bar 序列分别经 HistoricalBarSource→内核、
   RealtimeSealedBarSource→内核（fake port）与 dev-server 会话驱动三路，断言增量信号
   逐条一致（signalTime/pivotTime/signalType/triggerPrice）。防三处驱动装配漂移。

## 6. 语义等价性与风险

> **signalTime 语义修正注释（2026-09-27 用户确认）**：旧 chan_bsp 独立分支（实时
> `evaluateChanBsp` 与回测回放分支）把买卖点事件的**形态端点时刻**（`event.time`，即
> 笔/段端点分型极值的发生时刻）直接当作 `signalTime` 落盘/发射——这相当于在极值发生
> 当刻就"知道"了买卖点成立，而实际上该形态要等到后续确认 Bar 闭合才成立，属于未来函数
> 倾向，也违反 `strategy-dual-timestamp.guard.spec.ts` 锁定的双时间戳契约
> （signalTime/triggerTime 必须等于当前确认 Bar timestamp）。本次收敛后：
> `signalTime` = 确认 Bar 时刻（决策/撮合/游标唯一认可的时刻），形态端点时刻移入
> `pivotTime`（仅图表 Marker 几何定位）。影响面：信号在时间轴上的排序、去重与
> 逐 Bar 对账基准后移到确认时刻；前端 Marker 因 pivotTime 透传 + 回退逻辑，几何位置不变。

- **chan_bsp 语义**：独立分支（detector+游标，`signalTime=event.time`）→ 树内
  `ChanBspFactorPlugin`（单调游标 + 当根确认门禁 + 双时间戳）。这是用户拍板的契约修正：
  决策时刻改为确认 Bar 时间戳，形态端点时刻移入 `pivotTime`。行为差异点在信号排序/去重
  时间轴，属修正而非回归。
- **rule_dsl 语义**：`compileRuleToDecisionFlow` 编译为单 GUARD 树，插件内复用同一 DSL
  求值器，字段/算子语义不变；episode 去重删除后，实时与回测对连续 matched 条件均逐 Bar
  原始发射（行为一致），投递级抑制归未来计算引擎专项。
- **透明编译零迁移**：存量定义不动配置，只停用 chan_bsp kind。
- **回测结果可复现性**：内核切换后同参数回测结果与旧版存在预期差异（chan_bsp 路径
  signalTime 修正 + 门禁增强），历史 run 不重放，查看走纯读 DB。

## 6.5 测试策略（三层，parity 为核心）

统一 push 协议使三链路可测试性建立在同一原则上：**同一份 bar 序列，三种驱动方式，
信号必须逐条一致**。历史 K 线天然可回放，实时链路的测试数据源就是"历史 K 线按封存
节奏假装实时推进"（现有 mysql-free mock 模式已支持该方向）。

1. **CI jest 层（无环境依赖，进 guard spec）**：内核 push 单测（预热/公开相、降级、
   单调游标、双时间戳、发射去重）+ 适配器 fake 单测（HistoricalBarSource 用内存分页
   fake DB，RealtimeSealedBarSource 用 fake market-data port）+ **三路 parity 断言**：
   同一内存 bar fixture 分别经 HistoricalBarSource→内核、RealtimeSealedBarSource→内核、
   dev-server 会话驱动，断言 signalTime/pivotTime/signalType/triggerPrice 逐条一致。
2. **本地集成层（mock 环境 + 真实基础设施）**：选定区间历史 K 线经 mock 模式按封存节奏
   推进完整实时基础设施（ingress → candle 产品化 → BullMQ → signal app → 落盘），与
   同区间同策略回测任务的 `backtest_signal_results` 逐条比对 `strategy_signal`。验证
   基础设施路径（Redis/BullMQ/持久化/交付），做成可重复执行的对账工具（输入
   securityId+period+区间+策略版本）。
3. **人工交互层（dev-server 本地仿真）**：单步推演 SSE + dump 快照目检几何/滑窗/信号，
   与回测 DB 结果对账。

生产上线验证：部署后首个交易日真实封存 bar 走 OO trace 观察信号发射 + 对账工具核对
（确定性逻辑变更按既有约定不默认写 shadow 观察步骤）。

## 7. 关联 change 边界

- `upgrade-backtest-decision-and-parity-engine`（0/10）：其 Parity Replay Suite（3.3）与
  因果断言（3.1）建立在本 change 的单通路上，是下游受益方；本 change 不碰状态机/撮合器。
- `add-pre-market-strategy-hydration`：盘前 09:20 hydration 语义保留，执行载体从
  `SharedStrategyWindowStore` 改为内核实例池的预热动作（行为契约不变）。
