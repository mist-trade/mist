# Tasks: Define strategy platform roadmap

## 1. Create API style standardization child spec

- [x] 1.1 Create child change `standardize-mist-v1-api-paths`.
- [x] 1.2 Define the preferred backend API path style as `/v1/<resource>` for
      new Mist product endpoints.
- [x] 1.3 Define `/v1` aliases for existing security, indicator, and Chan
      business APIs while keeping old paths compatible.
- [x] 1.4 Require production gateway prefixes `/api/mist` and `/api/chan` to
      remain deployment routing concerns, not controller path names.
- [x] 1.5 Define migration tasks for `mist-fe`, `mist-skills`, smoke
      inventories, README endpoint tables, and OpenSpec references.
- [x] 1.6 Define backend route compatibility tests and archive criteria for API
      style standardization.

## 2. Create strategy definition registry child spec

- [x] 2.1 Create child change `add-strategy-definition-registry`.
- [x] 2.2 Define owner repositories, with `mist` owning backend strategy
      definition contracts and migrations.
- [x] 2.3 Define strategy identity, versioning, lifecycle, enabled/disabled
      state, target universe, period coverage, rule expression storage, and
      audit fields.
- [x] 2.4 Define declaration-first rule expression constraints over K-line,
      indicator, Chan Theory, and security metadata inputs.
- [x] 2.5 Define `StrategyDefinition`, `StrategyVersion`,
      `StrategyEvaluationContext`, `StrategyEvaluationResult`,
      `StrategySignal`, `StrategyAlertEvent`, `BacktestRun`, and
      `BacktestSignalResult` boundaries.
- [x] 2.6 Define version-first API boundaries for create, update, list, detail,
      enable, disable, and version inspection.
- [x] 2.7 Reserve signal-level backtest request and response DTO/service
      boundaries without implementing portfolio-level backtesting.
- [x] 2.8 Define MySQL migration requirements and local validation commands.
- [x] 2.9 Define archive criteria for the shared strategy definition foundation.

## 3. Create strategy signal alerts child spec

- [x] 3.1 Create child change `add-strategy-signal-alerts`.
- [x] 3.2 Require dependency on `add-strategy-definition-registry` or a
      successor shared definition contract.
- [x] 3.3 Define how enabled strategy definitions are scanned against current
      market data or completed K-line periods after K-line completion.
- [x] 3.4 Define `StrategySignal` and `StrategyAlertEvent` semantics, including
      persistence, duplicate suppression, cooldown, status, and delivery result
      tracking.
- [x] 3.5 Define `apps/schedule` as the first home for periodic scan jobs while
      keeping public APIs in `apps/mist`.
- [x] 3.6 Define `mist-skills` and AstrBot alert consumption or delivery
      boundaries without moving rule execution out of Mist.
- [x] 3.7 Define backend tests, skill contract tests, and archive criteria for
      alert readiness.

## 4. Create signal-level backtesting child spec

- [x] 4.1 Create child change `add-strategy-signal-backtesting`.
- [x] 4.2 Require reuse of the same strategy definition and rule semantics used
      by live signal alerts.
- [x] 4.3 Define backtest inputs for strategy version, target universe, period,
      source, and date range.
- [x] 4.4 Define signal-level outputs for matched timestamps, securities,
      rule snapshots, and aggregate hit statistics.
- [x] 4.5 Explicitly exclude capital, position, order, fee, slippage, and
      portfolio allocation simulation from the first phase.
- [x] 4.6 Define fixture-based deterministic tests and archive criteria for
      signal-level backtest readiness.

## 5. Create strategy operator UX child spec

- [x] 5.1 Create child change `improve-strategy-operator-ux`.
- [x] 5.2 Define frontend dependency on accepted backend contracts for strategy
      definitions, signals, alerts, and backtest results.
- [x] 5.3 Define screens or views for strategy registry, signal history, alert
      status, and signal-level backtest results.
- [x] 5.4 Require frontend calls to use Mist backend APIs and same-origin
      gateway paths instead of direct datasource access.
- [x] 5.5 Define frontend tests, build validation, and archive criteria.

## 6. Create scheduler and alert delivery hardening child spec

- [x] 6.1 Create child change `harden-strategy-scheduler-alert-delivery`.
- [x] 6.2 Define schedule dependency on shared Mist strategy scan services
      without making `apps/schedule` own public strategy APIs.
- [x] 6.3 Define scheduled scan behavior after completed K-line collection
      windows.
- [x] 6.4 Define alert delivery state transitions for pending, delivered,
      failed, and acknowledged events.
- [x] 6.5 Define `mist-skills`/AstrBot consumption boundaries through Mist
      backend APIs without moving rule execution out of Mist.
- [x] 6.6 Define backend, schedule, skill, and archive validation criteria.

## 7. Track later portfolio-level backtesting

- [x] 7.1 Decide whether to create future child change
      `extend-strategy-portfolio-backtesting` after signal-level backtesting is
      accepted.
- [x] 7.2 Record that portfolio-level backtesting remains deferred instead of
      defining capital, position, order, fee, slippage, execution timing, and
      portfolio allocation semantics in this roadmap.
- [x] 7.3 If deferred or dropped, record the reason in this roadmap before
      archive.

## 8. Maintain roadmap disposition

- [x] 8.1 Run `openspec validate define-strategy-platform-roadmap --strict`
      whenever this roadmap changes.
- [x] 8.2 Track each child item as completed, archived, superseded, deferred,
      or dropped.
- [x] 8.3 Update this roadmap if any child item is split into multiple changes
      or replaced by a newer roadmap.
- [x] 8.4 Archive this roadmap only after every child item has a recorded
      disposition.
