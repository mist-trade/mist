# Design: Wave 2B Trading Engine, Four-Path Parity, Delivery & Runtime Integrity

## Key Architectural Decisions

### 1. Shared Pure Next-Bar Open Recompute Helper (`recomputeNextBarOpenBuyQuantity`)
- Rather than duplicating Next-Bar high-open sizing adjustments across `runTradingPipeline`, `BacktestRunExecutor`, and `tools/strategy-dev/server.ts`, place a single pure integer-li helper `recomputeNextBarOpenBuyQuantity` in `libs/strategy/src/trading/sizing.ts` (re-exported via `@app/strategy`).
- Parameters: `{ cashLi, fillPriceLi, requestedQuantity, cashAllocationRatio, lotSize, securityCode, feeEnabled, feeConfig?, macroRegime?, allowFractionalShares? }`.
- Behavior:
  - Evaluates `createAllInWithBuffer(cashAllocationRatio)({ cashLi, priceLi: fillPriceLi, macroRegime, lotSize })` so `ELEVATED_RISK` halving matches Phase 2 decision sizing;
  - Steps down by `lotSize` until `fillPriceLi * qty + feesLi <= cashLi` (respecting custom `feeConfig` / `feeEnabled`);
  - Caps at `requestedQuantity` so a lower next-bar open does not silently expand position size beyond the signal-bar decision.

### 2. Incremental Virtual-Fill Account Accumulator (`createVirtualFillAccumulator`)
- Extract `createVirtualFillAccumulator(seedCapitalLi, initialTradingDay)` inside `libs/strategy/src/trading/account-fold.ts`.
- `foldVirtualFills(events, seedCapitalLi, currentTradingDay)` becomes a thin wrapper iterating `events` once through the accumulator.
- `runAssumedClosePipeline` instantiates the accumulator once and calls `acc.apply(fill)` per accepted fill, reducing complexity from $O(G \cdot F)$ to $O(G + F)$ while guaranteeing bit-for-bit identical integer-li snapshots.

### 3. Ledger & State Alignment (`TradingEngine`, `PositionStateMachine`, `SimulatedBroker`)
- `TradingPositionState` tracks optional `accumulatedBuyFeesLi?: Li` so `TradingEngine` entry/exit accounting allocates proportional buy fees on partial exits and accumulates cross-round `realizedPnlLi` cleanly, matching `foldVirtualFills` (only setting when missing = `0n` for backwards-compatible fixtures).
- `consolidation.ts` and `manual.ts` resolve direction strictly through `resolveIntent(signal)` (so `RISK_CUT` and explicit intent overrides behave identically across sorting, bucketing, and rendering).
- `manual.ts` uses `input.securityId` when provided and avoids guessing `[0]` across ambiguous multi-security position maps.
- `PositionStateMachine` refreshes `entryTime` on scale-in `BUY` fills while preserving existing holding-bar accounting and weighted average cost.
- `SimulatedBroker.onBar` performs an early check on `pendingOrders.size === 0` after updating `prevCloseMap` / `lastBarDateMap` / `lastBarCloseMap` / `dailyPreCloseMap` so idle bars avoid `Set` / filter / string allocations.

### 4. Delivery Ordering, Concurrency, and Replay Ordering (`apps/notification`)
- `AlertChannelDeliveryService` serializes group runs sharing the same `securityId` via an in-process per-`securityId` promise tail chain so concurrent deliveries cannot compute overlapping virtual snapshots.
- `AlertChannelDeliveryService` splits pure decision/rendering from `appendAssumedFill`, writing virtual fills only after `adapter.send(...)` returns `status === 'sent'`. Sibling/retry safety remains enforced by `unique(alert_event_id)` in `virtual_fill_events`.
- `toSignalInput` preserves `pivotTime` and `contextSnapshot.pivotPrice`; `buildTradingManual` receives `securityId`.
- `AlertReplayService` updates `alertEvents` to `PENDING` before enqueueing channel replay jobs to eliminate race overwrites.
- `VirtualFillLogService.loadBySecurity` explicitly selects columns needed for `foldVirtualFills`, excluding bulky `instruction` JSON payloads.

### 5. Mappers, VO Projection, Runtime DI, Backtest & Dev Gateway Parity
- `SignalPersistencePayload` & `mapKernelSignalToPersistencePayload` carry `pivotPrice`, `badgeText`, `displayTag`, `styleMeta`, and `triggerPeriod` inside `contextSnapshot` and typed payload fields.
- `kernel-signal-mapper.ts` determines buy intent from `resolveIntent`, preserves `null` for missing `pivotTime`/`pivotPrice`, and extracts compact trace chains filtering out failed (`passed === false`) and `EXTRACTOR` nodes.
- `StrategySignalService` maps explicit VO properties via `StrategySignalVo.fromEntity` without leaking raw TypeORM entities via `...signal`.
- `HealthStateService` injects `@Optional() @Inject(RuntimeObservabilityService)` with default fallback for isolated unit tests; `SignalPreMarketWarmupService` runs under `@Optional() SignalRuntimeMutex`.
- `BacktestRunExecutor` and `tools/strategy-dev/server.ts` both use `availabilityKey` for `effectiveTime`, pass `macroRegime` into `surveilBar` / `decide`, reuse `recomputeNextBarOpenBuyQuantity`, and fix `server.ts` cached `navSeries`, `ruleSnapshot`, `externalContextRequirements`, and fake pivot fallbacks.
