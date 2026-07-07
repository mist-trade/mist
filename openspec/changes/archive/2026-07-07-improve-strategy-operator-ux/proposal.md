## Why

Mist now has backend contracts for strategy registration, live signals, alert
events, manual scans, and signal-level backtests, but operators still need a
single frontend workspace to manage and inspect that flow. This change turns
the backend strategy platform into an operable product surface before adding
portfolio-level simulation.

## What Changes

- Add a strategy operator workspace in `mist-fe` for registry, signal history,
  alert events, and signal-level backtest results.
- Add frontend API client methods that call Mist backend `/v1/*` strategy
  endpoints through the configured same-origin Mist gateway base path.
- Provide strategy list/detail workflows for create, update-as-new-version,
  enable, disable, and version inspection.
- Provide signal and alert event views with filters and alert acknowledgement.
- Provide signal-level backtest creation and result inspection for aggregate
  statistics and persisted signal rows.
- Keep datasource services and raw provider APIs out of frontend strategy UX.
- Do not add portfolio-level capital, order, position, fee, slippage, or return
  simulation screens in this change.

## Capabilities

### New Capabilities

- `strategy-operator-ux`: Frontend operator workflows for strategy registry,
  signal history, alert events, manual scans, and signal-level backtest results.

### Modified Capabilities

None. Existing backend strategy requirements remain unchanged.

## Impact

- Affects `../mist-fe/app` pages, components, API client types, and frontend
  tests.
- Depends on accepted Mist backend APIs under `/v1/strategies`,
  `/v1/strategy-signals`, `/v1/strategy-alert-events`,
  `/v1/strategy-scans/run`, and `/v1/strategy-backtests`.
- Updates the strategy platform roadmap disposition for
  `improve-strategy-operator-ux`.
- Does not change backend entities, migrations, schedule jobs, datasource
  services, or portfolio-level backtesting semantics.
