# Tasks: Support Multi-Period Strategy Evaluation

## Phase 1: 契约与编译边界（`libs/strategy`）

- [ ] 1.1 `kernel.types.ts`：`KernelPlan` 增加 `contextRequirements: Readonly<Record<number, number>>`；
  `KernelConfig` 移除单值 `period`（周期集合由 plans 推导）
- [ ] 1.2 `factor.types.ts`：`FactorPluginMetadata` 增加可选
  `resolveContextRequirements(params?): Readonly<Record<number, number>>`
- [ ] 1.3 `stored-definition-compiler.ts`：遍历决策流树插件节点，从注册表解析
  `resolveContextRequirements` 并按 period 取 max 合并；插件缺失 →
  `StoredDefinitionCompileError`（有界码）；三种来源 kind 统一走此推导
- [ ] 1.4 新增 `SERIES_ATTRIBUTE_PREFIX = 'series.'` 常量与只读访问器
  `readContextSeries(attributes, period)`；新增 `MissingContextSeriesError` 有界错误
- [ ] 1.5 单测：context 推导（单插件 / 多插件取 max / 未知插件失败 / 无声明等价现状）

## Phase 2: 内核多周期窗口（`libs/strategy`）

- [ ] 2.1 `StrategyEvaluationKernel` 多窗口：per-period `StrategySeriesImputer`、
  per-period 预算与单调游标、`push(bar)` 按 `bar.period` 入窗
- [ ] 2.2 预热按周期推进；每个求值周期首个公开 bar 的静默预热求值；
  `prewarmStatus` 聚合取最差；`KernelDiagnostics` 增加有界 plan-skip 计数
- [ ] 2.3 求值分派：仅 `bar.period == plan.period` 求值；声明 context 窗口不足 →
  跳过该 plan（有界诊断）；`buildContext` 注入 `series.<period>` 只读快照
- [ ] 2.4 fail-closed：插件读未声明 `series.*` → `MissingContextSeriesError` 被内核
  按 plan 捕获 → 跳过 + 诊断，严禁 NEUTRAL / 组崩溃
- [ ] 2.5 单测：同刻低周期先推可见性、高周期无未来数据、窗口隔离、insufficient
  上下文跳过、缺键显式失败、多周期诊断

## Phase 3: 多序列合并源（`libs/strategy` + `apps/backtest`）

- [ ] 3.1 `HistoricalBarSource` 多序列化：周期集合 = 求值 ∪ context；每周期独立
  `loadReplayWindow` / `readReplayPage`（canonical）；k 路归并器（纯函数，
  同刻低周期先推）
- [ ] 3.2 `onBar` / `onSignal` 仅对求值周期 bar 触发；回测执行器确认 broker /
  持仓 / NAV 日结只由求值周期驱动（每日一次）
- [ ] 3.3 预算：`BACKTEST_MAX_BARS_PER_RUN` 覆盖全部推送 bar；多周期加速消耗
  属预期（补一条断言性单测，不新增配额）
- [ ] 3.4 单测：跨周期页边界、缺口、limit 截断、执行引擎只吃求值 bar、
  NAV 日结每日恰好一次
- [ ] 3.5 端到端冒烟：000001 30m + 5m/1440 上下文，canonical 回测
  2005-01-04 → 2026-10-20

## Phase 4: 实时多周期与 R2（`libs/signal` + `apps/signal` + `apps/mist`）

- [ ] 4.1 `RealtimeKernelPool` 组键改 `(securityId, source)`；组内 per-period 窗口；
  hydration 按周期集合加载；`retainGroups` / 诊断 / 释放在组 + per-period 对齐
- [ ] 4.2 `RealtimeStrategyEvaluationService` 取消 `bar.period` 预过滤，全 bar 进池；
  候选 period = plan 求值周期
- [ ] 4.3 `RealtimePeriodBuilder`：派生 bar 时间戳改 slot 右标（slotStart + period）；
  水位过滤改 slot 边界 <= anchorAt（进行中 slot 不注入）；period 集合支持 1440
- [ ] 4.4 1440 日线派生：当日 242 桶聚合、15:00 会话终端桶闭合、complete/incomplete
  判定、时间戳 = 当日 15:00；`REALTIME_STRATEGY_PERIODS` 扩展
- [ ] 4.5 `apps/mist` signal adapter：`loadRealtimeWindow` 历史段（< dayStart）走
  canonical resolver；当日段保持触发源；hydration 周期集合化
