# 实施计划：support-multi-period-evaluation

> 代码级落地清单。文件 → 改动 → 关键签名 → 测试 → 验证命令。
> 原则：**orderKey 只管数据可用性，严禁触碰信号发射侧**；日线 00:00(D) 按"交易日 D 的已完成日 K"表述；
> 终端桶为可选成分。行为基线：线上 22 条策略全部 disabled，零现网回归面。
> **唯一逻辑源**：全部取数（回测逐周期预热/分页、实时 hydration 历史、warmup）只走 canonical
> 拼接源（A 任务）；任何新路径禁止直读物理 provider 或携带 source 选择参数。一个窗口内
> 允许混合物理来源（vendor_a/qmt 拼接缝），身份含 source 防冲突，量纲按各自 profile 归一。

## Phase 1 契约与编译边界（`libs/strategy`）

| 文件 | 改动 |
|---|---|
| `src/kernel/kernel.types.ts` | `KernelPlan` + `contextRequirements: Readonly<Record<number, number>>`；`KernelConfig` **删除** `period`（周期集合 = ∪ plans 的 period ∪ contextRequirements keys）；`KernelDiagnostics` + `perPeriodPrewarm: Record<number, {actual, expected}>`、`planSkips: number` |
| `src/factor/factor.types.ts` | `FactorPluginMetadata` + 可选 `resolveContextRequirements?(params?): Readonly<Record<number, number>>` |
| `src/decision-flow/stored-definition-compiler.ts` | 遍历 flow 树插件节点（GUARD/EXTRACTOR/CONSENSUS），经 `factorPluginRegistry`（先 `ensureStandardPluginsRegistered`）取 `resolveContextRequirements(params)`，按 period 取 max 合并；插件缺失/参数非法 → `StoredDefinitionCompileError('DECISION_FLOW_RULE_INVALID')`（fail-closed）；三种来源 kind 统一 |
| `src/kernel/availability.ts`（新） | `availabilityKey(bar): Date`（1m=ts+1min；5/15/30/60m=ts，session 末根 11:30/15:00=ts+1min；1440=当日 15:01）；`SERIES_ATTRIBUTE_PREFIX='series.'`；`contextSeriesKey(period)`；`readContextSeries(attrs, period)`（只读视图）；`MissingContextSeriesError`（`code='MISSING_CONTEXT_SERIES'`，内核按 code/name 识别，兼容私有仓无依赖抛错） |

测试：context 推导（单/多插件 max、未知插件失败、无声明等价现状、chan_bsp/rule_dsl 路径）、availabilityKey 全周期分支（含 11:30/15:00/日线）。

## Phase 2 内核多周期窗口（`libs/strategy/src/kernel/strategy-evaluation-kernel.ts`）

- 每周期一个 `StrategySeriesImputer`（预算 = 该周期上所有 plan 需求 max）+ per-period 单调游标（重复/乱序 per period 忽略）；
- `push(bar)`：按 `bar.period` 入窗；`< publicFrom` 预热相静默；**每个求值周期的首个公开 bar** 做该周期静默预热求值（游标推进）；窗口 < 预算不判定；
- 求值分派：`bar.period === plan.period` 才评估该 plan；任一 `contextRequirements[q]` 窗口不足 → 跳过 + `planSkips++`（fail-closed）；
- `buildContext`：为全部声明周期写 `attributes[contextSeriesKey(q)] = frozen(window.read())`；插件抛 `MISSING_CONTEXT_SERIES` → 按 plan 捕获跳过 + 诊断，其余异常照常上抛；
- `prewarmStatus` 聚合取最差（任一 empty→empty，任一 partial→partial）；`prewarm_min_actual/expected` 仍记求值周期。

测试：同刻低周期先推可见性（5m 10:00 求值见 5m 上下文含 10:00、1m 09:35 不可见）、日线 00:00 无未来、窗口隔离、insufficient 跳过、缺键显式失败、prewarm 聚合。

## Phase 3 多序列合并源（回测/推演）

