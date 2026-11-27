# Change: Remediate Wave 2B Trading Engine, Four-Path Parity, Notification Delivery & Runtime Integrity

## Why
Full-stack code review across the Unified Trading Engine, persistence/VO mappers, backtest/dev gateways, realtime runtime services, and notification delivery revealed concrete Wave 2B P1 reliability, performance, and four-path isomorphism defects:
1. Next-Bar Open buy recomputation (`computeAffordableQuantity` in `run-trading-pipeline.ts`) omits `macroRegime`, custom `feeConfig`, and quantity upper-bounds (`[BUG-MAIN-PIPELINE-01]`), while `apps/backtest` and `tools/strategy-dev` lack matching Next-Bar high-open recompute, `surveilBar` macro-regime propagation, and `availabilityKey`-derived `effectiveTime`.
2. `TradingEngine` and `PositionStateMachine` exhibit ledger/state drift vs `foldVirtualFills` (unpreserved `realizedPnlLi` / missing proportional buy-fee basis on `TradingPositionState`, stale `entryTime` on scale-in buys), `consolidation.ts` / `manual.ts` bypass `resolveIntent`, `runAssumedClosePipeline` recomputes `foldVirtualFills` in $O(G \cdot F)$, and `SimulatedBroker.onBar` allocates per-bar working sets even when no pending orders exist.
3. Notification delivery (`AlertChannelDeliveryService`, `AlertReplayService`, `VirtualFillLogService`) lacks per-`securityId` serialization, records virtual fills before `adapter.send` succeeds, hardcodes `pivotTime: null, pivotPrice: null`, omits `securityId` in `buildTradingManual`, resets `AlertEvent` status after re-enqueueing, and loads heavyweight `instruction` JSON blobs during `loadBySecurity`.
4. Signal persistence/VO/simulation mappers omit presentation fields (`pivotPrice`, `badgeText`, `displayTag`, `styleMeta`, `triggerPeriod`, `signalType`) or leak raw TypeORM properties (`...signal`) / fabricate pivot fallbacks, while `HealthStateService` constructs a local `RuntimeObservabilityService` instead of injecting the DI singleton and `SignalPreMarketWarmupService` runs without `SignalRuntimeMutex`.
5. `tools/strategy-dev/server.ts` drops `navSeries` on cached backtest responses, freezes empty `ruleSnapshot`, omits `externalContextRequirements`, and fabricates fake `pivotTime` fallbacks.

## What Changes
- Extract pure shared helpers in `libs/strategy/src/trading/`:
  - `createVirtualFillAccumulator` (backing `foldVirtualFills` and giving `runAssumedClosePipeline` $O(G+F)$ incremental updates);
  - `recomputeNextBarOpenBuyQuantity` (propagating `macroRegime`, `feeConfig`, `feeEnabled`, `lotSize`, `cashAllocationRatio`, `requestedQuantity` cap across `runTradingPipeline`, `BacktestRunExecutor`, and `tools/strategy-dev/server.ts`);
- Align `TradingEngine`, `consolidation.ts`, `manual.ts`, `domain.types.ts`, `PositionStateMachine`, and `SimulatedBroker.onBar` fast-path;
- Complete `SignalPersistencePayload`, `kernel-signal-mapper`, `StrategySignalService` / `StrategySignalVo` explicit projection (zero ORM spread), and wire `HealthStateService` / `SignalPreMarketWarmupService` / `LiveStrategyPersistenceService` cleanly;
- Serialize per-`securityId` delivery execution, commit assumed virtual fills only on `sent` delivery outcomes, reset `AlertEvent` status before queue replay, and add column projection on `VirtualFillLogService.loadBySecurity`;
- Align `apps/backtest` and `tools/strategy-dev/server.ts` Next-Bar recompute, `surveilBar` macro regime, `effectiveTime`, cached `navSeries`, `ruleSnapshot`, `externalContextRequirements`, and non-fabricated pivot fields.

## Impact
- Affected specs: `trading-engine`, `backtest-runtime`, `strategy-evaluation-pipeline`, `strategy-notification-delivery`, `dev-backtest-api`
- Affected code: `libs/strategy/src/{trading,position,execution,pipeline,kernel,simulation}/**`, `apps/mist/src/strategy/{services,vo}/**`, `apps/signal/src/{health,realtime}/**`, `apps/notification/src/{delivery,trading}/**`, `apps/backtest/src/**`, `tools/strategy-dev/**`
- Zero breaking changes to active database schemas or public REST envelope shapes.
