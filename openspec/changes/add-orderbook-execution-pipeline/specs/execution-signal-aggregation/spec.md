# execution-signal-aggregation Specification

## Purpose
Define how confirmed strategy signals from any number of public and private strategy channels are
normalized, de-duplicated, conflict-resolved, budgeted, and converted into deterministic
`AggregatedOrderPlan` records, without feeding portfolio state back into the strategy layer.

## ADDED Requirements

### Requirement: Execution Inputs Shall Be Confirmed Events Or Execution-Layer Risk Actions

The execution domain SHALL consume confirmed tactical events, execution-layer risk actions
(hard stop, portfolio drawdown cut), and manual kill/exit commands. Raw `KernelSignal` values,
state-only factor opinions, and unconfirmed plugin outputs SHALL NOT create execution intents.
Execution-layer risk actions and manual commands SHALL be marked with `source = RISK_ENGINE` or
`MANUAL` and SHALL take precedence over strategy intents.

#### Scenario: Confirmed tactical event becomes an intent
- **WHEN** a `TacticalEvent` is confirmed for a security
- **THEN** exactly one `ExecutionSignal` SHALL be derived from it
- **AND** its `signalTime`, `triggerPrice`, `pivotPrice`, `confidence`, `signalChannelKey`, and
  `ledgerGroupKey` SHALL be preserved
- **AND** the intent SHALL be persisted in the same database transaction as the corresponding
  `StrategySignal` (and its `StrategyAlertEvent` when alerting is enabled).

#### Scenario: Raw kernel signal is not executable
- **WHEN** a `KernelSignal` is emitted without a corresponding confirmed tactical event
- **THEN** no execution intent SHALL be created
- **AND** the signal MAY still be persisted and alerted according to existing behavior.

#### Scenario: Execution-layer risk cut
- **WHEN** the execution risk engine detects a hard stop or portfolio drawdown limit
- **THEN** it SHALL create a `RISK_CUT` intent with `source = RISK_ENGINE`
- **AND** the intent SHALL be executed with `URGENT` urgency without waiting for a strategy signal
- **AND** it SHALL NOT be suppressed by `EXIT_FIRST` buy-side logic.

### Requirement: Execution Shall Use An Actionable Timestamp Independent Of Bar Timestamp

Because a strategy bar's timestamp is its bucket start, the execution domain SHALL order and gate
intents by `emittedAt` (the time the sealed candle makes the signal actionable), not by
`signalTime` alone. Replays SHALL use recorded `emittedAt` and `receivedAt` values and SHALL NOT
substitute wall-clock time.

#### Scenario: 30-minute signal emitted at the 1-minute seal
- **WHEN** a 30-minute strategy signal whose `signalTime` is 10:00 becomes actionable at 10:30
- **THEN** its `emittedAt` SHALL be the 10:30 actionable timestamp
- **AND** it SHALL aggregate with other signals whose `emittedAt` is 10:30, not with signals
  whose `signalTime` is 10:00.

#### Scenario: Deterministic replay
- **WHEN** the same intent stream is replayed
- **THEN** aggregation SHALL use the recorded `emittedAt` ordering
- **AND** the resulting `planId` and allocation quantities SHALL be byte-for-byte identical across
  processes and machines.

### Requirement: Channel Identity And Ledger Ownership Shall Be Separate

The system SHALL distinguish `signalChannelKey` (the emitting definition and evaluation period)
from `ledgerGroupKey` (the position-owning account). By default, each strategy definition SHALL own
one ledger group across all of its periods. A private configuration MAY map multiple definitions to
one ledger group.

#### Scenario: Same definition on multiple periods
- **WHEN** one definition runs on 1-minute and 30-minute periods and both emit an entry at the same
  aggregation epoch
- **THEN** both intents SHALL belong to the same `ledgerGroupKey`
- **AND** the group's requested entry quantity SHALL be the maximum of the two requests, not their
  sum.

#### Scenario: Public entry and private exit share a ledger group
- **WHEN** private configuration maps a public entry definition and a private exit definition to
  one `ledgerGroupKey`
- **THEN** the exit intent SHALL be evaluated against the shared group position
- **AND** the fill SHALL be attributed to that shared group.

### Requirement: Aggregation Shall Be Deterministic And Idempotent

The aggregation engine SHALL process intents in a total order of
`(emittedAt, ledgerGroupKey, intentId)`, SHALL use `Decimal8` arithmetic, SHALL NOT use random
numbers or wall-clock time, and SHALL make repeated processing of the same `intentId` a no-op.

#### Scenario: Duplicate delivery
- **WHEN** the same `intentId` is delivered more than once
- **THEN** only the first processing SHALL affect the plan
- **AND** subsequent deliveries SHALL be recorded as `DUPLICATE` without changing any quantity or
  ledger balance.

#### Scenario: Late arrival within the epoch window
- **WHEN** an intent with the same `emittedAt` arrives within the configured `epochLatenessMs`
- **THEN** it SHALL be included in the epoch before the plan is emitted
- **AND** an intent arriving after the epoch closes SHALL be recorded as `LATE` and SHALL NOT
  retroactively change the already-emitted plan.

#### Scenario: Deterministic pro-rata allocation
- **WHEN** a buy plan must be scaled to a portfolio cap across multiple ledger groups
- **THEN** allocations SHALL be rounded down to lots
- **AND** remaining lots SHALL be distributed by largest fractional remainder, with ties broken by
  ascending `ledgerGroupKey`.

