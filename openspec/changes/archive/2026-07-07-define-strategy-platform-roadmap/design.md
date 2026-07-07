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
- Use the strategy platform work to establish the preferred Mist backend API
  path style for new product endpoints.

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
- Rewrite all historical Mist business endpoints or remove legacy endpoint
  paths in this roadmap change.

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

### Decision 3: Standardize new backend APIs on `/v1/<resource>`

New strategy platform APIs should use version-first resource paths such as
`/v1/strategies`, `/v1/strategy-signals`,
`/v1/strategy-alert-events`, and `/v1/strategy-backtests`. This aligns new
Mist product APIs with the existing `v1/collector` controller and the
datasource normalized `/v1/*` route family.

Existing backend paths are mixed: `/security/v1/*`, `/indicator/*`,
`/chan/*`, and `/v1/collector/*`. A separate child change should create
standardized `/v1` aliases and migrate clients gradually while keeping old
paths compatible until `mist-fe`, `mist-skills`, smoke inventories, and
operator docs have moved.

Alternative considered: keep adding feature-local paths such as
`/strategy/v1/*`. That would add another path style instead of reducing drift.

Alternative considered: remove old paths immediately. That would break current
frontend, skills, gateway smoke, and archived operational evidence.

### Decision 4: Use declaration-first strategy rules for the first phase

Initial strategies should combine known backend data and computed values, such
as K-line fields, indicators, Chan Theory outputs, and security metadata. The
rule language should be persisted, validated, and replayable.

Alternative considered: allow user-provided code strategies. That is more
flexible, but it introduces sandboxing, audit, dependency, and replay
consistency problems before the platform has a stable foundation.

### Decision 5: Put public APIs in `apps/mist` and periodic scans in `apps/schedule`

Strategy registration, signal queries, alert acknowledgement, and backtest
requests belong in the Mist backend app because `apps/mist` owns REST APIs,
Swagger, validation, response envelopes, and gateway-facing contracts.

The schedule app currently hosts cron-driven K-line collection. It is a
reasonable first home for periodic strategy scanning after completed K-line
periods, but it should only call shared strategy core services. It should not
own public strategy APIs, strategy registration, alert acknowledgement, or
backtest request handling.

Alternative considered: put all strategy runtime behavior in `apps/mist`. That
keeps dependencies simple but mixes cron workload with user-facing API
traffic.

Alternative considered: put all strategy behavior in `apps/schedule`. That
would make registration, query, and backtest APIs live in an app that currently
has no public API conventions, Swagger setup, or response-envelope filters.

### Decision 6: Prioritize signal alerts before backtesting

After strategy definition is available, the next child change should add
runtime signal detection and persisted alert events. This closes the current
product gap called out by existing AstrBot integration docs: proactive alerts
were intentionally deferred from the pull-based query release.

Alternative considered: build backtesting first. That is useful for strategy
quality, but it delays the platform's operational value and still depends on
the same strategy definition model.

### Decision 7: Deliver alerts through persisted events plus AstrBot integration

Mist backend should own signal and alert event persistence. AstrBot and
`mist-skills` should consume those events or trigger controlled delivery; they
should not execute strategy rules themselves.

Alternative considered: push directly to a generic webhook first. That is more
general, but it requires retry, signing, routing, and operator configuration
before the existing AstrBot path is used.

### Decision 8: Make the first backtest signal-level only

The first backtesting child change should replay the same strategy definition
over historical K-line data and return signal occurrences and aggregate hit
statistics. It should not simulate cash, positions, orders, fees, slippage, or
portfolio allocation.

Alternative considered: implement portfolio-level backtesting immediately.
That would be closer to investment analysis, but it is a separate execution
model and should follow once signal semantics are stable.

## Landing Architecture

The first implementation wave should use these module boundaries:

