# Change: Remediate Wave 1 P0 Runtime Integrity and Data Accuracy Defects

## Why

A full-stack end-to-end reliability audit across signal evaluation, realtime scheduling, notification delivery, backtest execution, broker simulation, virtual-exit evaluation, and the local development gateway uncovered critical runtime defects causing silent signal loss, corrupt persisted metrics, lookahead/window contamination, and exit-rule mis-fires:

1. **Backtest metrics zeroing and suite capital scaling distortion**:
   - `BacktestRunExecutor` empties `trades` in-place via `flushTrades` (`splice`) before passing `trades` to `computePerformanceSummary`, persisting `winRate = 0`, `profitLossRatio = 0`, and `tradeCount = 0`.
   - `BacktestSuiteExecutor` overrides explicit `targetUniverse` in stress scenarios and passes single-security `DEFAULT_BROKER_INITIAL_CASH` when multi-security child runs allocate per-security capital, inflating composite returns by `(N - 1) * 100%`.
2. **Realtime signal loss and aggregation state wipeout**:
   - `CandleFinalizedJobProcessor` dispatches `publishGroupedDeliveries` inside `for (const bar of emitted)`, causing multiple timeframes closing on the same `effectiveTime` (e.g., `10:30` / `15:00`) to collide on `alertDeliveryFanoutJobId` and silently drop subsequent timeframes via BullMQ job-id deduplication.
   - `CandleFinalizedJobProcessor` advances `this.cursors` and `periodBuilder` before evaluation and DB persistence succeed, so transient DB retry short-circuits on the cursor and drops all signals for that bar.
   - `RealtimePeriodBuilder.retainGroups` compares 2-segment group keys against 3-segment slot keys (`slice(0, 3)`), wiping all in-flight intraday and daily buckets whenever the strategy registry refreshes; `dailyPending` lacks trading-day isolation when a day misses its terminal close trigger.
3. **Notification sweep head-of-line starvation**:
   - `PendingAlertDeliverySweepService.findStranded()` fetches the oldest `100` `PENDING` alert events *before* filtering out events that already have `strategy_alert_deliveries` rows, allowing 100 retry-in-progress events to starve stranded events behind them; sweep re-enqueues also collide with completed deterministic fanout `jobId`s.
4. **Execution broker STOP-order defects**:
   - `SimulatedBroker` STOP order matching omits `this.slippageRatio` (hardcoding default slippage), omits `order.side === ORDER_SIDES.SELL` and `isOneWordLimitDown` liquidity checks, and leaves failed `executeFill` orders stuck in `pendingOrders` retrying endlessly every bar.
5. **Virtual exit safety, composite synchronization, and prewarm continuity**:
   - `PriceLevelExitPolicy` evaluates arithmetic thresholds without `Number.isFinite` guards, allowing malformed `NaN` comparisons to pass guards and falsely exit on the first profitable bar.
   - `CompositeVirtualExitPolicy` fails to synchronize virtual lots when one delegate exits a channel, leaving stale ghost lots on the sibling delegate and emitting duplicate exits.
   - `VirtualExitPolicyPort` lacks a prewarm hydration hook (`onPrewarmBar`) during `StrategyEvaluationKernel` pre-warm bars, leaving trailing indicator windows starved when the public phase starts.
6. **Evaluation kernel, factor cursor, and local simulation isolation**:
   - `prefetchContextOpinions` runs outside per-plan error handling in `StrategyEvaluationKernel`, causing one plan's missing context series to crash healthy sibling plans, while `context.attributes` mutates across plans in the same bar.
   - `ChanBspFactorPlugin` keys `cursorMap` only on `securityId:period:units`, letting distinct plans, nodes, or opposite directional branches suppress each other's signals.
   - `StrategySimulationSession` merges external bars by raw `timestamp` instead of `availabilityKey`, leaking daily bars into earlier intraday steps; `tools/strategy-dev/server.ts` `/v1/simulation/start` keeps `securityId = 1` on external bars so external index bars contaminate the primary symbol's sliding window; `server.ts` also reinstantiates `visualCommandsCache` inside the request handler.

