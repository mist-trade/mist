## Context

Mist already has the lower layers needed by a quant platform: K-line storage,
technical indicators, Chan Theory analysis, data collection, datasource
integration, frontend deployment, and AstrBot-facing query skills. The missing
product layer is the strategy platform: reusable strategy definitions, signal
generation, alert delivery, and historical validation.

This roadmap belongs in `mist/openspec` because `mist` owns the central backend
contracts and is already the authority for cross-repository capability specs.
It is separate from `define-mist-production-roadmap`, which governs production
stability rather than product-scope expansion.

## Goals / Non-Goals

**Goals:**

- Define the product capability sequence for strategy registration, signal
  alerts, and signal-level backtesting.
- Require one shared strategy definition model so live alerts and backtests do
  not drift into separate rule systems.
- Keep every implementation step independently spec-able, testable, and
  archivable.
- Preserve repository boundaries across backend, frontend, skills, and
  monitoring work.
- Make the first phase auditable and deterministic by using declared rule
  expressions instead of arbitrary user code.

**Non-Goals:**

- Implement backend entities, migrations, APIs, schedulers, frontend screens,
  AstrBot commands, or datasource changes in this roadmap change.
- Support arbitrary user-provided JS, Python, or SQL strategy code in the first
  phase.
- Implement portfolio-level backtesting, order simulation, capital curves,
  fees, slippage, or execution modeling in the first backtesting phase.
- Rework existing collector `DataCollectionStrategy` classes or TDX/QMT
  datasource strategy identity handling.
- Treat alert delivery through AstrBot as a replacement for persisted backend
  signal and alert events.

## Decisions

### Decision 1: Create a strategy-platform roadmap, not one broad feature change

The strategy platform spans data modeling, rule validation, scheduled execution,
event storage, notification delivery, historical replay, API contracts, and UI.
The parent change will only define decomposition and readiness gates; each
runtime capability enters its own child OpenSpec change.

Alternative considered: implement strategy registration, alerts, and backtests
in one change. That would couple runtime scanning and historical replay before
the shared strategy model is stable.

### Decision 2: Build a shared strategy definition foundation first

The first child change should define strategy identity, versioning, lifecycle,
target universe, period coverage, rule expression shape, validation, and audit
fields. Realtime scanning and backtesting must both consume this definition.

Alternative considered: let alerts define their own rule model first and adapt
backtesting later. That risks different semantics between live and historical
execution.

### Decision 3: Use declaration-first strategy rules for the first phase

Initial strategies should combine known backend data and computed values, such
as K-line fields, indicators, Chan Theory outputs, and security metadata. The
rule language should be persisted, validated, and replayable.

Alternative considered: allow user-provided code strategies. That is more
flexible, but it introduces sandboxing, audit, dependency, and replay
consistency problems before the platform has a stable foundation.

### Decision 4: Prioritize signal alerts before backtesting

After strategy definition is available, the next child change should add
runtime signal detection and persisted alert events. This closes the current
product gap called out by existing AstrBot integration docs: proactive alerts
were intentionally deferred from the pull-based query release.

Alternative considered: build backtesting first. That is useful for strategy
quality, but it delays the platform's operational value and still depends on
the same strategy definition model.

### Decision 5: Deliver alerts through persisted events plus AstrBot integration

Mist backend should own signal and alert event persistence. AstrBot and
`mist-skills` should consume those events or trigger controlled delivery; they
should not execute strategy rules themselves.

Alternative considered: push directly to a generic webhook first. That is more
general, but it requires retry, signing, routing, and operator configuration
before the existing AstrBot path is used.

### Decision 6: Make the first backtest signal-level only

The first backtesting child change should replay the same strategy definition
over historical K-line data and return signal occurrences and aggregate hit
statistics. It should not simulate cash, positions, orders, fees, slippage, or
portfolio allocation.

Alternative considered: implement portfolio-level backtesting immediately.
That would be closer to investment analysis, but it is a separate execution
model and should follow once signal semantics are stable.

## Risks / Trade-offs

- Rule language becomes too narrow -> Keep the first DSL tied to existing
  backend facts, but require a versioned expression model so later child changes
  can extend it.
- Alert and backtest semantics diverge -> Require every signal and backtest
  child change to consume the shared strategy definition contract.
- Naming collides with collector strategies or TDX/QMT strategy identity ->
  Reserve product names such as `StrategyDefinition` or `TradingStrategy` and
  keep collector/datasource strategy terminology scoped to their modules.
- Backtest results are mistaken for portfolio performance -> Name the first
  backtest explicitly as signal-level and require docs/API text to exclude
  execution, cost, and capital modeling.
- Proactive alerts over-couple to AstrBot -> Persist backend events first, then
  let `mist-skills`/AstrBot consume or deliver them through a separate child
  change.

## Migration Plan

1. Create and validate this parent roadmap change.
2. Use its task list as the backlog for focused child OpenSpec changes.
3. Start with `add-strategy-definition-registry`.
4. Build `add-strategy-signal-alerts` after the shared definition contract is
   accepted.
5. Build `add-strategy-signal-backtesting` after live signal semantics are
   defined.
6. Add frontend operator UX and portfolio-level backtesting only through later
   explicit child changes.
7. Archive this roadmap only after every child item is completed, deferred,
   superseded, or dropped with a recorded reason.

## Open Questions

- The exact DSL shape for strategy rules.
- Whether alert scanning runs in the existing schedule app, the main Mist app,
  or a later dedicated worker.
- The first AstrBot delivery mode: pull unread events, backend-triggered push,
  or operator-command-triggered flush.
- Whether frontend strategy editing is delivered with the registry child change
  or deferred to the operator UX child change.