```text
apps/mist/src/strategy/
  strategy.module.ts
  strategy-core.module.ts
  controllers/
    strategy.controller.ts
    strategy-signal.controller.ts
    strategy-alert-event.controller.ts
    strategy-backtest.controller.ts
  dto/
    create-strategy-definition.dto.ts
    update-strategy-definition.dto.ts
    query-strategy-signal.dto.ts
    create-backtest-run.dto.ts
  services/
    strategy-definition.service.ts
    strategy-evaluation.service.ts
    strategy-signal.service.ts
    strategy-alert-event.service.ts
    strategy-backtest.service.ts
  rules/
    strategy-rule.types.ts
    strategy-rule-validator.ts
    strategy-rule-evaluator.ts
    strategy-evaluation-context.builder.ts
  scanner/
    strategy-scan.service.ts

apps/schedule/src/
  data-collection.controller.ts
  strategy-scan.job.ts

libs/shared-data/src/
  entities/
    strategy-definition.entity.ts
    strategy-version.entity.ts
    strategy-signal.entity.ts
    strategy-alert-event.entity.ts
    backtest-run.entity.ts
    backtest-signal-result.entity.ts
  enums/
    strategy-status.enum.ts
    strategy-rule-version.enum.ts
    strategy-signal-source.enum.ts
    strategy-alert-status.enum.ts
    backtest-run-status.enum.ts

deploy/database/migrations/
  006_strategy_platform_core.sql
```

`StrategyCoreModule` should contain reusable services, rule validation, rule
evaluation, and scanning primitives. `StrategyModule` should add REST
controllers for `apps/mist`. `apps/schedule` should import only the core
module and run `StrategyScanJob`.

The core data flow is:

```text
mist-fe / operators
  -> apps/mist REST API
  -> StrategyDefinitionService
  -> StrategyVersion + rule validation
  -> MySQL

apps/schedule cron
  -> StrategyScanJob
  -> StrategyScanService
  -> StrategyEvaluationService
  -> StrategyRuleEvaluator
  -> StrategySignalService
  -> StrategyAlertEventService
  -> MySQL

backtest request
  -> StrategyBacktestService
  -> StrategyEvaluationService
  -> BacktestRun + BacktestSignalResult
  -> MySQL

mist-skills / AstrBot
  -> Mist alert event APIs
  -> StrategyAlertEventService
```

Key classes:

- `StrategyDefinition`: strategy identity, status, current version, target
  scope, and audit fields.
- `StrategyVersion`: versioned declarative rule JSON, period/source coverage,
  and validation metadata.
- `StrategySignal`: immutable strategy match fact shared by live alerts and
  backtest outputs.
- `StrategyAlertEvent`: live alert event derived from a signal, with
  dedupe/cooldown/status/delivery result state.
- `BacktestRun`: one signal-level replay request over a strategy version,
  target universe, period, source, and date range.
- `BacktestSignalResult`: signal-level historical result linked to a
  `BacktestRun`.
- `StrategyEvaluationContextBuilder`: builds K-line, indicator, Chan Theory,
  and security metadata context for one evaluation time.
- `StrategyRuleEvaluator`: pure evaluator for declarative rules.
- `StrategyEvaluationService`: shared facade used by live scanning and
  backtesting.
- `StrategyScanService`: scans enabled strategy versions after completed K-line
  periods and writes live signals.
- `StrategyBacktestService`: replays historical bars through the shared
  evaluator and writes signal-level results.

## API Path Plan

New strategy platform APIs should use:

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

The API style child change should plan standardized aliases for existing
business paths:

```text
/security/v1/all              -> /v1/securities
/security/v1/:code            -> /v1/securities/:code
/security/v1/initialize       -> /v1/securities
/security/v1/sources          -> /v1/security-sources
/security/v1/:code/sources    -> /v1/securities/:code/sources
/security/v1/:code/activate   -> /v1/securities/:code/activate
/security/v1/:code/deactivate -> /v1/securities/:code/deactivate

/indicator/k                  -> /v1/indicators/k
/indicator/macd               -> /v1/indicators/macd
/indicator/rsi                -> /v1/indicators/rsi
/indicator/kdj                -> /v1/indicators/kdj

/chan/merge-k                 -> /v1/chan/merge-k
/chan/bi                      -> /v1/chan/bi
/chan/fenxing                 -> /v1/chan/fenxing
/chan/channel                 -> /v1/chan/channel
```

