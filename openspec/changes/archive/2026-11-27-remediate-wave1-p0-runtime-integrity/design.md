# Design: Wave 1 P0 Runtime Integrity and Data Accuracy

## Overview

Wave 1 fixes ten orthogonal correctness and data-integrity bugs across six runtime boundaries while keeping all existing wire contracts, database schemas, and open/private plugin isolation invariants intact.

## Key Technical Decisions

### 1. Backtest Summary Ordering & Multi-Symbol Suite Capital Normalization
- **Summary Before Flush**: In `BacktestRunExecutor.executeRun`, `computePerformanceSummary(combinedNavSeries, trades)` is pure and read-only, whereas `flushTrades(trades)` drains `trades` in batches (`trades.splice`). Moving summary calculation (alongside `combineDailyNavHistories`) before `flushTrades(trades)` guarantees persisted `tradeCount`, `winRate`, and `profitLossRatio` reflect full execution history without extra memory allocation.
- **Suite Capital & Universe Respect**:
  - In `BacktestSuiteExecutor.executeStressSuite`, explicit `masterRun.targetUniverse` takes precedence when non-empty, falling back to `scenario.recommendedUniverse` only when `masterRun.targetUniverse` is empty (preventing silent override of user-specified instruments).
  - For both WFA (`executeWfaSuite`) and Stress Suite (`executeStressSuite`), when multiple securities run independently with `DEFAULT_BROKER_INITIAL_CASH` each (`N` securities yielding `N * DEFAULT_BROKER_INITIAL_CASH` total combined NAV baseline), each child run's `initialCash` / equity series and suite initial capital MUST match the exact initial capital (`effectiveUniverseSize * DEFAULT_BROKER_INITIAL_CASH`) or child NAVs MUST be normalized before aggregation so composite return equals true capital-weighted portfolio return rather than `(N - 1) * 100%` inflation.

### 2. Realtime Signal Cursor Commit Ordering & Multi-Period Batch Fanout
- **Hoisted Group Delivery Fanout**: In `CandleFinalizedJobProcessor.process`, `results: LiveStrategyPersistenceResult[]` aggregates across all bars in `emitted` before calling `publishGroupedDeliveries(results)`. Because `alertDeliveryFanoutJobId` keys by `(securityId, effectiveTime)`, emitting multiple intervals (e.g. `1m`, `5m`, `15m`, `30m`, `60m`, `1440m`) closing at the same boundary produces a single group enqueue carrying every persisted `alertEventId` rather than losing all intervals after the first.
- **Commit-After-Persist Cursors & Retry Safety**: `this.cursors.set(cursorKey, ...)` MUST only execute after all bars in `emitted` complete `evaluate` and (in `on` mode) `persist`. If an upstream error triggers BullMQ retry before cursor commit:
  - Previously partially persisted `AlertEvent` rows remain protected by MySQL `dedupeKey` idempotency (`LiveStrategyPersistenceService` returns existing/deduped result without duplicating rows);
  - To prevent `periodBuilder.accept(...)` from mutating or re-accumulating the same `trigger.timestamp` twice during retry of the *same* `trigger.timestamp` in memory, `periodBuilder` tracks or deduplicates the bar slot by timestamp (`Map<number, StrategyBar>`) and can replay cleanly when slot state isn't prematurely discarded until evaluation/persistence completes (or snapshots/guards emitted slots per timestamp). Concretely, `CandleFinalizedJobProcessor` can hold a small pending-commit guard or avoid advancing `cursors` until persistence commits while keeping `periodBuilder` idempotent across same-timestamp retry.
- **Two-Segment Group Retention & Daily Day Boundary**:
  - `RealtimePeriodBuilder.retainGroups` checks `key.split('\u0000').slice(0, 2).join('\u0000')` to match `groupKey(securityId, source)` (`2` segments), preserving active intraday and daily buckets on registry refresh.
  - `RealtimePeriodBuilder.dailyPending` verifies `daySlot.tradingDayMs === tradingDayMs`; if stale unclosed buckets remain from a prior day (e.g. missing `15:00` bar), the prior day bucket is cleared/replaced instead of merging bars from two different trading days into one `1440` bar.

### 3. Notification Sweep Anti-Starvation & Unique Recovery Job IDs
- `PendingAlertDeliverySweepService.findStranded()` delegates directly to a SQL `QueryBuilder` `LEFT JOIN strategy_alert_deliveries` (`WHERE e.status = :pending AND e.created_at <= :cutoff AND d.id IS NULL ORDER BY e.id ASC LIMIT :limit`). Only genuinely stranded rows occupy the `100`-row batch, eliminating head-of-line starvation behind busy retry queues.
- Because BullMQ keeps completed deterministic job IDs for `removeOnComplete` retention, re-enqueueing via `alertDeliveryFanoutJobId` alone gets silently ignored if an earlier fanout job with the same `(securityId, effectiveTime)` succeeded and left a stranded latecomer (or partial crash). `PendingAlertDeliverySweepService` supplies a distinct deterministic sweep/batch job ID suffix derived from the stranded `alertEventIds` (or `queue.enqueueSweepFanout(descriptor, ids)`), keeping sweep self-deduping across repeated 60s passes while never colliding with completed primary fanout jobs.