### Requirement: Aggregation Shall Reconcile Stateless Signals Against Ledger State

The execution domain SHALL suppress signals that are no-ops for the owning ledger group, without
mutating the strategy evaluation context.

#### Scenario: Entry while already holding
- **WHEN** an `ENTRY` intent arrives for a ledger group that already has a positive position
- **THEN** it SHALL be suppressed with reason `ALREADY_HOLDING`
- **AND** the strategy layer SHALL NOT be informed of the position.

#### Scenario: Exit without position
- **WHEN** an `EXIT` intent arrives for a ledger group with no position
- **THEN** it SHALL be suppressed with reason `NO_POSITION`.

#### Scenario: Exit under T+1 lock
- **WHEN** an `EXIT` intent arrives for a ledger group whose entire position was bought on the same
  trading day
- **THEN** it SHALL be deferred with reason `T1_LOCKED`
- **AND** it SHALL be reconsidered on the next trading day if still unexpired.

### Requirement: Conflicting Directions Shall Default To Exit-First

When buy and sell intents for the same security exist in the same aggregation epoch, the system
SHALL execute the sell side first and suppress the buy side with `CONFLICT_EXIT_FIRST`, unless an
explicitly configured alternative policy applies. A `RISK_CUT` intent SHALL take precedence over all
other intents for that security.

#### Scenario: Buy and sell in the same epoch
- **WHEN** one ledger group emits `BUY` and another emits `SELL` for the same security at the same
  `emittedAt`
- **THEN** the sell plan SHALL be emitted
- **AND** the buy intents SHALL be suppressed with `CONFLICT_EXIT_FIRST`
- **AND** the buy intents SHALL remain pending until `expiresAt` for a later epoch.

#### Scenario: Risk cut overrides entries
- **WHEN** any `RISK_CUT` sell intent exists for a security
- **THEN** all sell intents for that security SHALL be executed with `URGENT` urgency
- **AND** buy intents SHALL be suppressed with `RISK_CUT_ACTIVE` according to the intent's
  `riskScope`: `SECURITY` SHALL suppress all buys for that security, `GROUP` SHALL suppress only
  buys belonging to the same ledger group
- **AND** a `SECURITY` scope SHALL keep the security risk-blocked for entries until the affected
  groups are flat or the configured cooldown expires.

#### Scenario: Netted mode is opt-in
- **WHEN** the configured conflict policy is `NET`
- **THEN** opposite directions MAY be netted per ledger group
- **AND** any fully offsetting group SHALL be recorded as suppressed with `NETTED_OUT`.

### Requirement: Sizing Shall Respect Group Budgets And Portfolio Limits

The aggregation engine SHALL size entries from a per-ledger-group budget and SHALL apply portfolio
limits before emitting a plan. The default budget mode SHALL be equal weight across groups with
pending entries; `FIXED_NOTIONAL` and `STRATEGY_HINT` SHALL be configurable.

#### Scenario: Group budget
- **WHEN** a ledger group receives an `ENTRY` intent with no explicit size
- **THEN** its target quantity SHALL be the largest lot-aligned quantity whose notional does not
  exceed its allocated budget.

#### Scenario: Single-name cap
- **WHEN** the sum of requested buy quantities would exceed the single-name weight limit
- **THEN** the plan SHALL be scaled down pro-rata across ledger groups
- **AND** any group reduced below one lot SHALL be removed with reason `CAPACITY`.

#### Scenario: Insufficient cash
- **WHEN** available cash after the configured buffer cannot fund the requested buy
- **THEN** the plan SHALL be reduced to the largest fundable lot-aligned quantity
- **AND** if no lot can be funded, all buy intents SHALL be suppressed with `CAPACITY`.

### Requirement: Every Suppressed Intent Shall Be Auditable

The system SHALL persist one suppression record per suppressed intent, including its reason code,
the aggregation epoch, the plan it belonged to (if any), and the ledger group state that caused the
suppression.

#### Scenario: Suppression persistence
- **WHEN** an intent is suppressed for any reason
- **THEN** a record with `intentId`, `reason`, `asOf`, and `ledgerGroupKey` SHALL be written
- **AND** the record SHALL be queryable for post-trade review.

### Requirement: Aggregation Shall Be Origin-Neutral

The aggregation engine SHALL NOT use `origin` (public/private), plugin identity, strategy name, or
`originPluginId` to decide direction, size, priority, or suppression. Such fields MAY be recorded
for observability only.

#### Scenario: Public and private channels are equal
- **WHEN** a public channel and a private channel emit the same-direction entry at the same epoch
- **THEN** both SHALL be subject to the same budget and cap rules
- **AND** neither SHALL receive implicit priority based on origin.

### Requirement: Execution Intent Delivery Shall Be At-Least-Once With Idempotent Consumption

The signal application SHALL write an execution outbox record in the same transaction as the
signal and alert, and SHALL publish it after commit. A sweeper SHALL republish unpublished records.
The execution application SHALL deduplicate by `intentId`.

#### Scenario: Publish failure after commit
- **WHEN** the post-commit publish fails
- **THEN** the intent SHALL remain in the outbox with an unsent status
- **AND** a later sweep SHALL republish it
- **AND** the execution application SHALL process it exactly once.

#### Scenario: Consumer restart
- **WHEN** the execution application restarts with unacknowledged intents in the stream
- **THEN** it SHALL reprocess them idempotently
- **AND** no duplicate plan or order SHALL be created for an already-processed `intentId`.
