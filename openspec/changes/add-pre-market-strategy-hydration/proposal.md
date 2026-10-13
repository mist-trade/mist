# Proposal: Pre-Market Strategy Kernel Pool Warmup and Timeline Governance

> 本 change 于 2026-10-13 重写：原稿（2026-09-09）建立在 `SharedStrategyWindowStore`
> 之上，该模块已随 `unify-strategy-evaluation-pipeline`（2026-10-12 归档）统一内核
> 重构删除。本版对齐现存架构：`RealtimeKernelPool` + `StrategyEvaluationKernel`
> 预热相语义。意图不变，载体全换。

## Why

实时策略求值走统一内核 push 通路：每 `(securityId, source, period)` 组一个
`StrategyEvaluationKernel` 实例（`RealtimeKernelPool` 托管）。当前组内核的建立采用
**懒加载（Lazy Hydration）**：只有当当日首根 `candle_finalized` 封存 Bar（如 09:31
的 1m 或 09:35 的 5m）到达时，才在组首 buildGroup 内向 MySQL 拉取 500~800 根历史
K 线并 push 进内核预热相。

该机制在生产实盘存在三大缺陷：

1. **首根 K 线冷启动抖动**：首根求值耗时同时包含历史窗口检索 I/O 与内核预热相
   逐根 push 的 CPU 开销；盘初行情集中涌入时易造成 BullMQ 任务积压与信号延迟。
2. **故障发现严重滞后**：活跃标的历史 K 线断层、缺失、时间戳错乱或脏数据，只能
   在 09:31 开盘后才暴露，错过开盘黄金窗口甚至静默失败。
3. **交易日时间轴未闭环**：系统已有 09:05 盘前体检（`apps/schedule`）与 09:15
   订阅生命周期对齐（`apps/mist`），但策略运行时缺少 09:20 盘前预热屏障——
   「数据订阅已就绪」与「计算内存已就绪」之间脱节。

## What Changes

1. **`@app/timezone` 时间轴治理扩展**：
   - `libs/timezone/src/cron-schedules.constants.ts` 新增
     `CRON_PRE_MARKET_STRATEGY_WARMUP_0920 = '0 20 9 * * 1-5'`。
   - 盘前节点（09:05 体检、09:15 订阅对齐、09:20 策略预热）在 `@app/timezone`
     权威收口；`apps/signal` 消费该常量注册 cron，交易日判定用
     `TimezoneService.isTradingDay`。

2. **`RealtimeKernelPool` 主动预热能力（`warmup`）**：
   - 新增 `warmup(targets, anchorAt)`：对每个活跃
     `(securityId, source, period)` 组，以 `anchorAt`（当日 09:20）为锚点调用
     `loadRealtimeWindow` 拉取 `requiredBars` 历史段，走既有 `dedupeHydration`
     与 Polars 向量质检后，预构建组内核（`publicFrom` = 当日 09:30 首个预期
     公开 Bar 时刻），历史段以预热相静默 push，公开相零发射。
   - 幂等：`planSignature` 与容量一致的已有组跳过；注册表变更后按既有
     `retainGroups`/重建语义对齐。
   - 单标的失败（拉取异常、质检不通过）隔离，返回结构化
     `PreMarketWarmupReport`，不影响其他标的与服务存活。

3. **Polars 向量化数据质检（`validateBarSeriesWithPolars`）**：
   - 历史 K 线在开盘前完全静态，用 `nodejs-polars`（Rust SIMD）微秒级完成列式
     检查：时间戳严格单调递增、价格非负、`high >= low`、无 NaN/Null。
   - 失败返回有界 reason 枚举（`insufficient_bars` / `timestamp_reversed` /
     `invalid_price` / `price_boundary_violation` / `contains_null_or_nan`），
     预热报告与健康端点透出，脏数据标的开盘前即告警隔离。

4. **`apps/signal` 09:20 盘前预热编排（双重保障）**：
   - **定时屏障**：新增 `SignalPreMarketWarmupService`，交易日 09:20 触发全量
     活跃组预热；跨日守卫：预热成功后当日首根 Bar 的交易日翻转不得清空已预热组
     （`CandleFinalizedJobProcessor` 记录已预热 tradingDay，翻转时保留）。
   - **事件联动**：注册表初始化/变更（`reconcileRegistry`）后对新增或扩容目标
     异步补热。
   - **退化兜底**：预热失败的标的在开盘首根自动走既有懒加载路径，行为不变。

5. **可观测性与故障隔离**：
   - `SignalHealthVo` 新增 `preMarketWarmup` 区块（状态/时间锚点/成功·跳过·
     失败计数/有界失败码）。
   - 失败只记有界 warning 日志（如 `PREWARM_FAILED`、`DATA_INTEGRITY_ANOMALY`），
     绝不阻塞预热批次、绝不让 Signal 服务崩溃或 unready。

## Capabilities

### Modified Capabilities

- `trading-timeline-governance`: 增加 09:20 盘前策略预热 Cron 常量与交易日时间轴契约。
- `realtime-strategy-evaluation`: 盘前内核池预热需求改用 `RealtimeKernelPool.warmup`
  预构建组语义（替代已删除的 `SharedStrategyWindowStore`），含 Polars 质检、
  双重触发、零首根 I/O 与故障隔离场景。

## Impact & Non-Goals

- **Impact**:
  - `libs/timezone`: 新增 `CRON_PRE_MARKET_STRATEGY_WARMUP_0920` 导出与单测。
  - `libs/market-data`: 新增 `projection/bar-series-integrity.ts`
    （`validateBarSeriesWithPolars` 纯函数 + 有界结果枚举）。
  - `libs/signal`: `RealtimeKernelPool.warmup` 与报告类型；
    `RealtimeStrategyEvaluationService` 透出预热入口。
  - `apps/signal`: 09:20 cron 编排服务、`CandleFinalizedJobProcessor` 跨日守卫与
    预热入口、`SignalHealthVo`/诊断字段。
- **Non-Goals**:
  - 不修改实时行情聚合、K 线封存与 BullMQ 触发协议（预热只做只读预构建）。
  - 不新增数据库持久化表或修改物理 Schema。
  - **不做静态指标预计算缓存**：原稿的 `StrategyAnalysisObservationCache` 预热
    与"零全量指标重算"承诺随统一内核退役——内核首公开 Bar 的静默求值本就是
    设计内唯一语义（预热相推进游标），不引入第二套指标缓存。日后如实测确有
    盘初 CPU 热点，单独立项。
  - 不改变 `StrategyEvaluationKernel` 相位判定与 `prewarmStatus` 既有语义
    （`full`/`partial`/`empty` 落盘规则不变）。