## What Changes

- **Backtest Runtime (`apps/backtest`)**:
  - Compute `computePerformanceSummary(combinedNavSeries, trades)` *before* `flushTrades(trades)` consumes `trades`.
  - Scale suite denominator/initial capital proportionally to effective universe size (or normalize child NAVs consistently) and preserve explicit user-supplied `targetUniverse` in stress suite runs when provided.
- **Realtime Signal Processing & Period Builder (`apps/signal`, `libs/strategy/src/kernel/adapters`)**:
  - Hoist delivery result aggregation outside `for (const bar of emitted)` in `CandleFinalizedJobProcessor` so all timeframes sharing `(securityId, effectiveTime)` are batched into a single `publishGroupedDeliveries` fanout call.
  - Defer updating `this.cursors` until after evaluation and persistence commit succeed, keeping BullMQ retry re-entrant without losing unpersisted bars.
  - Fix `RealtimePeriodBuilder.retainGroups` to match the 2-segment `securityId\u0000source` identity (`slice(0, 2)`) and key/reset `dailyPending` safely across trading days.
- **Notification Sweep (`apps/notification`, `libs/contracts`)**:
  - Query stranded `PENDING` alert events directly in SQL via `LEFT JOIN strategy_alert_deliveries ... WHERE d.id IS NULL ORDER BY e.id ASC LIMIT 100`.
  - Use a non-colliding sweep fanout job identifier (scoped by group + sorted stranded event IDs or explicit sweep suffix) so BullMQ never drops recovery jobs against previously completed fanout jobs.
- **Trading Execution Broker (`libs/strategy/src/execution`)**:
  - Pass `this.slippageRatio` to STOP order fill pricing, enforce `order.side === ORDER_SIDES.SELL`, check `isOneWordLimitDown` liquidity freeze (deferring as `BLOCKED` and cancelling paired buys), and transition invalid/unfillable STOP orders out of `pendingOrders` cleanly (`REJECTED`).
- **Virtual Exit & Evaluation Kernel (`libs/strategy/src/virtual-exit`, `libs/strategy/src/kernel`, `libs/strategy/src/factor/plugins`)**:
  - Add strict `Number.isFinite` numeric guards across all `PriceLevelExitPolicy` rule evaluations.
  - Add optional `onExternalExit?(proposal)` / `onPrewarmBar?(bar, period)` lifecycle hooks on `VirtualExitPolicyPort`, deduce composite duplicate exit proposals in `CompositeVirtualExitPolicy`, and broadcast either delegate's exit confirmation to its sibling so composite virtual lots remain synchronized.
  - Isolate `prefetchContextOpinions` failures (`MissingContextSeriesError`) per plan inside `StrategyEvaluationKernel`, clone per-plan `FactorContext.attributes` maps, and scope `ChanBspFactorPlugin` `cursorMap` keys by strategy/node/direction/points scope.
- **Local Dev Simulation & Gateway (`libs/strategy/src/simulation`, `tools/strategy-dev/server.ts`)**:
  - Merge external bars against primary bars using `availabilityKey(bar)` rather than raw `timestamp`.
  - Assign negative unique synthetic `securityId` values to external context series in `/v1/simulation/start` so `StrategyEvaluationKernel` routes them solely to external windows.
  - Hoist `visualCommandsCache` in `tools/strategy-dev/server.ts` to module scope with bounded FIFO/LRU eviction.

## Non-Goals

- Database DDL schema changes or new migrations (no new columns or tables are required in Wave 1).
- Performance refactoring of context-role indicators or cross-security portfolio allocation (`Wave 2`).
- Exposure or coupling of private extension plugins inside open-source code or OpenSpec documents.
