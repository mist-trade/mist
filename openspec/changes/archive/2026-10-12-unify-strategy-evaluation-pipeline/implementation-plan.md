# 实施计划：unify-strategy-evaluation-pipeline

> 对应 OpenSpec change：`unify-strategy-evaluation-pipeline`（spec 已确认 2026-09-27）。
> 本文档为代码级落地细节，普通 markdown，非 openspec 格式。
> 影响仓库：仅 mist 主仓（mist-fe 零改动）。新增 npm 依赖：无。
> worktree：`mist/.worktrees/unify-strategy-evaluation-pipeline`，分支
> `feat/unify-strategy-evaluation-pipeline`，完成后单 commit 直合 master。

---

## Phase 1：内核 push 化（`libs/strategy`）

### 1.1 新内核 `StrategyEvaluationKernel`

**新文件** `libs/strategy/src/kernel/kernel.types.ts`：

```ts
export interface KernelPlan {
  readonly definitionId: number;
  readonly versionId: number;
  readonly flow: DecisionFlowNode;
  readonly signalKind?: 'entry' | 'exit';
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
  readonly requiredBarCount: number;   // 组级取 max
}

export interface KernelConfig {
  readonly securityId: number;
  readonly securityCode: string;
  readonly period: number;
  readonly publicFrom: Date;           // 相位边界：timestamp < publicFrom 为预热相
  readonly plans: readonly KernelPlan[];
  readonly registry?: FactorPluginRegistry;  // 缺省 InMemory + ensureStandardPluginsRegistered
}

export interface KernelSignal {
  readonly definitionId: number;
  readonly versionId: number;
  readonly signalKind: 'entry' | 'exit';
  readonly signalTime: Date;           // = 确认 Bar timestamp（trigger 语义）
  readonly triggerTime: string;        // ISO
  readonly triggerPrice: number;       // = bar effective close（与现 engine 取值一致）
  readonly pivotTime: string | null;   // evidence 提取，无则 null
  readonly pivotPrice: number | null;
  readonly signalType: string;         // decision.signalTag ?? action
  readonly confidence: number;
  readonly confidenceLevel: ConfidenceLevel;
  readonly decisionTrace: Record<string, unknown>;
  readonly contextSnapshot: Record<string, unknown>;
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
}

export type PrewarmStatus = 'full' | 'partial' | 'empty';

export interface KernelDiagnostics {
  readonly windowSize: number;
  readonly windowBudget: number;
  readonly lastPushedTimestamp: string | null;
  readonly prewarmStatus: PrewarmStatus;
  readonly prewarmActual: number;      // 预热相实际 push 根数
  readonly prewarmExpected: number;    // windowBudget
}
```

**新文件** `libs/strategy/src/kernel/strategy-evaluation-kernel.ts`：

```ts
export class StrategyEvaluationKernel {
  constructor(config: KernelConfig);
  /** 推进一根 Bar；返回该根当期增量信号（预热相返回 []）。重复/乱序 Bar 静默忽略。 */
  async push(bar: StrategyBar): Promise<readonly KernelSignal[]>;
  get prewarmStatus(): PrewarmStatus;
  diagnostics(): KernelDiagnostics;
}
```

push 内部语义（顺序固定）：
1. `bar.timestamp <= lastPushedTimestamp` → return `[]`（吸收现 `SharedStrategyWindowStore.prepare` duplicate 语义）；
2. `imputer.append(bar)` + `while (read().length > windowBudget) trim()`；
3. `windowSize < windowBudget` → 记 insufficient（公开相也不发射），return `[]`；
4. `bar.timestamp < publicFrom`（预热相）→ 逐 plan evaluate 但**丢弃信号**（游标推进），return `[]`；
5. 公开相 → 逐 plan 构建 `FactorContext{timestamp: bar.timestamp, bars: projected}` → `DecisionFlowEvaluator.evaluate` → `SIGNAL_EMITTED` 时构造 `KernelSignal`（pivot 用 1.2 helper）；
6. prewarmStatus 判定：首个公开 Bar 到达时按 `prewarmActual` vs `prewarmExpected` 定格 full/partial/empty。