`/v1/collector/collect` already follows the preferred version-first style and
should remain stable in this roadmap. Gateway prefixes `/api/mist` and
`/api/chan` are deployment routing concerns and should also remain stable.

## Backtest Interface Reservation

The registry child change should reserve DTO and service boundaries for
backtesting even if the first child implementation does not execute backtests.
The backtest request should be shaped around:

```text
strategyVersionId
targetUniverse
period
source
startDate
endDate
```

The first completed backtest child change should return:

```text
runId
status
signalCount
matchedSecurityCount
startedAt
completedAt
signals[]
```

It must not report cash, positions, orders, fills, fees, slippage, or portfolio
returns until a later portfolio-level backtest change defines those semantics.

## Risks / Trade-offs

- Rule language becomes too narrow -> Keep the first DSL tied to existing
  backend facts, but require a versioned expression model so later child changes
  can extend it.
- API standardization becomes a breaking change -> Add `/v1` aliases and move
  clients gradually; do not remove legacy paths in the strategy platform
  roadmap.
- Schedule workload grows into a second public API surface -> Keep public
  controllers in `apps/mist` and let `apps/schedule` import only strategy core
  services for cron jobs.
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
3. Create `standardize-mist-v1-api-paths` before or alongside strategy
   definition work.
4. Start product implementation with `add-strategy-definition-registry`.
5. Build `add-strategy-signal-alerts` after the shared definition contract is
   accepted.
6. Build `add-strategy-signal-backtesting` after live signal semantics are
   defined.
7. Add frontend operator UX.
8. Harden scheduled strategy scans and alert delivery consumption after the
   operator UX is accepted.
9. Add portfolio-level backtesting only through a later explicit child change.
10. Archive this roadmap only after every child item is completed, deferred,
   superseded, or dropped with a recorded reason.

## Current Child Disposition

| Child item                              | Status      | Notes                                                                                                                                                          |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `standardize-mist-v1-api-paths`         | Archived    | Archived at `openspec/changes/archive/2026-07-07-standardize-mist-v1-api-paths`; main spec synced to `openspec/specs/mist-api-path-standardization/spec.md`.   |
| `add-strategy-definition-registry`      | Archived    | Archived at `openspec/changes/archive/2026-07-07-add-strategy-definition-registry`; main spec synced to `openspec/specs/strategy-definition-registry/spec.md`. |
| `add-strategy-signal-alerts`            | Archived    | Archived at `openspec/changes/archive/2026-07-07-add-strategy-signal-alerts`; main spec synced to `openspec/specs/strategy-signal-alerts/spec.md`.           |
| `add-strategy-signal-backtesting`       | Archived    | Archived at `openspec/changes/archive/2026-07-07-add-strategy-signal-backtesting`; main spec synced to `openspec/specs/strategy-signal-backtesting/spec.md`.   |
| `improve-strategy-operator-ux`          | Archived    | Archived at `openspec/changes/archive/2026-07-07-improve-strategy-operator-ux`; main spec synced to `openspec/specs/strategy-operator-ux/spec.md`.             |
| `harden-strategy-scheduler-alert-delivery` | Archived    | Archived at `openspec/changes/archive/2026-07-07-harden-strategy-scheduler-alert-delivery`; main spec synced to `openspec/specs/strategy-scheduler-alert-delivery/spec.md`. |
| `extend-strategy-portfolio-backtesting` | Deferred    | Defer until scheduled scans and alert delivery hardening expose real signal-level usage needs.                                                                  |

## Open Questions

- The exact DSL shape for strategy rules.
- Whether future scale requires moving strategy scanning from `apps/schedule`
  into a dedicated worker.
- The first AstrBot delivery mode: pull unread events or controlled
  backend-triggered push.
- Whether frontend strategy editing is delivered with the registry child change
  or deferred to the operator UX child change.
