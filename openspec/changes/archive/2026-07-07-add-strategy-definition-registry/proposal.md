## Why

Mist needs a first strategy platform foundation before live alerts or
backtests can share stable semantics. This change adds the backend registry for
versioned, declarative strategy definitions and reserves signal/backtest
interfaces so later alert and replay work does not create a second rule model.

## What Changes

- Add strategy definition and version entities, enums, DTOs, services, and
  `/v1/strategies` APIs in `apps/mist`.
- Add declarative rule validation for first-phase strategy expressions over
  known Mist data families without accepting arbitrary user code.
- Add persistence entities and service boundaries for `StrategySignal`,
  `StrategyAlertEvent`, `BacktestRun`, and `BacktestSignalResult` so later
  alert and backtest child changes can reuse the same model.
- Add a signal-level backtest request DTO and reserved service/controller
  boundaries that create or expose backtest records but do not execute
  historical replay.
- Add MySQL migration `006_strategy_platform_core.sql` because TypeORM
  synchronize remains disabled.
- Keep public APIs in `apps/mist`, use `/v1/<resource>` paths, and do not add
  public strategy APIs to `apps/schedule`.
- Do not implement periodic scanning, alert delivery, historical replay,
  portfolio simulation, or frontend strategy UX in this child change.

## Capabilities

### New Capabilities

- `strategy-definition-registry`: Versioned declarative strategy definitions,
  first-phase registry APIs, rule validation, persistence boundaries, and
  reserved signal/backtest contracts.

### Modified Capabilities

None. This child change implements the strategy roadmap through a new
capability and does not change existing capability requirements.

## Impact

- Affects `apps/mist/src/strategy/**`, `apps/mist/src/app.module.ts`, and
  Swagger-visible REST paths under `/v1`.
- Affects `libs/shared-data/src/entities/**`, `libs/shared-data/src/enums/**`,
  and shared exports.
- Adds `deploy/database/migrations/006_strategy_platform_core.sql`.
- Adds focused backend tests for registry behavior, route metadata, rule
  validation, and backtest interface reservation.
- Does not change datasource routes, collector routes, gateway prefixes,
  `apps/schedule`, `mist-fe`, or `mist-skills` in this change.
