## Why

Mist can currently replay a strategy only as historical signal matches, so an
operator cannot answer whether the strategy could have produced a tradable
portfolio after execution timing, capital, position sizing, and A-share costs.
The strategy platform is not yet in production, making this the right point to
reshape its V1 contract directly instead of preserving an unused signal-only
interface.

## What Changes

- **BREAKING** Reshape the existing V1 strategy version contract from one
  `rule` into paired `entryRule` and `exitRule` expressions plus
  `lookbackBars`; migrate existing development data to `entryRule` with no
  exit rule.
- Add `StrategyDefinition.backtestEnabled` as an eligibility switch for new
  backtest runs, independent from the live-scan lifecycle status. Enabling
  backtesting requires a complete, daily-bar-compatible current version.
- **BREAKING** Upgrade the existing `/v1/strategy-backtests` resource from a
  synchronous signal replay into asynchronous portfolio backtesting, while
  retaining the current route and established strategy class names.
- Add a deterministic native TypeScript backtest engine for A-share long-only
  trading: completed daily-bar signals, next-available-open execution,
  equal-weight slots, whole-position exits, 100-share lots, T+1 and cash
  constraints, configurable slippage, commission, stamp duty, and transfer
  fees.
- Persist immutable strategy/config snapshots, signals, orders, trades, equity
  points, market-data fingerprints, progress, lease state, errors, and
  portfolio metrics. Detect persisted-K drift before an expired-lease retry
  instead of silently replaying changed inputs.
- Require the benchmark to contain the exact first actual portfolio equity
  timestamp so benchmark and excess returns never compare different windows.
- Restrict V1 portfolio backtests to configured `tdx` and `qmt` daily data,
  snapshot the source-specific requested adjustment contract, and reject QMT
  rows whose persisted ingestion marker is not `front_ratio`.
- Push run, signal, order, trade, and as-of position cursors into MySQL with
  stable time/id ordering and aligned indexes. Keep equity as one complete
  bounded ascending daily series.
- Replace the signal-only backtest frontend with a complete operator workflow:
  run history on the left, selected result details on the right, a new-run
  configuration drawer, metric cards, equity/benchmark/drawdown charts, and
  result fact tabs.
- Correct residual frontend datasource naming from `mqmt` to the canonical
  backend value `qmt` as part of the changed V1 request contract.

## Capabilities

### New Capabilities

- `strategy-portfolio-backtesting`: Asynchronous, deterministic portfolio
  execution, persistence, metrics, lifecycle APIs, recovery, and cancellation
  for V1 strategy backtests.

### Modified Capabilities

- `strategy-definition-registry`: V1 strategies gain paired entry/exit rules,
  lookback metadata, and an explicit backtest eligibility switch; the former
  portfolio-field exclusion is removed.
- `strategy-signal-alerts`: Live scans consume the paired V1 rule contract and
  persist whether a match is an entry or exit signal without duplicating rule
  semantics.
- `strategy-signal-backtesting`: Historical signal replay becomes the signal
  provenance stage of a portfolio run rather than a synchronous standalone
  result model, and its portfolio exclusion is removed.
- `strategy-operator-ux`: The backtest workspace gains asynchronous run
  management, portfolio configuration, charts, metrics, and auditable result
  details.

## Impact

- Backend: `apps/mist/src/strategy`, shared strategy evaluation rules/context,
  REST DTOs/controllers, asynchronous processing, and focused Jest coverage.
- Data model: `libs/shared-data` strategy entities/enums and additive SQL
  migrations. The branch-local `007_*.sql` may be revised only when the target
  has not recorded it in `schema_migrations`; otherwise the fingerprint and
  filtered-query index convergence is delivered by
  `008_strategy_portfolio_backtesting_indexes.sql`. Applied migration `006` remains
  unchanged and TypeORM synchronization remains disabled.
- Frontend: `mist-fe/app/strategies`, `mist-fe/app/api/client.ts`, ECharts
  result visualization, and React tests.
- API/data compatibility: existing V1 strategy and backtest paths remain, but
  their unused request/response payloads change. Existing development strategy
  rows require a deterministic migration.
- Runtime: processing stays inside `mist-backend` using MySQL leases and a pure
  engine boundary; no Redis, Python engine, new container, or gateway change is
  introduced.