### 4. SimulatedBroker STOP Order Parity
- STOP stop-loss evaluation aligns strictly with Stage-2 market/limit SELL rules:
  - Skip non-SELL STOP orders (or reject cleanly if invalid side);
  - Check `isOneWordLimitDown(bar, prevClose)` first: if limit-down frozen, mark order `BLOCKED` (`SELL_BLOCKED_LIMIT_DOWN`) and record `blockedSellSecurities.add(secCode)` so any paired Stage-2 BUY in the same bar pass is cancelled (`PAIRED_SELL_BLOCKED_LIMIT_DOWN`);
  - Apply `this.slippageRatio` instead of implicit defaults (`applySlippage(execPrice, ORDER_SIDES.SELL, this.slippageRatio)`);
  - When `executeFill` returns `null` (insufficient/T+1 locked shares), mark order `REJECTED` with deterministic `INSUFFICIENT_SHARES` / `T1_LOCKED_SHARES` and remove from `pendingOrders` so stale STOP orders never loop across subsequent bars.

### 5. Virtual Exit NaN Guards, Composite Sync & Prewarm Hydration
- **PriceLevelExitPolicy**: Guard every rule evaluation (`stop`, `breakeven`, `trailing`, `time_expired`) and cost/peak/close arithmetic with explicit `Number.isFinite(...)` checks; non-finite rule parameters never trigger accidental exits. Guard `updateLotWatermark` against non-finite prices and clean tracking state cleanly.
- **CompositeVirtualExitPolicy & VirtualExitPolicyPort**:
  - Add optional `onPrewarmBar?(bar: StrategyBar, period: number): void` and optional `onExternalExit?(proposal: VirtualExitProposal): void` on `VirtualExitPolicyPort` so existing test stubs remain backward-compatible.
  - `StrategyEvaluationKernel` forwards `isPreWarm` bars (after appending to `window` and trimming, for both primary and optional prewarm periods) and surveillance prewarm bars to `virtualExitPolicy?.onPrewarmBar?.(bar, bar.period)`.
  - Inside `CompositeVirtualExitPolicy.onBar`: collect `primary` proposals first, notify `fallback.onExternalExit?.(proposal)` for each channel exited by `primary`; then collect `fallback` proposals, deduplicate against channels already exited in `primary` this bar, and notify `primary.onExternalExit?.(proposal)` for remaining exits. Both delegates stay synchronized and emit at most one exit per channel per bar.

### 6. Kernel Isolation, Factor Cursor Scoping, & Dev Simulation Availability Alignment
- **Per-Plan Prefetch Isolation & Context Attributes Clone**:
  - Deduplicate `contextPrefetchSpecs` in `StrategyEvaluationKernel` constructor by `cacheKey`.
  - In `prefetchContextOpinions`, if a `context` plugin throws `MissingContextSeriesError`, do NOT abort unrelated sibling plans; cache or rethrow the `MissingContextSeriesError` lazily inside each plan's `try { ... } catch (isMissingContextSeriesError)` evaluation block so fail-closed skips remain strictly scoped per plan.
  - Give each plan evaluation a fresh shallow clone of `context.attributes` (`new Map(baseContext.attributes)`) so `EXTRACTOR` writes from one plan cannot leak into sibling plans on the same bar.
- **ChanBspFactorPlugin Cursor Scoping**:
  - `DecisionFlowEvaluator` attaches non-invasive plan/node execution scope to the per-evaluation `attributes` map (e.g. an internal scoped symbol or well-known key carrying `definitionId/versionId` + active `node.id`), and `ChanBspFactorPlugin` includes `scope` + `securityId` + `period` + `units` + `direction` + canonical point mask in `cursorMap` keys. Distinct branches (e.g. 1st/2nd buy vs 3rd sell) or sibling definitions on the same security/period maintain independent monotonic cursors without cross-suppression.
- **Simulation Availability Merge & Dev Gateway Security IDs**:
  - `StrategySimulationSession` compares `availabilityKey({ period: extBar.period, timestamp: extBar.timestamp }).getTime() <= availabilityKey({ period: bar.period, timestamp: bar.timestamp }).getTime()` when interleaving `externalPreWarmBars` and `externalPublicBars`, eliminating intraday daily lookahead leaks.
  - `tools/strategy-dev/server.ts` passes distinct negative synthetic `securityId` values (starting `-1`, `-2`, ...) directly into `toStrategyBar(...)` for external context series instead of falling back to `DEFAULT_DEV_SECURITY_ID` (`1`), guaranteeing external bars go solely to external windows.
  - Hoist `visualCommandsCache` in `tools/strategy-dev/server.ts` to module scope with bounded capacity eviction (`MAX_VISUAL_COMMANDS_CACHE_ENTRIES`).

## Open-Source Confidentiality Boundary

Zero private plugin identifiers, private file paths, proprietary threshold constants, or private strategy parameters appear anywhere in this design or its spec deltas. Private virtual-exit policy implementations consume only the optional public `onPrewarmBar` / `onExternalExit` hooks defined on `VirtualExitPolicyPort`.