**删除** `libs/strategy/src/simulation/strategy-simulation.engine.ts`（整文件，应删尽删）；
`strategy-simulation.types.ts` 保留（Session/Frame/SimulationSignal 供会话层用，删除仅被旧
engine 消费的残留字段）。

### 1.2 pivot 证据提取 helper

**新文件** `libs/strategy/src/decision-flow/decision-pivot-evidence.ts`：

```ts
export interface DecisionPivotEvidence {
  readonly pivotTime?: string;
  readonly pivotPrice?: number;
}
export function extractPivotEvidence(result: DecisionResult): DecisionPivotEvidence | null;
```

实现：遍历 `result.trace`，取带 `evidence` 且含 `eventType|bspType|pointType|signalType`
之一的轨迹项（现 engine `extractBspEvidence` 手法整体迁移，含 reason 中文兜底 '一买'/'1买'
等与 `formatBadgeText`）；返回 `{pivotTime: evidence.pivotTime ?? evidence.time,
pivotPrice: evidence.pivotPrice ?? evidence.price}`；无则 null。

### 1.3 会话层帧缓存

**改** `libs/strategy/src/simulation/strategy-simulation.session.ts`：
- 成员 `engine: StrategySimulationEngine` → `kernel: StrategyEvaluationKernel` + 自持
  `frames: SimulationFrame[]` + `pushedWatermark: number`（已推进入内核的 replayBars 水位）；
- `stepNext`：cursor+1 → `cursor >= pushedWatermark` 时 `kernel.push(replayBars[cursor])`
  并推进水位，组装 SimulationFrame 缓存返回；`cursor < pushedWatermark` 时只读缓存；
- `stepPrev` / 向后 `seek`：只读缓存，**不回退内核**（内核单调）；
- `getSummary()` 的 preWarmBars/currentCursor 改由 kernel.diagnostics() + 会话游标提供；
- `publicFrom = config.startDate`（Date 化）。

**改** `tools/strategy-dev/server.ts`（:388 等）：`new StrategySimulationEngine` → 会话内
kernel 装配；会话创建时策略装载改走 2.1 共享编译 helper。

**改** `libs/strategy/src/simulation/strategy-simulation.engine.spec.ts` → 重写为
`strategy-evaluation-kernel.spec.ts`：相位切换、窗口不足不判定、重复 Bar 忽略、预热三态、
连续 matched 逐 Bar 发射、双时间戳不变量。

---

## Phase 2：编译边界收敛

### 2.1 共享编译 helper

**新文件** `libs/strategy/src/decision-flow/stored-definition-compiler.ts`：

```ts
export interface StoredDefinitionCompileInput {
  readonly kind: 'rule_dsl' | 'chan_bsp' | 'decision_flow';
  readonly rule: Record<string, unknown>;
  readonly periods: readonly number[];
  readonly signalKind?: StrategySignalKind;   // rule_dsl 用
}
export interface CompiledStoredDefinition {
  readonly flow: DecisionFlowNode;
  readonly requiredBarCount: number;
  readonly sourceKind: 'rule_dsl' | 'chan_bsp' | 'decision_flow';
}
export function compileStoredDefinitionVersion(
  input: StoredDefinitionCompileInput,
): CompiledStoredDefinition;
```

分发逻辑：
- `decision_flow` → flow = rule as DecisionFlowNode；`requiredBarCount` 用现 registry 推导
  规则（`typeof rule.requiredBarCount === 'number' ? rule.requiredBarCount : 默认值`，
  从 `signal-registry.service.ts:322-324` 抽出共用）；
- `rule_dsl` → `compileStoredStrategyRuleWithNormalized`（保留现有归一化编译）→
  `LegacyStrategyCompiler.compileRuleToDecisionFlow(plan, signalKind)`；
  requiredBarCount = plan.requiredBarCount；
