## Why

Mist can now register strategies and produce live signal/alert events, but
operators still cannot replay a strategy over historical K-line data. This
change implements signal-level backtesting so strategy definitions can be
validated historically without introducing portfolio simulation.

## What Changes

- Extend `StrategyBacktestService.createRun` to execute a synchronous
  signal-level historical replay after creating a run.
- Reuse `StrategyRuleEvaluator` and `StrategyEvaluationContextBuilder` so live
  scans and historical replay share the same rule semantics.
- Read historical K-line records for the requested strategy version, target
  universe, period, source, start date, and end date.
- Persist matching `BacktestSignalResult` rows and update `BacktestRun`
  aggregate fields: status, signal count, matched security count, started time,
  completed time, and error message.
- Keep existing `/v1/strategy-backtests` request and result routes.
- Do not add cash, positions, orders, fees, slippage, allocation, or portfolio
  return fields.

## Capabilities

### New Capabilities

- `strategy-signal-backtesting`: Signal-level historical replay for versioned
  declarative strategies, persisted backtest runs, persisted signal results,
  shared evaluator reuse, and aggregate signal statistics.

### Modified Capabilities

None. This change implements the backtest behavior that was reserved by
`strategy-definition-registry` without changing its accepted registry
requirements.

## Impact

- Affects `apps/mist/src/strategy/services/strategy-backtest.service.ts` and
  focused strategy backtest tests.
- Uses existing `BacktestRun`, `BacktestSignalResult`, `StrategyVersion`, and
  `K` entities.
- Does not add database tables or migrations.
- Does not change live signal scanning, alert delivery, datasource APIs,
  gateway prefixes, frontend, or `apps/schedule`.
