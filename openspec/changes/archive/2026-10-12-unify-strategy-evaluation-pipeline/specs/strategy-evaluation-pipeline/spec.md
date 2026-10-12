## ADDED Requirements

### Requirement: Strategy Evaluation Shall Use A Single Production Pipeline

Realtime evaluation, simulation replay, and batch backtest SHALL evaluate strategies through the
same production bar-driven kernel: a pure push core (`push(bar) → per-bar incremental signals`)
containing the sliding window (`StrategySeriesImputer`) and the decision flow tree
(`DecisionFlowEvaluator` with `ChanBspFactorPlugin` as the chan buy/sell factor node). The kernel
SHALL determine the phase from the timeline: bars with
`timestamp < publicFrom` are pre-warm (silent evaluation, plugin cursors advance, no emission);
bars at or after `publicFrom` are public (emission). The three lanes SHALL differ only in
adaptation:

- source adaptation: `HistoricalBarSource` (backtest and simulation replay, historical K-lines
  streamed page by page) and `RealtimeSealedBarSource` (realtime sealed candle triggers), both
  push-mode with identical protocol;
- output adaptation: realtime persists alerts through the notification path; simulation replay
  emits SSE frames; batch backtest persists the complete result set to the database.

The realtime lane SHALL run one kernel instance per `(securityId, source, period)` group with all
plans of the group sharing the instance window; the shared window store semantics, pre-market
hydration, startup compensation, and scope retention SHALL move to the kernel instance pool. No
lane SHALL introduce an independent evaluation branch that bypasses the kernel.

#### Scenario: Realtime lane evaluates through the production kernel
- **WHEN** a sealed candle trigger arrives for an active strategy target
- **THEN** the group's kernel instance MUST advance exactly one bar and emit only per-bar
  incremental signals
- **AND** emitted signals MUST flow to alert persistence and delivery

#### Scenario: Simulation replay lane evaluates through the production kernel
- **WHEN** a local simulation session steps forward over historical bars
- **THEN** each step MUST drive the same kernel push core
- **AND** the frame MUST carry only the per-bar incremental signals

#### Scenario: Batch backtest lane evaluates through the production kernel
- **WHEN** a backtest run replays a security over a date range
- **THEN** every historical bar inside the replay range MUST advance the same kernel push core
- **AND** only incremental signals confirmed at bars within the public replay range MUST be
  persisted

### Requirement: Evaluation Kernel Shall Not Perform Delivery-Level Suppression

The `RealtimeEpisodeStore` episode dedup SHALL be deleted entirely (store, `decide`/`activate`
call sites in the realtime evaluation service, and the post-persistence activation in the sealed
candle job processor). The evaluation kernel SHALL emit the raw per-bar evaluation outcome and
SHALL NOT perform delivery-level dedup, suppression, or aggregation. Structural dedup remains
where it belongs: the `ChanBspFactorPlugin` monotonic cursor dedups chan buy/sell point
re-emission inside the plugin. A DSL guard that remains matched across consecutive bars SHALL
emit one raw signal per matched bar, identically in realtime and backtest. Delivery-level
suppression (dedup/aggregation/throttling) is the responsibility of a future independent
delivery engine and is out of scope here.

#### Scenario: Episode store is removed
- **WHEN** the realtime evaluation path executes after this change
- **THEN** no episode store, activation, or suppression logic MAY exist in the evaluation layer
- **AND** the sealed candle job processor MUST NOT activate any episode after persistence

#### Scenario: Consecutively matched DSL guard emits per bar in all lanes
- **WHEN** a compiled legacy DSL guard remains matched for consecutive bars inside the public
  range
- **THEN** the kernel MUST emit one raw signal per matched bar
- **AND** realtime and backtest MUST behave identically

#### Scenario: Chan buy/sell point re-emission stays plugin-deduped
- **WHEN** the `plugin.chan.bsp` factor plugin evaluates consecutive bars
- **THEN** its monotonic cursor MUST prevent re-emission of already-emitted structural points
- **AND** no delivery-level suppression MAY be reintroduced at the kernel or lane level

### Requirement: Bar Sources Shall Supply Pre-Warm Segments With Uniform Degradation