| 文件 | 改动 |
|---|---|
| `src/kernel/historical-bar-source.ts` | `HistoricalReplayCriteria`：`period` → `evaluationPeriod` + `contextPeriods: Readonly<Record<number, number>>`；预热逐周期 `loadReplayWindow`（canonical）；公开区间逐周期 `readReplayPage` 页序；**k 路归并器（新纯函数 `mergeByAvailability`）按 `(orderKey, period)` 升序**；`onBar`/`onSignal` 仅求值周期 bar 触发；summary 增 per-period prewarm 明细 |
| `apps/backtest/src/backtest-run.executor.ts` | 构造多周期 criteria（context 来自 compiled plan）；`budget.consume()` 覆盖全部推送 bar；broker/持仓/NAV 日结只由求值周期 bar 驱动（每日恰好一次，断言） |

测试：跨周期页边界、缺口、limit 截断、归并器纯函数（1m 未来分钟排除、日线 00:00 后置、终端根 orderKey）、执行引擎只吃求值 bar。

## Phase 4 实时多周期 + R2

| 文件 | 改动 |
|---|---|
| `src/kernel/adapters/realtime-kernel-pool.ts` | 组键 `(securityId, source)`；`buildGroup` 对周期集合逐周期 hydration（canonical 历史 + 当日触发源）；`retainGroups` 身份同步改；**撤销组级 lastPushed 守卫**（per-period 游标接管）；+ `warmup`（Phase 5） |
| `libs/signal/src/runtime/realtime-strategy-evaluation.service.ts` | 删除 `bar.period === plan.period` 预过滤（全 bar 进池）；候选 `period = plan.period`；`RealtimeWindowGroupIdentity` 去 period |
| `src/kernel/adapters/realtime-period.builder.ts` | 派生右标 `slotStart+period`；**终端桶吸收**（末窗在 11:30/15:00 触发闭合，终端桶可选成分，完整性按常规根数）；`REALTIME_STRATEGY_PERIODS` + 1440（日线：242 桶聚合、终端触发闭合、**timestamp=00:00(D)**、complete 按全桶） |
| `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts` | `loadRealtimeWindow`：历史（< dayStart）走 canonical（逐周期 `resolveSegments` + 段读取，复用 `loadCanonicalWindow`）；当日段保持触发源（Redis 1m + 派生，槽边界 ≤ anchor 过滤）；**policy 缺段 → 有界失败**（不空窗兜底） |
| `apps/signal/src/signal-registry.service.ts` | 实时周期白名单 + 1440；plan 携带 `contextRequirements` |
| `apps/signal/src/realtime/candle-finalized-job.processor.ts` | `periodBuilder.accept` 周期集合 = 求值 ∪ context（含 1440）；跨日守卫（保留当日已预热组，Phase 5 联动） |

测试：右标对齐（canonical 历史 vs 实时派生同刻同标签）、进行中 slot 不注入、终端桶吸收（sealed/discarded 两路、完整性行为）、日线 15:00 闭合与 incomplete、全 bar 进池、候选周期=求值周期、policy 缺段失败。

## Phase 5 盘前多周期预热

| 文件 | 改动 |
|---|---|
| `libs/timezone/src/cron-schedules.constants.ts` | `CRON_PRE_MARKET_STRATEGY_WARMUP_0920 = '0 20 9 * * 1-5'` + 导出 + 单测 |
| `libs/market-data/src/projection/bar-series-integrity.ts`（新） | `validateBarSeriesWithPolars(bars, minRequiredBars)`：时间戳严格递增/价格非负/`high>=low`/OHLC 无 NaN·Null；有界 reason（`insufficient_bars`/`timestamp_reversed`/`invalid_price`/`price_boundary_violation`/`contains_null_or_nan`） |
| `libs/strategy/src/kernel/adapters/realtime-kernel-pool.ts` | `warmup(targets, anchorAt)`：逐周期 canonical hydration → dedupe → Polars 质检 → 预构建组内核（`publicFrom=anchor`）；幂等跳过；单标的失败隔离；`PreMarketWarmupReport`（Object.freeze） |
| `apps/signal/src/realtime/signal-pre-market-warmup.service.ts`（新） | `@Cron(CRON_..., { timeZone: 'Asia/Shanghai' })` + `isTradingDay` 守卫；注册进 `SignalRealtimeModule`（import `TimezoneModule`） |
| `apps/signal/src/realtime/candle-finalized-job.processor.ts` | 启动/`reconcileRegistry` 后补热（幂等）；交易日翻转仅清 cursors/periodBuilder，组按 `warmedTradingDay` 保留 |
| `apps/signal/src/health/health.vo.ts` | `preMarketWarmup` 区块（state/warmedAt/anchorTradingDay/counts/lastFailureCode） |

