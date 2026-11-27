# Tasks: Remediate Wave 1 P0 Runtime Integrity and Data Accuracy

## 1. Backtest Metrics Ordering & Suite Capital Normalization (`apps/backtest`)
- [x] 1.1 Write failing unit tests in `apps/backtest` confirming `BacktestRunExecutor` persists accurate `tradeCount`, `winRate`, and `profitLossRatio` (not `0`) even after `flushTrades` drains the pending buffer, and `BacktestSuiteExecutor` preserves explicit multi-symbol `targetUniverse` while scaling initial capital proportionally across multiple securities in stress & WFA suites.
- [x] 1.2 Move `computePerformanceSummary(combinedNavSeries, trades)` before `this.flushTrades(trades)` in `apps/backtest/src/backtest-run.executor.ts`.
- [x] 1.3 Fix `BacktestSuiteExecutor` (`apps/backtest/src/suite/backtest-suite.executor.ts`) to honor explicit `masterRun.targetUniverse` over scenario recommendations and normalize/scale multi-security `initialCash` consistently across child and composite suite aggregators.
- [x] 1.4 Run targeted `apps/backtest` Jest tests to verify green status.

## 2. Realtime Signal Ordering, Commit Sequence & Period Retention (`apps/signal`, `libs/strategy/src/kernel/adapters`)
- [x] 2.1 Write failing unit tests proving:
  - `CandleFinalizedJobProcessor` emits a single grouped delivery containing *all* timeframes closing on the same `effectiveTime` rather than dropping later timeframes on BullMQ `jobId` deduplication;
  - `CandleFinalizedJobProcessor` retries cleanly after a transient persistence failure without losing the unpersisted bar due to prematurely advanced `this.cursors`;
  - `RealtimePeriodBuilder.retainGroups` retains active intraday and daily buckets on registry refresh and isolates stale prior-day `dailyPending` slots when trading day rolls forward.
- [x] 2.2 Hoist `results` collection and `publishGroupedDeliveries` outside `for (const bar of emitted)` in `apps/signal/src/realtime/candle-finalized-job.processor.ts` and advance `this.cursors` only after `evaluate` + `persist` succeed (keeping same-timestamp BullMQ retry idempotent).
- [x] 2.3 Fix `RealtimePeriodBuilder.retainGroups` (`slice(0, 2)`) and add trading-day guard in `dailyPending` accumulation (`libs/strategy/src/kernel/adapters/realtime-period.builder.ts`).
- [x] 2.4 Run targeted `apps/signal` and `RealtimePeriodBuilder` Jest tests to verify green status.

## 3. Notification Sweep Anti-Starvation (`apps/notification`, `libs/contracts`)
- [x] 3.1 Write failing unit tests proving `PendingAlertDeliverySweepService.findStranded()` discovers stranded `PENDING` alert events even behind `> 100` in-flight `PENDING` rows with existing delivery rows, and enqueueing uses a non-colliding sweep job ID.
- [x] 3.2 Update `PendingAlertDeliverySweepService.findStranded()` (`apps/notification/src/delivery/pending-alert-delivery-sweep.service.ts`) to filter missing `strategy_alert_deliveries` rows directly in SQL (`LEFT JOIN ... WHERE d.id IS NULL ORDER BY e.id ASC LIMIT 100`) and expose a distinct deterministic sweep fanout job ID helper (`alertDeliverySweepFanoutJobId` / `enqueueSweepFanout`).
- [x] 3.3 Run targeted `apps/notification` and `libs/contracts` Jest tests to verify green status.

## 4. SimulatedBroker STOP Order Parity (`libs/strategy/src/execution`)
- [x] 4.1 Write failing unit tests in `libs/strategy/src/execution/` covering STOP orders with custom `slippageRatio`, one-word limit-down freeze (`BLOCKED` + paired BUY cancellation), non-SELL guard, and failed-fill (`REJECTED` + removal from `pendingOrders`).
- [x] 4.2 Fix STOP order matching in `libs/strategy/src/execution/simulated-broker.ts` (including `this.slippageRatio`, `ORDER_SIDES.SELL` check, `isOneWordLimitDown` freeze handling, and `REJECTED` cleanup on `executeFill === null`), plus verify `deriveOrderId` checks `orderLog` so historical IDs are never overwritten.
- [x] 4.3 Run targeted `libs/strategy` execution Jest tests to verify green status.

## 5. Virtual Exit NaN Guards, Composite Sync & Prewarm Continuity (`libs/strategy/src/virtual-exit`, `libs/strategy/src/kernel`)
- [x] 5.1 Write failing unit tests verifying:
  - `PriceLevelExitPolicy` never exits on missing/`NaN` thresholds or prices;
  - `CompositeVirtualExitPolicy` deduplicates same-bar exits across primary and fallback policies and broadcasts external exits to keep sibling lots synchronized;
  - `StrategyEvaluationKernel` forwards `isPreWarm` bars (including surveillance prewarm bars) to `virtualExitPolicy?.onPrewarmBar?.(bar, period)`;
  - `prefetchContextOpinions` isolates `MissingContextSeriesError` per plan without crashing healthy plans, and sibling plans on the same bar cannot mutate each other's `context.attributes`;
  - `ChanBspFactorPlugin` monotonic cursors stay isolated across distinct plans, nodes, directions, and point masks.
- [x] 5.2 Add `Number.isFinite` guards to `libs/strategy/src/virtual-exit/price-level-exit.policy.ts`.
- [x] 5.3 Add optional `onPrewarmBar` and `onExternalExit` hooks on `libs/strategy/src/virtual-exit/virtual-exit.port.ts` and implement bi-directional sync & dedup in `libs/strategy/src/virtual-exit/composite-virtual-exit.policy.ts`.
- [x] 5.4 Update `libs/strategy/src/kernel/strategy-evaluation-kernel.ts` (prewarm forwarding to `virtualExitPolicy`, `contextPrefetchSpecs` dedup + per-plan fail-closed prefetch isolation, per-plan `attributes` clone, plan execution scope) and scope `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts` `cursorMap` keys cleanly with `DecisionFlowEvaluator`.
- [x] 5.5 Run targeted `libs/strategy` virtual-exit, kernel, factor, and homogeneity guard Jest tests to verify green status.

## 6. Simulation Availability Merge & Dev Gateway Isolation (`libs/strategy/src/simulation`, `tools/strategy-dev`)
- [x] 6.1 Write failing unit tests verifying `StrategySimulationSession` interleaves external bars using `availabilityKey` (blocking intraday daily lookahead) and dev-server `/v1/simulation/start` assigns negative synthetic `securityId` values to external bars and reuses module-level `visualCommandsCache`.
- [x] 6.2 Fix `StrategySimulationSession` (`libs/strategy/src/simulation/strategy-simulation.session.ts`) external bar interleaving to compare `availabilityKey` timestamps in both `seedPreWarm` and `stepNext`.
- [x] 6.3 Fix `tools/strategy-dev/server.ts` `/v1/simulation/start` external context `toStrategyBar` `securityId` assignment (distinct negative IDs matching `req.securityId ?? -(index + 1)`) and hoist bounded `visualCommandsCache` to module scope.
- [x] 6.4 Run full verification gates: `OPENSPEC_TELEMETRY=0 openspec validate remediate-wave1-p0-runtime-integrity --strict`, `pnpm typecheck`, `pnpm lint:check`, `pnpm check:magic`, `pnpm test:ci`.
