# trading-engine Specification

## Purpose

Define the **Unified Trading Engine** (`Signal Layer → Unified Trading Engine` two-layer unidirectional architecture, consolidated 2026-11-26).

There is no separate standalone "Aggregation Layer → Trading Layer" split. The **Unified Trading Engine** encompasses the full downstream lifecycle after `StrategyEvaluationKernel` emits raw `KernelSignal`s:

1. **Aggregation**: signal persistence (`StrategySignal` / `StrategyAlertEvent`), pure deterministic grouping by `(securityId, effectiveTime)` (`groupSignals`), attribution trace assembly, and V2 fanout/channel delivery.
2. **Decision & Ledger**: deterministic rule-pipeline arbitration (`TradingEngine.decide` / `surveilBar`), pluggable position sizing (`SizingStrategy`, default `AllInWithBuffer(0.95)`), event-sourced integer-li virtual ledger (`virtual_fill_events` + `foldVirtualFills`), and pure-accounting state machines (`PositionStateMachine` + `CapitalLedger`).
3. **Matching**: `SimulatedBroker` (Next-Bar / Next-5m-Bar Open causal execution, A-share T+1, limit-up/limit-down queues, fees/slippage) for backtest/dev/research, or assumed-fill projection for realtime virtual ledger.
4. **Formal Instruction Output**: structured `TradeInstruction[]`, auditable `TradeRejection[]`, and unified **Trading Manual** rendering (`buildTradingManual`).
## Requirements
### Requirement: Two-Layer Unidirectional Architecture And Ledger Closure
The system SHALL operate as a strict two-layer unidirectional pipeline: **Signal Layer → Unified Trading Engine**.

- **Signal-Layer Virtual State Machine Boundary**: Strategy or plugin-owned virtual position state machines (e.g. `VirtualExitPolicyPort` implementations such as `PriceLevelExitPolicy` or external strategy exit policies) exist **solely to enable plugins to emit `KernelSignal`s (especially exit signals)**. They SHALL be self-maintained inside the signal layer with zero dependency on trading-engine cash balances, broker fills, or `virtual_fill_events`.
- **Real-Ledger Closure Inside Trading Engine**: Any risk exit, forced liquidation, or account-driven closure originating from the trading engine's real/virtual execution ledger (such as `systemicCrunch` surveillance or account-level risk checks) SHALL close strictly inside the trading engine and directly emit formal `TradeInstruction`s.
- **No Reverse Signal Or Ledger Injection**: The trading engine MUST NEVER emit signals back into the signal layer, and MUST NEVER inject `virtual_fill_events` or `AccountSnapshot` back into `VirtualExitPolicyPort` or signal-layer plugins.

#### Scenario: Trading engine rejects entry due to insufficient cash and later receives exit signal
- **WHEN** the signal layer emits an `ENTRY` signal (recorded by its strategy-scoped virtual state machine), the trading engine rejects that entry with `INSUFFICIENT_CASH`, and the signal layer subsequently emits a `VIRTUAL_EXIT` signal
- **THEN** the trading engine MUST reject the exit signal with structured reason `NO_POSITION` and render it visibly in the Trading Manual
- **AND** the trading engine MUST NOT mutate or feed account state back into the signal layer

#### Scenario: Trading engine triggers market-level risk exit
- **WHEN** `TradingEngine.surveilBar` detects a market-level risk condition (e.g. `SYSTEMIC_CRUNCH`) while the execution ledger holds an active position
- **THEN** the trading engine MUST produce the exit `TradeInstruction` and update its own execution ledger internally
- **AND** it MUST NOT emit any reverse signal or callback into `StrategyEvaluationKernel`

---

### Requirement: Unified Signal Grouping Inside Trading Engine
Signal grouping by `(securityId, effectiveTime)` SHALL be implemented as a single pure domain function `groupSignals` shared across realtime fanout (`apps/signal` / `apps/notification`) and offline pipeline execution (`runTradingPipeline`). Grouping SHALL NOT use timers or persist separate group tables; message time SHALL equal `effectiveTime`.

#### Scenario: Realtime and offline pipeline produce identical groups
- **WHEN** the same set of `KernelSignal`s with identical `securityId` and `effectiveTime` are processed by realtime fanout and `runTradingPipeline`
- **THEN** both paths MUST produce identical `SignalGroupInput` groupings with deterministic ordering

---

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

### Requirement: Event-Sourced Virtual Fill Ledger
Realtime execution SHALL persist accepted instructions as append-only fill facts in `virtual_fill_events` (migration 037: monetary columns `BIGINT` li, price `DECIMAL(10,3)`, unique index on `alert_event_id`).

- Account snapshots SHALL be reconstructed deterministically via `foldVirtualFills` using the same integer-li formulas as `PositionStateMachine` and `CapitalLedger`.
- Rejected signals SHALL NOT write rows to `virtual_fill_events`.
- Backtest, dev server, and offline research (`runTradingPipeline`) SHALL inject an ephemeral in-memory `VirtualFillLogPort` without touching TypeORM or MySQL.

#### Scenario: Delivery retry is idempotent
- **WHEN** the same `alert_event_id` is delivered more than once due to queue retry or process restart
- **THEN** `virtual_fill_events` MUST enforce uniqueness on `alert_event_id` and MUST NOT double-apply the fill to cash or positions

---

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

