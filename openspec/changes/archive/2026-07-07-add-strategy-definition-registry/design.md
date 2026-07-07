## Context

The strategy platform roadmap requires a shared strategy definition model before
live alerts or historical backtests are implemented. The current backend has
`apps/mist` as the public REST API owner, `apps/schedule` as a cron host,
`libs/shared-data` for TypeORM entities/enums, and SQL migrations under
`deploy/database/migrations` because TypeORM synchronize is disabled.

Existing strategy-like names already exist in collector and datasource code,
so the product strategy model must be explicit: `StrategyDefinition`,
`StrategyVersion`, `StrategySignal`, `StrategyAlertEvent`, `BacktestRun`, and
`BacktestSignalResult` are business strategy platform concepts, not data
collection strategy implementations or TDX/QMT desktop strategy identities.

## Goals / Non-Goals

**Goals:**

- Add versioned declarative strategy definition persistence and APIs under
  `/v1/strategies`.
- Validate first-phase rule expressions before storing a strategy version.
- Reserve shared signal, alert event, and signal-level backtest persistence
  boundaries for later alert/backtest child changes.
- Add a pending backtest run API boundary under `/v1/strategy-backtests` that
  stores requests but does not execute historical replay.
- Keep public APIs in `apps/mist` and gateway prefixes out of controller paths.
- Add SQL migration and focused tests for entities, route metadata, validation,
  and service/controller behavior.

**Non-Goals:**

- Execute periodic strategy scans in `apps/schedule`.
- Evaluate strategy rules against live or historical K-line data.
- Deliver alerts through AstrBot, webhooks, or `mist-skills`.
- Implement portfolio-level backtesting, cash, positions, orders, fees,
  slippage, or performance curves.
- Build frontend strategy screens.

## Decisions

### Decision 1: Store definition identity separately from versions

`StrategyDefinition` owns stable identity, lifecycle state, target universe,
period/source coverage, current version pointer, and audit fields.
`StrategyVersion` owns immutable rule JSON and validation metadata. Updating a
strategy creates a new version and moves the current version pointer.

Alternative considered: update rule JSON in-place on one table. That would make
alerts and future backtests hard to reproduce because historical signals would
not know which rule version produced them.

### Decision 2: Use a small declarative rule schema first

The first validator accepts JSON expressions with `all`/`any` groups and leaf
conditions containing `field`, `operator`, and `value`. Field names are
restricted to approved roots: `k`, `indicator`, `chan`, and `security`.
Operators are restricted to deterministic comparisons such as `gt`, `gte`,
`lt`, `lte`, `eq`, `neq`, `crossesAbove`, and `crossesBelow`.

Alternative considered: store arbitrary JS/Python/SQL. That would add
sandboxing, dependency, audit, and replay consistency risks before the
platform has a stable registry.

### Decision 3: Reserve backtest and alert tables now, execute later

This change adds `StrategySignal`, `StrategyAlertEvent`, `BacktestRun`, and
`BacktestSignalResult` entities and services so the shape is shared early.
`StrategyBacktestService.createRun` records a pending signal-level run and
returns it. Execution, signal matching, and aggregate metrics are left for the
backtest child change.

Alternative considered: delay all signal/backtest tables until later. That
would let the first registry API drift away from the model alerts/backtests
need to reference.

### Decision 4: Keep implementation in `apps/mist`

The registry, signal query, alert event query, and backtest request controllers
belong in `apps/mist/src/strategy`. `apps/schedule` remains unchanged in this
child change.

Alternative considered: putting registry APIs in `apps/schedule`. That app
currently has no public API conventions, Swagger setup, or response-envelope
ownership.

## Data Model

- `strategy_definitions`: stable identity, name, description, status, target
  universe JSON, periods JSON, sources JSON, current version id, created/updated
  timestamps.
- `strategy_versions`: strategy id, version number, rule schema version, rule
  JSON, validation summary JSON, created timestamp.
- `strategy_signals`: immutable signal facts linked to strategy/version,
  security code, period/source, signal time, context snapshot JSON, source.
- `strategy_alert_events`: live alert event state linked to a signal, status,
  dedupe key, cooldown deadline, delivery result JSON.
- `backtest_runs`: requested signal-level replay inputs and pending/running/
  completed/failed status plus aggregate counters.
- `backtest_signal_results`: signal facts linked to a run.

## API Shape

```text
POST   /v1/strategies
GET    /v1/strategies
GET    /v1/strategies/:id
PATCH  /v1/strategies/:id
POST   /v1/strategies/:id/enable
POST   /v1/strategies/:id/disable
GET    /v1/strategies/:id/versions

GET    /v1/strategy-signals
GET    /v1/strategy-alert-events
POST   /v1/strategy-alert-events/:id/ack

POST   /v1/strategy-backtests
GET    /v1/strategy-backtests/:runId
GET    /v1/strategy-backtests/:runId/signals
```

## Risks / Trade-offs

- Rule DSL is too narrow -> Version the rule schema and keep the validator
  isolated in `rules/strategy-rule-validator.ts`.
- Backtest API is mistaken for executable backtesting -> Persist pending runs
  only and document that replay execution belongs to
  `add-strategy-signal-backtesting`.
- JSON columns vary across MySQL deployments -> Use MySQL `json` columns in
  migration and TypeORM `json` types consistently with explicit defaults in
  service code rather than database JSON defaults.
- Current version relation can create FK ordering issues -> Store
  `currentVersionId` as a nullable column first, create version, then update
  the definition.

## Migration Plan

1. Add shared enums/entities and export them from `@app/shared-data`.
2. Add migration `006_strategy_platform_core.sql`.
3. Add `StrategyModule` and include strategy entities in TypeORM root config.
4. Add DTOs, services, rule validator, and controllers in `apps/mist`.
5. Add focused Jest tests and OpenSpec validation.
6. Later child changes may add schedule jobs, actual evaluation, alert
   delivery, backtest execution, and frontend UX.

## Open Questions

- The exact rule fields supported by live scanning will be expanded by the
  alert child change once evaluation context builders are implemented.
- The first alert delivery mode remains for the signal-alert child change.
