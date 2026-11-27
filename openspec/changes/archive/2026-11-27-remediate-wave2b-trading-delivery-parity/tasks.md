# Tasks: Remediate Wave 2B Trading Engine, Four-Path Parity, Delivery & Runtime Integrity

## 1. Trading Engine, Sizing, Ledger & Broker Performance (`libs/strategy/src/{trading,position,execution,pipeline}`)
- [x] 1.1 Extract `recomputeNextBarOpenBuyQuantity` in `libs/strategy/src/trading/sizing.ts` with `macroRegime`, `feeConfig`, `feeEnabled`, `requestedQuantity` cap, and `allowFractionalShares`, and wire into `runTradingPipeline` (`[BUG-MAIN-PIPELINE-01]`).
- [x] 1.2 Extract `createVirtualFillAccumulator` in `libs/strategy/src/trading/account-fold.ts` and switch `runAssumedClosePipeline` from $O(G \cdot F)$ re-fold to $O(1)$ incremental apply.
- [x] 1.3 Fix `consolidation.ts` (`resolveIntent`), `domain.types.ts` (contributor metadata), `engine.ts` (`accumulatedBuyFeesLi` proportional buy-fee basis & `realizedPnlLi` preservation), `manual.ts` (`securityId` lookup & `resolveIntent`), `PositionStateMachine` scale-in `entryTime` refresh, and `SimulatedBroker.onBar` empty-queue fast path.
- [x] 1.4 Add unit/regression tests and verify golden & trading suites pass.

## 2. Mappers, VO, Realtime Services & Notification Delivery (`libs/strategy/src/{kernel,simulation}`, `apps/{mist,signal,notification}`)
- [x] 2.1 Update `signal-persistence-mapper.ts` (`pivotPrice`, `badgeText`, `displayTag`, `styleMeta`, `triggerPeriod`) and `kernel-signal-mapper.ts` (`resolveIntent`, non-fabricated `pivotTime`/`pivotPrice`, trace filtering).
- [x] 2.2 Remove `...signal` TypeORM spread in `StrategySignalService` & add complete `StrategySignalVo` fields (`signalType`, `pivotPrice`, `badgeText`, `displayTag`, `styleMeta`, `triggerPeriod`, `effectiveTime`).
- [x] 2.3 Inject DI singleton `RuntimeObservabilityService` in `HealthStateService`, guard `SignalPreMarketWarmupService` with `SignalRuntimeMutex`, and optimize `LiveStrategyPersistenceService` batch/timeout handling cleanly.
- [x] 2.4 Update `AlertChannelDeliveryService` (per-`securityId` mutex, write virtual fill only after `sent`, real `pivotTime`/`pivotPrice`, pass `securityId` to `buildTradingManual`), `AlertReplayService` (reset `PENDING` before enqueue), and `VirtualFillLogService.loadBySecurity` (project columns without `instruction`).

## 3. Backtest Executor & Dev Gateway Parity (`apps/backtest`, `tools/strategy-dev`)
- [x] 3.1 Align `BacktestRunExecutor` (`recomputeNextBarOpenBuyQuantity`, `macroRegime` into `surveilBar`/`decide`, `effectiveTime = availabilityKey(...)`).
- [x] 3.2 Align `tools/strategy-dev/server.ts` (shared `recomputeNextBarOpenBuyQuantity`, `macroRegime`, `effectiveTime = availabilityKey(...)`, preserve `navSeries` on cache hit, populate `ruleSnapshot` & `externalContextRequirements`, remove fabricated `pivotTime` fallback).

## 4. Validation & Dual-Repo Gate
- [x] 4.1 Run `openspec validate remediate-wave2b-trading-delivery-parity --strict --no-interactive`.
- [x] 4.2 Run `mist` `typecheck`, `lint:check`, `check:magic`, `ci:contracts`, `tools/strategy-dev` Jest, `test:ci` (plus out-of-sandbox HTTP loopback specs).
- [x] 4.3 Verify downstream external plugin parity (`build`, `typecheck`, `test`, and `test:baseline` live-pipeline regression).