- `chan_bsp` → 先 `compileChanBspConfig(rule, periods)`（保留校验与 `ChanBspConfigError`，
  调用方映射 BadRequest / `chan_bsp_config_invalid` warn）→
  `LegacyStrategyCompiler.compileChanBspToDecisionFlow(plan)`；
  requiredBarCount = plan.requiredBarCount ?? 默认。

**三处接线**：
1. `apps/signal/src/signal-registry.service.ts` `compileRegistryDefinition`（:289-357）：
   三种 kind 全部产出单一 `decision_flow` 形态；`chan_bsp_plan_compiled` info 日志改为
   `strategy_plan_compiled`（label 加 sourceKind，低基数）；plan union 类型收敛；
2. `apps/mist/src/strategy/services/backtest-run-command.service.ts`（:100-131）：
   kind 判定保留（写 `backtest_runs.kind` 列，DB 语义不变），编译全走 helper；删除
   chan_bsp 前置校验块与 1/5/15/30/60 period 白名单（`ChanBspConfigError` 映射 BadRequest
   移到 helper 调用处）；
3. `tools/strategy-dev/server.ts` 会话装载走 helper（见 1.3）。

**改** `apps/backtest` 侧 plan 构建（executor 的 plan 来源）：union 收敛 decision_flow。

### 2.2 chan_bsp 封禁与 @deprecated

- `libs/shared-data/src/enums/strategy-kind.enum.ts`：`CHAN_BSP` 成员加 `@deprecated` JSDoc
  （文案按 spec：独立分支退役、存量透明编译、新建拒绝、仅 DB 历史保留）；
- `apps/mist/src/strategy/services/strategy-definition.service.ts`（:197 附近）：create 与
  enable 路径 `kind === CHAN_BSP` → `BadRequestException({code:'CHAN_BSP_KIND_RETIRED',
  message:'chan_bsp kind is retired; convert to a decision flow definition'})`；
- 新增单测：创建拒绝 / 启用拒绝 / decision_flow 与 rule_dsl 不受影响。

---

## Phase 3：HistoricalBarSource 与回测切换

### 3.1 HistoricalBarSource

**新文件** `libs/strategy/src/kernel/historical-bar-source.ts`（复用现有
`StrategyReplayMarketDataPort`——apps/backtest 的 marketData 与 dev-server provider 均已实现
或可实现该 port）：

```ts
export interface HistoricalReplayCriteria {
  readonly securityId: number;
  readonly source: StrategyMarketSource;
  readonly period: number;
  readonly publicFrom: Date;    // = run.startDate
  readonly endAt: Date;         // = run.endDate
  readonly requiredBars: number;
}
export interface HistoricalReplaySummary {
  readonly prewarmStatus: PrewarmStatus;
  readonly prewarmActual: number;
  readonly barCount: number;
}
export class HistoricalBarSource {
  constructor(
    private readonly port: StrategyReplayMarketDataPort,
    private readonly criteria: HistoricalReplayCriteria,
  );
  async drive(
    kernel: StrategyEvaluationKernel,
    onSignal?: (signal: KernelSignal, bar: StrategyBar) => void | Promise<void>,
  ): Promise<HistoricalReplaySummary>;
}
```

驱动序列：`loadReplayWindow({endAt: publicFrom, requiredBars})` 逐根 push（预热相）→
循环 `readReplayPage({startAt: publicFrom, endAt, afterTimestamp})` 逐根 push + onSignal →
summary。单测：内存 fake port 验证 push 顺序、三态 prewarmStatus、分页推进。

### 3.2 BacktestRunExecutor 重写

**改** `apps/backtest/src/backtest-run.executor.ts`：

- **删除**（应删尽删）：`chanBspDetector`/`chanBspCursors` 成员（:33-34,103-104）、
  初始窗口 hydrate + preEvents 游标块（:330-375）、chan_bsp 回放分支（:395-443）、
  decision_flow 直连分支（:446-491）、rule_dsl 分支（:492-510）、自有 imputer 装配；