Pre-warm SHALL be an ordinary segment of the push stream before `publicFrom`, supplied by the
source adapter: `HistoricalBarSource` SHALL query the latest `requiredBarCount` bars strictly
before `publicFrom` at batch open; `RealtimeSealedBarSource` SHALL supply the hydration history
segment on window miss. When the pre-warm segment cannot be fully supplied, the adapter SHALL
NOT fail and SHALL NOT fabricate data: it SHALL push whatever bars exist and report
`prewarmStatus: full | partial{actual,expected} | empty` into run/session metadata. While the
window holds fewer bars than `requiredBarCount`, the kernel SHALL NOT evaluate to a match and
SHALL NOT emit, for all lanes identically (existing `insufficient_history` semantics).

#### Scenario: Sufficient history yields a fully warm window at the public start
- **WHEN** the backing store can supply the full pre-warm segment for a backtest run
- **THEN** the window MUST be complete when the first public bar arrives
- **AND** the run metadata MUST record `prewarmStatus: full`

#### Scenario: Sparse history degrades to progressive warm-up
- **WHEN** the pre-warm segment cannot be fully supplied (sparse source history, late-listed
  security, or source starting exactly at the replay start)
- **THEN** the run MUST NOT fail and MUST record `prewarmStatus: partial` or `empty` with the
  actual bar count
- **AND** the kernel MUST emit no signals until the window reaches `requiredBarCount`
- **AND** the same degradation path MUST apply identically to realtime cold starts

### Requirement: Legacy Strategy Definitions Shall Converge At The Compile Boundary

Stored strategy definitions of legacy kinds (`rule_dsl`, `chan_bsp`) SHALL be transparently
compiled into decision flow trees at the compile boundary by a shared compile helper in
`libs/strategy` (`LegacyStrategyCompiler` semantics): `rule_dsl` becomes a single GUARD tree
reusing the existing DSL evaluation semantics inside a factor plugin; `chan_bsp` becomes a
`plugin.chan.bsp` GUARD tree. Runtime execution plans SHALL have a single `decision_flow` shape;
the evaluation layer SHALL NOT dispatch on legacy kinds. Every compile site — the signal
registry, the backtest command service, and the local dev-server simulation session — SHALL use
the shared compile helper, so the locally tested compilation artifact is identical to the
production one. Creating new `chan_bsp` kind definitions SHALL be rejected with a bounded reason
while the `StrategyKind` enum value is retained for historical data and marked deprecated.

#### Scenario: A rule_dsl definition compiles to a decision flow tree
- **WHEN** the signal registry or the backtest command service compiles a stored `rule_dsl`
  version
- **THEN** it MUST produce a decision flow plan via the shared compile helper
- **AND** the DSL field/operator semantics MUST be preserved inside the compiled tree

#### Scenario: A chan_bsp definition compiles to a decision flow tree
- **WHEN** the signal registry or the backtest command service compiles a stored `chan_bsp`
  version
- **THEN** it MUST produce a decision flow plan whose guard uses the `plugin.chan.bsp` factor
  plugin with the stored units/direction/points parameters
- **AND** signals MUST carry trigger semantics on the confirming bar and pivot semantics on the
  structural extremum

#### Scenario: The dev-server simulation session compiles through the shared helper
- **WHEN** a local simulation session is created for a stored strategy version
- **THEN** the session MUST obtain its decision flow plan via the shared compile helper
- **AND** the locally tested compilation artifact MUST be identical to the production one

#### Scenario: Creating a new chan_bsp definition is rejected
- **WHEN** a client attempts to create or enable a strategy definition with
  `kind='chan_bsp'`
- **THEN** the request MUST be rejected with a bounded business reason

### Requirement: Signal Persistence Shall Carry Dual Timestamps

`backtest_signal_results` and `strategy_signals` SHALL carry a `pivot_time` column alongside
`signal_time`. `signal_time` SHALL keep trigger semantics (the confirming bar timestamp);
`pivot_time` SHALL hold the structural extremum time used for chart marker positioning. Existing
rows SHALL be backfilled with `pivot_time = signal_time`, which preserves current frontend marker
behavior under the existing fallback logic. API responses for backtest signals and realtime
signals SHALL expose `pivotTime`.

