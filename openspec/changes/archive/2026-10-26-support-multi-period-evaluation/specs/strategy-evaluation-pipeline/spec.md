# strategy-evaluation-pipeline Specification Delta

## MODIFIED Requirements

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

The kernel SHALL maintain one independent sliding window per declared period, each with its own
monotonic duplicate guard. Each execution plan SHALL declare one evaluation period (its own
period) and, derived from factor plugin requirements at the compile boundary, an optional set of
context periods with minimum retained bar counts. The kernel SHALL route each pushed bar into the
window of the bar's period and SHALL evaluate a plan only when the pushed bar's period equals
that plan's evaluation period. The realtime lane SHALL run one kernel instance per
`(securityId, source)` group with all plans of the group sharing the instance's per-period
windows; the shared window store semantics, pre-market hydration, startup compensation, and scope
retention SHALL move to the kernel instance pool. No lane SHALL introduce an independent
evaluation branch that bypasses the kernel.

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

#### Scenario: A context-period bar advances its window without evaluating the plan
- **WHEN** a bar whose period differs from a plan's evaluation period is pushed
- **THEN** the kernel MUST incorporate that bar into its own period window only
- **AND** it MUST NOT evaluate that plan on that bar

#### Scenario: Duplicate guards are per period
- **WHEN** bars of different declared periods share one timestamp label (for example the sealed
  1m bar, the derived 30m bar and the daily bar of one session close)
- **THEN** the per-period duplicate guards MUST each decide on their own period's label
- **AND** no group-level or kernel-wide last-timestamp guard MAY drop a same-label bar of another
  period

## ADDED Requirements

### Requirement: Multi-Period Series Shall Merge In Availability Order

Mixed-period series use two provider-native label conventions: 1m bars are left-labeled (bucket
start, identical between the producer and 1m history) while 5/15/30/60m canonical bars are
right-labeled (bucket end) and canonical daily bars are labeled the trading day's 00:00. Raw
timestamp ordering across these conventions is not causal. Every bar SHALL therefore expose an
availability key — the instant at which its content is sealed: `label + period` for left-labeled
1m, `label` for right-labeled 5/15/30/60m except session-end labels (`11:30`, `15:00`) which seal
with their terminal constituent (`label + 1 minute`), and `15:01` for the daily bar whose last
constituent is the 15:00 terminal bucket. The backtest merge SHALL order the push stream by
(availability key ascending, period ascending), which MUST equal the realtime trigger arrival
order. Context snapshots SHALL be the windows' pushed content — push order itself MUST be the
only causality mechanism; no raw-timestamp snapshot filter MAY be reintroduced. The availability
key SHALL govern ONLY data availability: merge order, window retention and context snapshots. It
MUST NOT gate, delay, filter or suppress signal emission or persistence — emission happens at the
evaluation bar exactly as in the single-period kernel, and signal-side causality (decision at t,
next-bar execution at t+1) remains owned by the execution layer.

#### Scenario: Same-availability bars are pushed lower period first
- **WHEN** the 5m and 30m bars labeled 10:00 of one trading day share the availability key 10:00
- **THEN** the 5m bar MUST be pushed before the 30m bar
- **AND** the 30m evaluation at 10:00 MUST observe the 10:00 5m bar in its context snapshot

#### Scenario: The next 1m minute is not visible to a slot-end evaluation
- **WHEN** a 5m plan evaluates on the bar labeled 09:35 (covering 09:30–09:35)
- **THEN** the 1m bar labeled 09:35, whose availability key is 09:36, MUST NOT be in the context
  snapshot
- **AND** the 1m bar labeled 09:34, whose availability key is 09:35, MUST be the last 1m bar in
  the snapshot

#### Scenario: A higher-period bar closes after the evaluation bar
- **WHEN** a 30m plan evaluates at 15:00 and its context declares the daily period
- **THEN** the trading day's daily bar MUST NOT be visible to that evaluation
- **AND** the daily context snapshot MUST end at the previous trading day's bar

#### Scenario: The daily 00:00 label does not leak forward
- **WHEN** the canonical daily series is merged with intraday series of the same security
- **THEN** each daily bar MUST be ordered by its availability key `15:01` of its trading day,
  never by its raw `00:00` label
- **AND** a backtest pre-warm selection for a daily context period MUST include only daily bars
  whose availability key is not after the public boundary

#### Scenario: Context snapshots are read-only
- **WHEN** the kernel builds the evaluation context for a plan
- **THEN** every `series.<period>` attribute MUST be a read-only view of that period's window
- **AND** a plugin MUST NOT mutate the exposed series

### Requirement: Declared Context Demand Shall Gate Plan Evaluation

The kernel SHALL treat a declared context period as part of the plan's readiness demand. While
any declared context window holds fewer bars than its compiled minimum, the kernel MUST NOT
evaluate that plan, MUST NOT emit for it, and MUST record the skip through bounded diagnostics.
This gate SHALL apply identically to pre-warm silent evaluation, public evaluation, and all three
lanes.

#### Scenario: A declared context window is short
- **WHEN** a plan declares `contextRequirements { 5: 120 }` and the 5m window holds 90 bars at an
  evaluation bar of the plan's period
- **THEN** the kernel MUST NOT evaluate that plan on that bar
- **AND** it MUST NOT emit a signal for that plan
- **AND** it MUST record a bounded insufficient-context diagnostic

#### Scenario: A context window reaches its compiled minimum
- **WHEN** later bars raise every declared context window to its compiled minimum
- **THEN** the plan MUST become eligible from the next evaluation bar of its period
- **AND** the kernel MUST use the incrementally maintained windows rather than reload history

#### Scenario: A plugin reads an undeclared context series
- **WHEN** a factor plugin reads a `series.<period>` attribute that the plan did not declare
- **THEN** the plugin evaluation MUST fail with a bounded missing-context error
- **AND** the kernel MUST skip that plan for the current bar with a bounded diagnostic
- **AND** the failure MUST NOT be converted into a neutral opinion, a matched signal, or a group
  crash

#### Scenario: The availability key never touches the signal side
- **WHEN** a plan evaluates at its evaluation bar under a multi-period merge
- **THEN** the emitted signal MUST NOT be filtered, delayed, reordered or suppressed by the
  availability key or any ordering rule
- **AND** signal emission, persistence and delivery MUST behave exactly as in the single-period
  kernel
- **AND** execution-side causality (next-bar matching, T+1) remains owned by the execution layer