- **新结构** `replaySecurity`：
  ```ts
  const compiled = compileStoredDefinitionVersion({kind: definition.kind, rule: version.rule, periods, signalKind});
  const kernel = new StrategyEvaluationKernel({
    securityId, securityCode, period: run.period,
    publicFrom: run.startDate, plans: [toKernelPlan(compiled, run)],
  });
  const source = new HistoricalBarSource(this.marketData, {...});
  const summary = await source.drive(kernel, async (signal) => {
    budget.consume();
    results.push(this.resultRepository.create(mapKernelSignalToBacktestRow(run, securityCode, signal, ruleSnapshot)));
    matchedCodes.add(securityCode); onSignal();
    if (results.length >= BACKTEST_RESULT_BATCH_SIZE) await this.flushResults(results);
  });
  // summary.prewarmStatus 可写回 run 元数据（backtest_runs 现有列够用则不加列，仅日志）
  ```
- `mapKernelSignalToBacktestRow`：`signalTime`=Date、`pivotTime`=pivotTime?new Date():null、
  `signalType`、confidence、`decisionTrace`（含 evidence pivot 证据）、contextSnapshot、
  ruleSnapshot；`decision_flow` 直连里的 confidence/level 取 KernelSignal；
- run.kind 继续写 definition.kind（DB 历史语义）。

**重写** `apps/backtest/src/backtest-run.executor.spec.ts`（fake port + 内存 bar：断言
signalTime=确认 Bar、pivotTime 提取、prewarm 三态、连续 matched 逐 Bar 落盘、批量 flush）；
**同步** `apps/mist/src/strategy/backtest-closed-loop.spec.ts`。

---

## Phase 4：实时 lane 切换（Option A）

### 4.1 RealtimeKernelPool

**新文件** `libs/signal/src/runtime/realtime-kernel-pool.ts`：

```ts
export class RealtimeKernelPool {
  /** 按 (securityId, source, period) 组推进一根封存 Bar；plans 变化时重建组内核。 */
  async push(
    bar: StrategyBar,
    plans: readonly RealtimeStrategyExecutionPlan[],
  ): Promise<readonly ShadowStrategyCandidate[]>;
  retainGroups(groups: readonly RealtimeWindowGroupIdentity[]): void;
  reset(): void;
  diagnostics(): { groupCount: number; prewarmByGroup: ... };
}
```

语义：
- key `securityId\0source\0period`；plans 的 (definitionId,versionId) 集合与现组不一致 →
  重建该组 kernel（新注册/改版策略 = 冷启动路径）；
- 组首根 bar：`loadRealtimeWindow({anchorAt: bar.timestamp, requiredBars})` 拉预热段
  （publicFrom = bar.timestamp，即触发 hydration 的当前封存 Bar 及其后为公开相），逐根
  push 后 push 当前 bar；`prewarmStatus` 进 diagnostics；
- `retainGroups` 替代原 windows.retainGroups + episodes.retainIdentities +
  chanBspCursors.retainIdentities 三处清理；
- 组内 windowBudget = max(plans.requiredBarCount)（与现 evaluation service :105-111 一致）。

### 4.2 RealtimeStrategyEvaluationService 重写

**改** `libs/signal/src/runtime/realtime-strategy-evaluation.service.ts`（整个文件）：
- 保留 `evaluate(bar, plans)` 对外签名（processor 调用面不变），内部 = eligible 过滤排序 +
  `kernelPool.push(bar, eligible)`；
- **删除**：`evaluateChanBsp`（:182-238）、rule_dsl `evaluateStrategyPlan` 分支（:135-177）、
  `chanBspDetector`/`chanBspCursors`/`windows`/`episodes` 成员与 reset/retain/diagnostics
  中的对应项；
- `ShadowStrategyCandidate` 保留（persistence 契约面），加可选 `pivotTime: string | null`；
  kernel→candidate 映射：`signalTime=bar.timestamp`、`triggerTime=bar.timestamp.toISOString()`、
  `triggerPrice=bar.close`、pivot 透传、`confidence/confidenceLevel/decisionTrace/
  contextSnapshot/ruleSnapshot` 透传；
