## MODIFIED Requirements

### Requirement: Deterministic Rule-Pipeline Arbitration And Integer-Li Arithmetic
`TradingEngine.decide(group, snapshot)` SHALL be a pure deterministic function with zero I/O, wall-clock calls, or randomness.

- **Two-Phase Exit-First Consolidation**: Within a `(securityId, effectiveTime)` signal group, the engine SHALL NOT rank or arbitrate signals by `confidence`. Instead, it SHALL partition signals by resolved intent and evaluate in two strict phases:
  1. **Phase 1 (`EXIT` Consolidation)**: Exclude any signal with `triggerPrice <= 0` as an individual `INVALID_PRICE` rejection; consolidate all remaining valid `EXIT` / `RISK_CUT` signals into **at most one full-exit `SELL` instruction** (carrying all contributing signals in `contributors` and electing a deterministic primary `idempotencyKey` anchor via numeric-aware anchor ordering without confidence). Cash released and position cleared by Phase 1 SHALL be immediately visible to Phase 2.
  2. **Phase 2 (`ENTRY` Consolidation)**: Exclude any signal with `triggerPrice <= 0` as an individual `INVALID_PRICE` rejection; consolidate all remaining valid `ENTRY` signals into **at most one `BUY` instruction** sized once via `SizingStrategy` (carrying all contributing signals in `contributors` and electing a deterministic primary `idempotencyKey` anchor).
- **Offline Idempotency Uniqueness**: Offline synthetic `idempotencyKey` generation across `runTradingPipeline`, `apps/backtest`, and `tools/strategy-dev` SHALL include `period` and `signalType` (`offline-${definitionId}-${period}-${signalTimeMs}-${signalKind}-${signalType}`) so multi-period alignment and virtual-exit co-occurrence on the same bar never collide.
- **Limit-Down Paired-Order Protection**: In `next_bar_open` matching (`SimulatedBroker`), if a `SELL` order for a security is marked `BLOCKED` due to one-word limit-down liquidity freeze on bar $t+1$, any paired `BUY` order for the same security scheduled in the same bar pass MUST be cancelled (`PAIRED_SELL_BLOCKED_LIMIT_DOWN`) rather than filling against residual cash.
- **Rule Pipeline**: Consolidated entry and exit intents SHALL flow through the unified `Rule = (ctx) => Verdict` pipeline with an explicit fallback rejection rule; silent signal dropping is forbidden (`TradeRejection` MUST carry a structured reason: `ALREADY_HOLDING`, `NO_POSITION`, `INSUFFICIENT_CASH`, `T1_FROZEN`, `SYSTEMIC_CRUNCH`, `LIQUIDITY_FREEZE`, `BELOW_LOT`, `INVALID_PRICE`, and attach `contributors` when a consolidated bucket is rejected).
- **Strategy-Owned Stop Loss**: Strategy-specific price stops and profit targets SHALL be evaluated in the signal layer via factor/virtual-exit plugins (`PriceDefenseExitPlugin` / `PriceLevelExitPolicy`), NOT hardcoded in trading-engine risk rules; engine-level bar surveillance retains only market-wide protection (`systemicCrunch`).
- **Integer-Li Arithmetic**: All monetary amounts inside the trading-engine core SHALL use integer li (`bigint`, 1 CNY = 1000 li), with a single half-up rounding boundary for fee calculation (`divHalfUp` / `applyRatioLi`).
- **Business-Key Derived IDs**: `instructionId` (`ti-{idempotencyKey}`), `orderId` (`ord-{idempotencyKey}`), and `eventId` (`fill-{idempotencyKey}`) SHALL derive deterministically from the primary contributor's idempotency anchor; `Date.now()`, RNG, and mutable auto-increment counters are forbidden.

