## ADDED Requirements

### Requirement: Realtime Multi-Period Evaluation Shall Commit Cursor After Persistence And Batch Group Deliveries
`CandleFinalizedJobProcessor` SHALL aggregate persisted alert events across all derived bars emitted from a single sealed candle trigger and invoke `publishGroupedDeliveries` once outside the per-bar loop so timeframes closing on the same `effectiveTime` share one batch fanout enqueue without BullMQ `jobId` drops. Finalization cursors (`this.cursors`) SHALL advance only after evaluation and persistence commit succeed so transient failures remain retryable without silently skipping unpersisted bars.

#### Scenario: Concurrent multi-period closes share one grouped delivery fanout
- **WHEN** a sealed 1m trigger closes both `5m` and `30m` (or `1440m`) intervals on the same `effectiveTime` and strategies emit signals on both intervals
- **THEN** `publishGroupedDeliveries` MUST be invoked once with all persisted results combined
- **AND** no interval's alert event MAY be dropped by duplicate group fanout job identifiers

#### Scenario: Transient persistence failure allows idempotent BullMQ retry
- **WHEN** DB persistence rejects transiently before cursor advancement completes
- **THEN** `CandleFinalizedJobProcessor` MUST NOT advance `this.cursors` for the failed trigger
- **AND** retrying the same trigger MUST re-evaluate and complete persistence without losing signals

### Requirement: Realtime Period Builder Shall Retain Group State Across Refresh And Isolate Trading Days
`RealtimePeriodBuilder.retainGroups` SHALL match active `(securityId, source)` groups using the 2-segment group prefix of bucket keys so strategy registry refreshes preserve in-progress intraday and daily buckets. Daily aggregation buckets (`dailyPending`) SHALL isolate state by Shanghai trading day so missing terminal bars never bleed into subsequent trading days.

#### Scenario: Registry reload preserves in-progress intraday and daily buckets
- **WHEN** `retainGroups` executes with an unchanged active `(securityId, source)` target
- **THEN** active intraday `pending` and `dailyPending` aggregation buckets MUST NOT be cleared

#### Scenario: Missing daily close does not corrupt the next trading day
- **WHEN** a trading day's `dailyPending` slot lacks a closing trigger and the first bar of a new trading day arrives
- **THEN** `RealtimePeriodBuilder` MUST reset the stale prior-day `dailyPending` slot before accumulating the new trading day

### Requirement: Evaluation Kernel Shall Isolate Per-Plan Context, Attributes, And Factor Cursors
`StrategyEvaluationKernel` SHALL isolate `MissingContextSeriesError` exceptions per plan during context prefetch and evaluation so one plan's missing context series skips only that plan without aborting sibling plans, and SHALL give each plan evaluation a fresh shallow clone of `context.attributes`. `ChanBspFactorPlugin` monotonic dedup cursors SHALL be scoped by evaluation plan/node scope alongside `securityId`, `period`, `units`, `direction`, and point mask so independent flows or opposite directional branches never suppress one another.

#### Scenario: Missing external context fails closed per plan without crashing siblings
- **WHEN** two plans share `(securityId, source, period)` and only Plan A depends on a missing context series
- **THEN** Plan A MUST be skipped cleanly while Plan B evaluates and emits normally

#### Scenario: Separate flows or directional branches maintain independent chan cursors
- **WHEN** two plans (or two `ChanBspFactorPlugin` nodes with distinct scopes/directions/points) evaluate the same symbol and period
- **THEN** neither node's monotonic cursor advancement MAY suppress valid emissions on the sibling node

### Requirement: Virtual Exit Policy Lifecycle Shall Guard Numeric Inputs, Synchronize Composites, And Receive Prewarm Bars
`VirtualExitPolicyPort` implementations SHALL expose optional `onPrewarmBar?(bar, period)` and `onExternalExit?(proposal)` hooks. `StrategyEvaluationKernel` SHALL forward `isPreWarm` bars (including surveillance prewarm bars) to `onPrewarmBar` when defined. `PriceLevelExitPolicy` SHALL validate numeric rule and bar inputs with `Number.isFinite` so malformed `NaN` values cannot trigger exits. `CompositeVirtualExitPolicy` SHALL deduplicate same-bar exits by channel and notify the sibling policy via `onExternalExit` when either delegate exits a channel.

#### Scenario: NaN threshold prevents false exit on profitable bar
- **WHEN** a `trailing` rule omits `drawdownRatio` (yielding `undefined` / `NaN`) and a profitable bar arrives
- **THEN** `PriceLevelExitPolicy` MUST NOT trigger an accidental exit

#### Scenario: Composite policy synchronizes virtual lots across delegates
- **WHEN** either primary or fallback exit policy triggers an exit on channel `(definitionId, period)`
- **THEN** `CompositeVirtualExitPolicy` MUST notify the sibling policy via `onExternalExit`
- **AND** duplicate proposals for the same channel on the same bar MUST be suppressed

### Requirement: Simulation Session Shall Merge External Series By Availability Time
`StrategySimulationSession` SHALL merge external context bars in `seedPreWarm` and `stepNext` using `availabilityKey({ period, timestamp })` rather than raw `timestamp`, ensuring higher-period bars (e.g. `1440` daily bars) become visible to lower-period steps only at or after their causal availability boundary.

#### Scenario: Intraday step does not consume unreleased same-day daily bar
- **WHEN** simulating an intraday period (e.g. `30m` at `10:30`) alongside a `1440` daily bar whose raw timestamp is `00:00` and availability key is `15:01`
- **THEN** `StrategySimulationSession` MUST NOT push that daily bar into the kernel prior to the `15:01` boundary
