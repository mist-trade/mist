# Tasks: Define strategy platform roadmap

## 1. Create strategy definition registry child spec

- [ ] 1.1 Create child change `add-strategy-definition-registry`.
- [ ] 1.2 Define owner repositories, with `mist` owning backend strategy
      definition contracts and migrations.
- [ ] 1.3 Define strategy identity, versioning, lifecycle, enabled/disabled
      state, target universe, period coverage, rule expression storage, and
      audit fields.
- [ ] 1.4 Define declaration-first rule expression constraints over K-line,
      indicator, Chan Theory, and security metadata inputs.
- [ ] 1.5 Define API boundaries for create, update, list, detail, enable,
      disable, and version inspection.
- [ ] 1.6 Define MySQL migration requirements and local validation commands.
- [ ] 1.7 Define archive criteria for the shared strategy definition foundation.

## 2. Create strategy signal alerts child spec

- [ ] 2.1 Create child change `add-strategy-signal-alerts`.
- [ ] 2.2 Require dependency on `add-strategy-definition-registry` or a
      successor shared definition contract.
- [ ] 2.3 Define how enabled strategy definitions are scanned against current
      market data or completed K-line periods.
- [ ] 2.4 Define `StrategySignal` and `StrategyAlertEvent` semantics, including
      persistence, duplicate suppression, cooldown, status, and delivery result
      tracking.
- [ ] 2.5 Define whether scanning runs in the existing schedule app, the main
      Mist app, or a later dedicated worker.
- [ ] 2.6 Define `mist-skills` and AstrBot alert consumption or delivery
      boundaries without moving rule execution out of Mist.
- [ ] 2.7 Define backend tests, skill contract tests, and archive criteria for
      alert readiness.

## 3. Create signal-level backtesting child spec

- [ ] 3.1 Create child change `add-strategy-signal-backtesting`.
- [ ] 3.2 Require reuse of the same strategy definition and rule semantics used
      by live signal alerts.
- [ ] 3.3 Define backtest inputs for strategy version, target universe, period,
      source, and date range.
- [ ] 3.4 Define signal-level outputs for matched timestamps, securities,
      rule snapshots, and aggregate hit statistics.
- [ ] 3.5 Explicitly exclude capital, position, order, fee, slippage, and
      portfolio allocation simulation from the first phase.
- [ ] 3.6 Define fixture-based deterministic tests and archive criteria for
      signal-level backtest readiness.

## 4. Create strategy operator UX child spec

- [ ] 4.1 Create child change `improve-strategy-operator-ux`.
- [ ] 4.2 Define frontend dependency on accepted backend contracts for strategy
      definitions, signals, alerts, and backtest results.
- [ ] 4.3 Define screens or views for strategy registry, signal history, alert
      status, and signal-level backtest results.
- [ ] 4.4 Require frontend calls to use Mist backend APIs and same-origin
      gateway paths instead of direct datasource access.
- [ ] 4.5 Define frontend tests, build validation, and archive criteria.

## 5. Track later portfolio-level backtesting

- [ ] 5.1 Decide whether to create future child change
      `extend-strategy-portfolio-backtesting` after signal-level backtesting is
      accepted.
- [ ] 5.2 If created, define capital, position, order, fee, slippage, execution
      timing, and portfolio allocation semantics separately from the first
      backtesting phase.
- [ ] 5.3 If deferred or dropped, record the reason in this roadmap before
      archive.

## 6. Maintain roadmap disposition

- [ ] 6.1 Run `openspec validate define-strategy-platform-roadmap --strict`
      whenever this roadmap changes.
- [ ] 6.2 Track each child item as completed, archived, superseded, deferred,
      or dropped.
- [ ] 6.3 Update this roadmap if any child item is split into multiple changes
      or replaced by a newer roadmap.
- [ ] 6.4 Archive this roadmap only after every child item has a recorded
      disposition.