- `RealtimeStrategyExecutionPlan` 类型收敛为单一 decision_flow 形态（flow + signalKind +
  requiredBarCount + ruleSnapshot）。

### 4.3 周边清理

- **删除** `libs/signal/src/runtime/realtime-episode.store.ts` 与其 spec；
- **改** `apps/signal/src/realtime/candle-finalized-job.processor.ts`：删除 `:188`
  `this.evaluation.activate(candidate)`；删除 chanBspIdentities 保留逻辑（:281-289）与
  retain 传参；diagnostics 面板字段同步（activeEpisodeCount/activeChanBspCursorCount →
  pool 指标）；
- **改** `apps/signal/src/signal-registry.service.ts` + `signal-registry.types.ts`：plan
  union 去 `chan_bsp`（:10, :308-315 分支），编译走共享 helper；
- 盘前 09:20 hydration：`add-pre-market-strategy-hydration` 尚未实施（0/16），本 change
  只需保证 pool 支持预热段注入（4.1 的组首根 hydration 路径即同一机制），无适配工作。

### 4.4 pivot_time 实时落盘

- `LiveStrategyPersistenceService`（persist 链路）：`strategy_signal` 行写入
  `pivotTime: candidate.pivotTime ? new Date(candidate.pivotTime) : null`。

---

## Phase 5：实体 + Migration 026

### 5.1 `deploy/database/migrations/026_unify_pipeline_dual_timestamp.sql`（forward-only）

```sql
ALTER TABLE backtest_signal_results ADD COLUMN pivot_time DATETIME NULL;
ALTER TABLE strategy_signals ADD COLUMN pivot_time DATETIME NULL;
UPDATE backtest_signal_results SET pivot_time = signal_time WHERE pivot_time IS NULL;
UPDATE strategy_signals SET pivot_time = signal_time WHERE pivot_time IS NULL;
UPDATE strategy_definitions SET status = 'disabled' WHERE kind = 'chan_bsp';
```

`deploy/database/migrations/README.md` 索引同步。

### 5.2 实体与 DTO

- `libs/shared-data/src/entities/backtest-signal-result.entity.ts`、
  `strategy-signal.entity.ts`：加
  `@Column({ name: 'pivot_time', type: 'datetime', nullable: true }) pivotTime?: Date | null;`
- `apps/mist/src/strategy/services/backtest-run-query.service.ts` `listSignals`（:78）响应 VO
  加 `pivotTime: string | null`（ISO）；实时 signal 查询服务（strategy-signal 查询面）同步；
  envelope 结构不变，items 透传新字段（单一语义键，不重装包）。

---

## Phase 6：门禁与三层测试

### 6.1 `libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts`（新增）

**静态扫描**（readdirSync 递归 `apps/signal/src`、`apps/backtest/src`、`apps/mist/src`）：
- 禁 import：`/from '[^']*(ChanBspDetector|chan-bsp\.detector|ChanBspEpisodeCursor|
  chan-bsp\.episode|evaluateStrategyPlan)/`；
- 禁求值分派：`/(plan|execution|run)\.kind\s*===\s*'(chan_bsp|rule_dsl)'/`
  （`backtest-run-command.service.ts` 的 definition.kind → run.kind 枚举映射属编译边界，
  以文件精确豁免并注释说明）。

**三路 parity 运行时断言**：合成 fixture（~400 根 1m bar，含可产 chan bsp 点走势；一个
DSL GUARD flow + 一个 chan_bsp flow，均经共享 helper 编译）：
- lane A：`HistoricalBarSource(fake port)` → kernel → 收集信号；
- lane B：`RealtimeKernelPool`（fake `StrategyRealtimeMarketDataPort`）→ 逐根 evaluate；
- lane C：`StrategySimulationSession` 会话驱动；
- 断言三路信号逐条 `signalTime/pivotTime/signalType/triggerPrice/signalKind` 一致。

