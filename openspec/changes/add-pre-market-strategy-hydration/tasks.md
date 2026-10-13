# Tasks: Pre-Market Strategy Kernel Pool Warmup and Timeline Governance

> 2026-10-13 重写：原任务书基于已删除的 `SharedStrategyWindowStore`，作废重排。

## Phase 1: 调度常量与时间轴治理 (`@app/timezone`)

- [ ] 1.1 在 `libs/timezone/src/cron-schedules.constants.ts` 新增
  `CRON_PRE_MARKET_STRATEGY_WARMUP_0920 = '0 20 9 * * 1-5'` 常量与注释
- [ ] 1.2 在 `libs/timezone/src/index.ts` 导出该常量；补充单测断言常量值与
  交易日 `1-5` 语义
- [ ] 1.3 运行 `pnpm --filter @app/timezone test` 确保时区库全绿

## Phase 2: Polars 数据质检纯函数 (`libs/market-data`)

- [ ] 2.1 新增 `libs/market-data/src/projection/bar-series-integrity.ts`：
  `BarSeriesValidationOutcome` 有界结果类型 +
  `validateBarSeriesWithPolars(bars, minRequiredBars)` 纯函数
  （时间戳严格递增 / 价格非负 / `high >= low` / OHLC 无 NaN·Null；
  volume·amount 允许 null 不参与检查）
- [ ] 2.2 从 `libs/market-data/src/index.ts` 导出；确认不引入 `@app/*` 运行时依赖
- [ ] 2.3 编写 `bar-series-integrity.spec.ts`：五类 reason 触发路径 +
  通过路径 + volume/amount null 不误杀 + `insufficient_bars` 边界

## Phase 3: 内核池主动预热 (`libs/signal`)

- [ ] 3.1 在 `libs/signal/src/runtime/realtime-kernel-pool.ts` 定义
  `PreMarketWarmupTarget` / `PreMarketWarmupFailureReason` /
  `PreMarketWarmupReport` 类型
- [ ] 3.2 实现 `RealtimeKernelPool.warmup(targets, anchorAt)`：
  容量与 `planSignature` 幂等跳过 → `loadRealtimeWindow` →
  `dedupeHydration` → `validateBarSeriesWithPolars` → 以合成锚 Bar
  （当日 09:30，OHLC 取历史末根延展）走既有 `buildGroup` 预构建组
- [ ] 3.3 每目标异常捕获隔离，产出 `Object.freeze` 报告；单目标失败绝不抛出
- [ ] 3.4 扩展 `RealtimeKernelPoolLike` 与 `RealtimeStrategyEvaluationService`
  透出 `warmup` 入口
- [ ] 3.5 扩展 `realtime-kernel-pool.spec.ts`：预热成功 / 幂等跳过 /
  质检失败隔离 / 拉取异常隔离 / 预热组与懒加载组首根公开 Bar 发射逐条一致

## Phase 4: 信号运行时编排与跨日守卫 (`apps/signal`)

- [ ] 4.1 `CandleFinalizedJobProcessor` 新增 `warmupRealtimeWindows(anchorAt)`：
  从 `executionPlansFor` 推导全量活跃目标 → 调池 `warmup` →
  记录 `warmedTradingDay` 与预热诊断状态；异常吞掉不抛出
- [ ] 4.2 跨日守卫：交易日翻转分支中 `cursors`/`periodBuilder` 照常清空，
  `evaluation` 仅在 `tradingDay !== warmedTradingDay` 时清空
- [ ] 4.3 `reconcileRegistry` 后对新增/扩容目标异步补热（同一入口，幂等）
- [ ] 4.4 新增 `apps/signal/src/realtime/signal-pre-market-warmup.service.ts`：
  `@Cron(CRON_PRE_MARKET_STRATEGY_WARMUP_0920, { timeZone: 'Asia/Shanghai' })`
  + `TimezoneService.isTradingDay` 守卫 + 注册进 `SignalRealtimeModule`
- [ ] 4.5 扩展 `candle-finalized-job.processor.spec.ts`：预热后当日首根不清空组；
  无预热时行为与现状一致（回归）
- [ ] 4.6 新增 `signal-pre-market-warmup.service.spec.ts`：交易日触发 /
  非交易日跳过 / 服务异常不外抛

## Phase 5: 可观测性 (`apps/signal`)

- [ ] 5.1 `SignalHealthVo` 新增 `preMarketWarmup` 区块（state / warmedAt /
  anchorTradingDay / total / succeeded / skipped / failed / lastFailureCode），
  由 `HealthStateService` 从处理器诊断透出
- [ ] 5.2 预热失败记有界 warning 日志（`PREWARM_FAILED` / `DATA_INTEGRITY_ANOMALY`），
  reason 用有界枚举；补充健康 VO 断言测试

## Phase 6: 验证与质量门禁

- [ ] 6.1 集成断言：模拟 09:20 预热 → 09:31 首根封存 push，
  断言历史 K 线仓储查询次数为 0 且输出信号与无预热路径一致
- [ ] 6.2 运行三大架构守卫：
  `pnpm -C mist test libs/strategy/src/dev-server-boundary.guard.spec.ts
  libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts
  libs/strategy/src/strategy-dual-timestamp.guard.spec.ts`
- [ ] 6.3 `pnpm -C mist typecheck` + `pnpm -C mist test:ci` 全绿
- [ ] 6.4 `openspec validate add-pre-market-strategy-hydration --strict` 通过
- [ ] 6.5 依据 `mist/docs/project-quality-governance-guide.md` 完成逐项校对，
  归档 change（CLI 走 delta 合并；若 CLI 限制则 `--skip-specs` + 手工合并）