#### Scenario: Multiple same-timestamp EXIT and ENTRY signals consolidate without false rejections
- **WHEN** a `(securityId, effectiveTime)` group contains 2 valid `EXIT` signals and 2 valid `ENTRY` signals while holding a T+1 unlocked position
- **THEN** `TradingEngine.decide` MUST emit exactly 1 consolidated `SELL` instruction carrying both exit signals in `contributors`
- **AND** using the released cash, it MUST emit exactly 1 consolidated `BUY` instruction carrying both entry signals in `contributors`
- **AND** `decision.rejections` MUST be empty (zero false `NO_POSITION` or `ALREADY_HOLDING` rejections)

#### Scenario: Corrupted zero-price signal does not poison valid resonant peers
- **WHEN** a group contains 2 `ENTRY` signals where Signal A has `triggerPrice = 12.5` and Signal B has `triggerPrice = 0`
- **THEN** Signal B MUST be emitted as an individual `INVALID_PRICE` rejection
- **AND** Signal A MUST proceed normally to produce a `BUY` instruction

#### Scenario: Primary anchor selection is numeric-aware and confidence-free
- **WHEN** realtime delivery consolidates `alertEventId` `"10"` and `"2"` of the same direction
- **THEN** the engine MUST select `"2"` (numerically smallest positive integer) as the primary `idempotencyKey` anchor written to `virtual_fill_events`
- **AND** both signals MUST appear in deterministic order inside `contributors`

#### Scenario: Limit-down blocked sell cancels paired buy on next-bar open
- **WHEN** a group emits a paired `SELL` and `BUY` instruction for the same security and bar $t+1$ opens at one-word limit-down
- **THEN** `SimulatedBroker` MUST defer the `SELL` order as `BLOCKED`
- **AND** MUST cancel the paired `BUY` order with reason `PAIRED_SELL_BLOCKED_LIMIT_DOWN` without consuming residual cash

#### Scenario: Deterministic replay and golden verification
- **WHEN** `TradingEngine.decide` is replayed N times with the same `SignalGroupInput` and `AccountSnapshot`
- **THEN** every run MUST return a deep-equal `TradingDecision`
- **AND** any behavioral change MUST be explicitly reviewed against versioned golden fixtures (`libs/strategy/src/trading/__fixtures__/`)

### Requirement: Four-Path Isomorphism And Formal Trading Manual Output
All four execution paths — backtest (`apps/backtest`), realtime (`apps/notification`), local dev gateway (`tools/strategy-dev`), and offline research (`runTradingPipeline`) — SHALL share the identical `TradingEngine`, `groupSignals`, consolidation module, and Trading Manual renderer (`buildTradingManual`).

- Given an identical `SignalGroupInput` and `AccountSnapshot`, all adapters MUST produce field-for-field identical `TradingDecision` outputs (guarded by CI isomorphism tests).
- The formal Trading Manual SHALL render the account header (available cash & positions), ordered instruction lines (`▶`, exits before entries, with compact `decisionTrace` attribution chain(s) and resonance contributor listing when `contributors.length > 1`), and explicit rejection lines (`✗`, with structured rejection reason). It SHALL NOT render any confidence percentage or confidence level badge.
- Legacy `ExecutionRiskArbiter`, `PositionStateMachine.onSignal`, legacy `ExitPolicyPort`, `sellFirstByConfidence` (`GroupOrderingStrategy`), and legacy signal-list envelope rendering SHALL remain permanently retired with zero production references.

#### Scenario: Trading manual includes both accepted instructions and rejections
- **WHEN** a signal group yields one accepted exit instruction and one rejected entry signal
- **THEN** `buildTradingManual` MUST render the account summary header, the `▶` exit instruction line with its attribution trace, and the `✗` rejection line with its structured reason

#### Scenario: Trading manual renders consolidated resonance without confidence badges
- **WHEN** a signal group consolidates 2 `BUY` signals into 1 instruction and rejects 1 zero-price signal
- **THEN** `buildTradingManual` MUST render the account summary header, 1 `▶` buy instruction listing both resonant contributors and their attribution trace chains, and 1 `✗` rejection line for `INVALID_PRICE`
- **AND** the output MUST NOT contain any `[HIGH ...]`, `[MEDIUM ...]`, `[LOW ...]`, or `%` confidence badge