### 6.2 `strategy-dual-timestamp.guard.spec.ts` 增补

- KernelSignal：signalTime === bar.timestamp、pivotTime ≤ signalTime（有 pivot 时）、
  triggerPrice === bar effective close；
- 回测落盘映射与实时 candidate 映射各一例。

### 6.3 对账 harness

**新目录** `tools/parity-reconcile/`：
- `replay.ts`：读 MySQL K 表选定区间 bar → 按封存顺序推 mock ingress（mysql-free mock 模式
  或本地 compose 栈）→ 等 BullMQ 排空 → 导出 `strategy_signal`；
- `backtest.ts`：同区间同策略版本创建回测 run → 轮询完成 → 导出 `backtest_signal_results`；
- `diff.ts`：逐条比对（signalTime/pivotTime/signalType/triggerPrice），mismatch 打印双方
  全字段明细；退出码非 0 = 不一致；
- 前提：本地 compose 栈（mysql+redis+backend+signal）运行；黄金样本建议 300ETF 5m。

---

## Phase 7：存量测试修复清单

| 测试文件 | 处置 |
|---|---|
| `libs/signal/src/runtime/realtime-strategy-evaluation.service.spec.ts` | 重写（fake port + pool；删 chan_bsp/episode 用例） |
| `libs/signal/src/runtime/realtime-episode.store.spec.ts` | 删除 |
| `apps/backtest/src/backtest-run.executor.spec.ts` | 重写（3.2） |
| `apps/mist/src/strategy/backtest-closed-loop.spec.ts` | 同步 kernel 装配 |
| `apps/signal/src/**`（processor/registry 相关 spec） | 删 activate/chanBsp identity 断言，plan union 收敛适配 |
| `libs/strategy/src/strategy-dual-timestamp.guard.spec.ts` | 增补（6.2） |
| `libs/strategy/src/strategy-boundary.guard.spec.ts`、`dev-server-boundary.guard.spec.ts` | 回归确认无误伤 |
| `apps/mist` strategy-definition 相关 spec | 新增 CHAN_BSP_KIND_RETIRED 用例 |
| `libs/strategy/src/simulation/strategy-simulation.engine.spec.ts` | 重写为 kernel spec（1.1） |

---

## Phase 8：文档与收尾

- `AGENTS.md`：更新"流式推演仿真与单步推流准则"节（StrategySimulationEngine →
  StrategyEvaluationKernel push 核心 / 会话帧缓存 / 组级实例池）、第四节实时链路描述
  （三链路单管线）、migration 编号（026）、chan_bsp kind 退役注记；
- 记忆文件 `project_pipeline_homogeneity_gate.md` 状态更新（实施完成）；
- governance guide 校对：§8 并发资源边界（kernel 实例池内存上界 = 组数 × windowBudget ×
  plans）、§11 验证基线执行。

---

## 验证命令

```bash
cd mist/.worktrees/unify-strategy-evaluation-pipeline
ln -s ../../node_modules node_modules        # 新 worktree 约定（.bin 解析）
pnpm lint && pnpm typecheck
pnpm test:ci --forceExit                      # 门禁 spec 含在内
/Users/moyui/Library/pnpm/bin/openspec validate unify-strategy-evaluation-pipeline
pnpm build:docker                             # 确认 build 列表无需变更（无新 app）
# 本地冒烟（可选）：
#   tools/strategy-dev 单步推演 vs tools/parity-reconcile 对账（黄金样本）
```

## 风险与回滚

- 最大风险面 = 实时 lane 切换（生产链路）；缓解：三路 parity 断言 + 本地 compose 冒烟 +
  部署后首交易日 OO trace 观察（确定性变更不写 shadow 步骤）；
- migration forward-only：回滚 = revert 代码，026 加列/回填保留无害（pivot_time NULL 安全），
  chan_bsp 停用回滚需手工 `UPDATE ... SET status='enabled'`（记录在 migration README）；
- 回测结果与旧版差异为预期（signalTime 修正 + 门禁增强），历史 run 不重放。