#### Scenario: Backtest signal rows carry pivot time
- **WHEN** a backtest signal result is persisted after this change
- **THEN** the row MUST store `pivot_time` from the decision evidence when present
- **AND** the backtest signals API response MUST include `pivotTime`

#### Scenario: Realtime signal rows carry pivot time
- **WHEN** a realtime candidate is persisted through the shared persistence service
- **THEN** the row MUST store `pivot_time` from the decision evidence when present
- **AND** the realtime signal query response MUST include `pivotTime`

#### Scenario: Historical rows are backfilled without behavior change
- **WHEN** migration 026 backfills existing rows
- **THEN** every existing row MUST get `pivot_time = signal_time`
- **AND** frontend marker positions for historical results MUST remain identical to the
  pre-migration rendering

### Requirement: Historical Backtest Review Shall Be Read-Only

Reviewing a completed backtest run SHALL read persisted results from the database through the
existing query API. It SHALL NOT recompute signals, re-run the evaluation kernel, or produce
evaluation side effects.

#### Scenario: Reviewing a completed run loads persisted signals
- **WHEN** the frontend requests the signal list of a completed backtest run
- **THEN** the API MUST return persisted `backtest_signal_results` rows only
- **AND** no evaluation or recomputation MAY be triggered by the review path

### Requirement: Existing Chan Bsp Definitions Shall Be Deactivated By Migration

Migration 026 SHALL set `status='disabled'` on all `strategy_definitions` rows with
`kind='chan_bsp'`. Definitions SHALL NOT be deleted. Reactivating a chan_bsp definition SHALL be
blocked by the creation/enabling guard; continued use requires converting the definition to a
decision flow kind.

#### Scenario: Migration deactivates chan_bsp definitions
- **WHEN** migration 026 executes against an environment with `kind='chan_bsp'` definitions
- **THEN** all such definitions MUST end with `status='disabled'`
- **AND** their versions and rule payloads MUST remain intact for audit

### Requirement: Pipeline Homogeneity Shall Be Enforced By A CI Guard

A guard spec in `libs/strategy` SHALL enforce pipeline homogeneity with two mechanisms:

1. static source scanning: `apps/signal`, `apps/backtest`, and `apps/mist` MUST NOT import
   `ChanBspDetector`, `ChanBspEpisodeCursor`, or `evaluateStrategyPlan` (allowlist: the
   `libs/signal` chan-bsp implementation library itself and `libs/strategy` plugins/compilers),
   and evaluation-layer code MUST NOT contain `kind === 'chan_bsp'` or `kind === 'rule_dsl'`
   runtime dispatch branches (compile boundaries, enum definitions, and migrations are allowed);
2. a runtime three-lane parity assertion: driving the same bar fixture through
   `HistoricalBarSource` → kernel, `RealtimeSealedBarSource` → kernel (with a fake market-data
   port), and the dev-server session driver MUST produce identical incremental signals
   (signalTime/pivotTime/signalType/triggerPrice).

#### Scenario: Static scan blocks independent branch reintroduction
- **WHEN** an app under `apps/` imports the chan-bsp detector, episode cursor, or the legacy DSL
  evaluator outside the allowlist, or reintroduces a legacy kind dispatch branch in the
  evaluation layer
- **THEN** the guard spec MUST fail and block CI

#### Scenario: Runtime parity keeps all three lanes aligned
- **WHEN** the same bar fixture is driven through the historical, realtime, and simulation
  drivers
- **THEN** the emitted incremental signals MUST match one-to-one on
  signalTime/pivotTime/signalType/triggerPrice

### Requirement: Replay-Based Integration Reconciliation Shall Be Available Locally

A repeatable reconciliation harness SHALL exist for local integration testing: a chosen
historical bar range is replayed through the full realtime infrastructure path (ingress → candle
productization → BullMQ → signal app → persistence) using the existing mysql-free mock mode, and
the persisted `strategy_signal` rows MUST be compared row by row against
`backtest_signal_results` produced by a backtest run over the same range, strategy version,
security, and period.

#### Scenario: Realtime replay matches backtest persistence
- **WHEN** the harness replays a historical range through the realtime infrastructure and a
  backtest run executes over the same range
- **THEN** the persisted signals MUST match one-to-one on
  signalTime/pivotTime/signalType/triggerPrice
- **AND** any mismatch MUST be reported with both rows' full field details