测试：预热后首根封存 push 零历史 I/O 且信号与懒加载逐条一致；非交易日跳过；质检失败隔离；盘中补热不发射历史信号；健康区块断言。

## Phase 6 门禁、推演会话与验证

- `strategy-pipeline-homogeneity.guard.spec.ts`：新增多周期三路用例（回测 replay / 会话驱动 / 实时 09:20 预热+封存 1m 回放，同一 plan 增量信号逐条一致）；
- `strategy-dual-timestamp.guard.spec.ts` 复跑（日线 plan `signalTime=00:00(D)` 两路一致）；
- fail-closed 用例：insufficient context 跳过、缺键显式失败（不得 NEUTRAL）；
- `strategy-simulation.session.ts`：KernelConfig 多周期构造、帧含 context 窗口快照、stepPrev 不回退内核；
- 三大架构守卫 + `pnpm -C mist typecheck && pnpm -C mist test:ci` + `pnpm -C mist-fe typecheck && pnpm -C mist-fe test:ci` + `check:magic`；
- E2E：000001 30m + 5m/1440 上下文，canonical 回测 2005-01-04→2026-10-20；
- 分阶段启用：enable 一条 30m+5m/1440 策略（shadow），确认 `evidence.degraded=false` 后再放开存量。

## 私有仓适配（`mist-alpha-private`，随 Phase 2/4 联动，不在公共 spec 内）

- `src/plugins/{bull,bear}-left-right-bsp.plugin.ts`：`resolveSubBars` 改读 `series.5`（`readContextSeries` 同构逻辑）；日线派生值（`daily.ma5`/`prevDailyLow`）从 `series.1440` 自算；缺键抛 `MissingContextSeriesError`（`code='MISSING_CONTEXT_SERIES'`），**删除静默 NEUTRAL 降级路径**；
- 插件元数据 + `resolveContextRequirements`，**数值定案 `{5: 40, '1440': 10}`**（用户确认"与之前一致"：
  实测单测注入 subBars 25~32 根、主级别 30~39 根、硬下限 15/20；40 覆盖 MACD(12,26,9) 热身；
  日线侧此前从未有真实供给，10 根满足 MA5+前低）；
- **日线来源边界（用户确认）**：历史日线 100% QMT 原生（canonical 1440 单段、零合成）；实时仅
  当天日线由 1m 聚合，且只在当日内存窗口存在——次日 hydration 读 canonical 原生值，合成值
  不落库不回读；接缝 ≤0.01（与 QMT 内部一致性同量级，实测）；
- `src/market-data/policy.ts`：补 `'1': [{source:'qmt'}]`（15/60 如需），升 version；
- 同步 dist 到 `F:\MistDocker\private-plugins`。

## 不做的改动（边界）

- `FactorContext` 字段契约不变（走 attributes）；不新增 DB 列/迁移；不改 1m producer（左标 242 桶、grace、Redis key、trigger 契约、HIL fixtures 全部不动）；
- **信号发射侧零改动**：emission/persistence/delivery 语义与单周期内核逐条一致；orderKey 不进入任何信号路径；
- 交易执行引擎（Next-Bar/T+1）归 `upgrade-backtest-decision-and-parity-engine`。

## 部署与回滚

- 无 migration；部署即生效（`skip_health_check` 按 TDX 实况）；
- 回滚 = 回退镜像即可（无 schema/数据变更）；私有 policy 缺段只会让组构建显式失败（fail-closed，不产生脏数据）。