- [ ] 4.6 信号落库：候选/持久化的 `source` 保持该根 bar 真实来源；period = 求值周期
- [ ] 4.7 单测：右标对齐（canonical 历史 vs 实时派生同刻同标签）、进行中 slot 不注入、
  日线 15:00 闭合与 incomplete 语义、跨日守卫、组释放在 per-period 完整
- [ ] 4.8 `signal-registry.service.ts` 的实时周期白名单（1/5/15/30/60）加入 1440；
  group build / warmup 前校验 splice policy 覆盖该组求值周期 ∪ context 周期，
  缺段 → 有界 canonical-policy 失败并走预热隔离路径（不空窗兜底）
- [ ] 4.9 私有仓 `marketDataPolicy` 补齐实时周期段：`'1': [{ source: 'qmt' }]`
  （以及 15/60，如需启用），升 version；本地 `check-policy` 校验 1/5/15/30/60/1440 全覆盖

## Phase 5: 盘前预热（承接原 change，`libs/market-data` + `libs/signal` + `apps/signal`）

- [ ] 5.1 `libs/timezone`：`CRON_PRE_MARKET_STRATEGY_WARMUP_0920 = '0 20 9 * * 1-5'`
  导出 + 单测
- [ ] 5.2 `libs/market-data/src/projection/bar-series-integrity.ts`：
  `validateBarSeriesWithPolars(bars, minRequiredBars)` 纯函数 + 有界结果枚举
  （时间戳严格递增 / 价格非负 / `high >= low` / OHLC 无 NaN·Null）+ 单测
- [ ] 5.3 `RealtimeKernelPool.warmup(targets, anchorAt)`：按周期集合预热（canonical
  历史 + 当日封存段）→ dedupe → Polars 质检 → 预构建组内核
  （`publicFrom = anchorAt`）；幂等跳过；单标的失败隔离；`PreMarketWarmupReport`
- [ ] 5.4 `apps/signal` 编排：`SignalPreMarketWarmupService`（09:20 cron +
  `isTradingDay` 守卫）；启动/`reconcileRegistry` 补热（幂等、不阻塞）；
  `CandleFinalizedJobProcessor` 跨日守卫（交易日翻转保留当日已预热组）
- [ ] 5.5 可观测：`SignalHealthVo.preMarketWarmup`（state/warmedAt/anchorTradingDay/
  counts/lastFailureCode）；有界 warning 日志（`PREWARM_FAILED` /
  `DATA_INTEGRITY_ANOMALY`）
- [ ] 5.6 单测：预热后首根封存 push 零历史 I/O 且信号与懒加载逐条一致；
  非交易日跳过；质检失败隔离；盘中补热不发射历史信号

## Phase 6: 门禁与验证

- [ ] 6.1 三链路同构门禁新增多周期用例：同一 plan，回测 replay / 会话驱动 /
  实时（预热 + 封存 1m 回放）增量信号逐条一致
- [ ] 6.2 双时间戳门禁复跑（多周期下 signalTime = 求值 bar 时间戳）
- [ ] 6.3 新增 fail-closed 门禁用例：insufficient context 跳过 + 缺键显式失败
- [ ] 6.4 三大架构守卫全绿：
  `pnpm -C mist test libs/strategy/src/dev-server-boundary.guard.spec.ts
  libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts
  libs/strategy/src/strategy-dual-timestamp.guard.spec.ts`
- [ ] 6.5 `pnpm -C mist typecheck && pnpm -C mist test:ci` 全绿；
  `pnpm -C mist-fe typecheck && pnpm -C mist-fe test:ci` 全绿
- [ ] 6.6 生产验收：000001 30m + 5m/1440 上下文，canonical 回测
  2005-01-04 → 2026-10-20，战术插件 `evidence.degraded` 不再为 true；
  实盘 shadow 对账一轮
- [ ] 6.7 dev-server 单步推演会话多周期化（`strategy-simulation.session.ts` 的 KernelConfig
  构造），推演帧含 context 周期窗口；复跑会话门禁
- [ ] 6.8 `openspec validate support-multi-period-evaluation --strict` 通过；
  依据 `mist/docs/project-quality-governance-guide.md` 完成逐项校对后归档
- [ ] 6.9 分阶段启用：B 上线后先 enable 一条 30m + 5m/1440 上下文策略（shadow 观察一轮），
  确认 `evidence.degraded=false` 与信号归因后再放开存量 disabled 策略
  （生产 22 条定义当前全部 disabled，无现网回归面）
