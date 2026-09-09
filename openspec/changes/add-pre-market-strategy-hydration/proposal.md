# Proposal: Pre-Market Strategy Window Hydration and Timeline Governance

## Why

在当前的实时策略信号计算链路（`apps/signal`）中，历史 K 线数据的加载采用的是**被动懒加载（Lazy Hydration）**策略：只有当开盘后首根实时 `candle_finalized` 任务到达（例如 09:31:00 的 1 分钟 K 线或 09:35:00 的 5 分钟 K 线封存）时，`SharedStrategyWindowStore` 才会向 MySQL 数据库发起查询，拉取该标的过去 500 ~ 1000 根历史 K 线并构建内存滑窗。

这种懒加载机制在生产实盘运行中存在三大缺陷与风险：
1. **首根 K 线的冷启动 I/O 与计算双重抖动**：首根 K 线的求值耗时不仅包含等待 MySQL 数据库检索 500~1000 根历史 K 线的 I/O 延迟（100~300ms），还包含在首根 K 线到达时对千根历史数据进行经典技术指标（MACD, KDJ, RSI 等）全量计算的 CPU 开销。在盘初集中行情涌入时极易造成 BullMQ 任务积压与信号延迟。
2. **故障发现严重滞后**：若某只活跃标的历史 K 线存在断层缺失、未同步、时间戳错乱或脏数据，该异常只能在 09:31 开盘后甚至更晚的周期封存时才被暴露，导致开盘黄金交易窗口的信号漏报或静默失败。
3. **交易日全生命周期时间轴未闭环**：系统已经在 09:05 建立了盘前健康体检、在 09:15 建立了订阅生命周期对齐（Read-Before-Reset），但策略运行时缺少 09:18~09:20 的盘前主动预热屏障（Pre-market Hydration Barrier），导致“数据订阅已就绪”与“计算内存已就绪”之间存在脱节。

## What Changes

1. **`@app/timezone` 统一时间轴治理扩展**：
   - 在 `libs/timezone/src/cron-schedules.constants.ts` 中新增标准调度常量：
     - `CRON_PRE_MARKET_STRATEGY_WARMUP_0920 = '0 20 9 * * 1-5'`（A 股交易日 09:20 盘前策略滑窗预热）。
   - 确保所有盘前时间节点（09:05 体检、09:15 订阅对齐、09:20 策略预热、22:30 晚间同步、06:30 晨间重试）在 `@app/timezone` 中权威收口。

2. **Polars 驱动的盘前极速数据质检与断层扫描（Vectorized Data Integrity Screening）**：
   - 历史 K 线在开盘前（09:20）完全静态。在加载入内存滑窗时，利用 `nodejs-polars` 在微秒级内对全量历史 Bar 进行向量化并行检查：
     - 时间戳严格单调递增（`timestamp.diff() > 0`）；
     - 价格合法性检查（`open, high, low, close >= 0` 且 `high >= low`）；
     - 无 NaN/Null/Inf 缺失；
   - 一旦检测到数据质量缺陷，立即生成明确的盘前诊断记录并隔离异常标的，提前告警，防止开盘静默故障。

3. **Polars 静态指标预计算与分析缓存预热（Static Indicator Pre-Computation）**：
   - 在 09:20 预热阶段，利用已迁移至 Polars 表达式的 `@app/indicators` 库，对历史数据一次性向量计算出策略所需指标（MACD, KDJ, RSI, DualMA, ATR, ADX）的静态历史序列；
   - 预热并填充 `StrategyAnalysisObservationCache` 与窗口状态，使得 09:31 开盘首根 K 线到达时：
     - **零数据库 I/O**（内存 `WindowGroup` 直接命中）；
     - **零全量历史指标循环计算**（历史 Bar 指标已预热，只需微秒级单步增量递推）；
     - 策略评估时间压降至微秒至个位数毫秒级。

4. **`apps/signal` 盘前主动预热机制（Pre-market Window Hydration）**：
   - **`SharedStrategyWindowStore` 增强**：新增幂等主动预热能力 `warmup(marketData, criteria)`，支持按 `(securityId, source, period, requiredBars)` 批量预加载历史数据、执行 Polars 质检与指标预热并建立 `WindowGroup` 内存滑窗。
   - **双重触发保障（事件联动 + 09:20 定时兜底）**：
     - **事件驱动触发**：当 `SignalRealtimeStartupService` 启动或接收到 `SignalRegistry` 变更并完成 `reconcileRegistry` 后，自动触发异步预热；
     - **定时屏障触发**：在交易日 09:20 定时触发全量活跃策略的滑窗预热与检查，确认所有活跃标的内存就绪。

5. **异常隔离与可观测性（Failure Isolation & Diagnostics）**：
   - 单只标的历史数据不足、质检失败或拉取超时，记录明确的有界警告日志（如 `PREWARM_FAILED`, `DATA_INTEGRITY_ANOMALY`），隔离失败并不影响其他标的的预热及 Signal 服务的存活性；
   - 开盘后对未预热成功的标的自动退化走按需兜底拉取（On-demand Fallback）；
   - 在 `SignalHealthVo` 及 diagnostics 中暴露预热完成度（`prewarmedGroups`、`hydrationStatus`、`polarsValidationSummary`）。

## Capabilities

### Modified Capabilities
- `trading-timeline-governance`: 增加 09:20 盘前策略预热 Cron 常量定义与交易日时间轴契约。
- `realtime-strategy-evaluation`: 增加盘前策略滑窗预热（Pre-market Window Hydration）需求、Polars 向量数据质检、静态指标预热、双重触发机制、零 I/O 首根求值及故障隔离场景。

## Impact & Non-Goals

- **Impact**:
  - `libs/timezone`: 新增 `CRON_PRE_MARKET_STRATEGY_WARMUP_0920` 导出。
  - `libs/signal`: `SharedStrategyWindowStore` 增加 `warmup` 逻辑、Polars 数据完整性校验及指标缓存预热。
  - `apps/signal`: 增加 09:20 定时调度支持与事件驱动触发编排，在 `SignalHealthVo` 中暴露预热状态。
- **Non-Goals**:
  - 不修改实时行情聚合、K 线封存及 BullMQ 触发协议；
  - 不修改缠论核心算法（`ChanCore`）与买卖点判定逻辑；
  - 不修改数据库物理 Schema 或新增持久化表模型。
