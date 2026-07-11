## 1. Baseline And V1 Contract Tests

- [ ] 1.1 Record clean focused backend/frontend baseline commands and confirm
  implementation will preserve unrelated workspace changes and migration
  `006_strategy_platform_core.sql`.
- [ ] 1.2 Add failing strategy definition DTO/service/controller tests for
  `entryRule`, optional `exitRule`, `lookbackBars`, independent
  `backtestEnabled`, version creation, and enablement rejection reasons.
- [ ] 1.3 Add failing rule validator/evaluator/context tests proving accepted
  field paths are resolvable as-of, unsupported nested paths are rejected, and
  `crossesAbove`/`crossesBelow` use prior completed context without lookahead.
- [ ] 1.4 Add failing backtest controller/service contract tests for the
  breaking V1 create payload, HTTP 202, current/explicit version resolution,
  bounded validation, immutable snapshots, list/detail/cancel, fact routes,
  equity, and as-of positions.
- [ ] 1.5 Add failing frontend API and strategy editor tests for paired rules,
  backtest eligibility, canonical `qmt`, async run types, cancellation, and all
  portfolio result methods.

## 2. Migration And Shared Data Model

- [ ] 2.1 Add migration-focused assertions for the next `007_*.sql`, including
  single-rule-to-entry-rule transformation, false backtest defaults, removal
  of development signal-only runs, table/column/index shape, enum values, and
  the guarantee that migration 006 is unchanged.
- [ ] 2.2 Create `007_strategy_portfolio_backtesting.sql` to evolve strategy
  definitions/versions/runs, rename the physical signal fact table to
  `backtest_signals`, add order/trade/equity tables and indexes, and preserve
  TypeORM synchronize-off deployment semantics.
- [ ] 2.3 Extend `StrategyDefinition`, `StrategyVersion`, and `BacktestRun`,
  rename unused `BacktestSignalResult` in place to `BacktestSignal`, and map all
  camelCase members to snake_case columns while keeping existing timestamp
  conventions and immutable snapshot fields.
- [ ] 2.4 Add lower-case serialized enums and shared-data entities for signal
  kind, run stage, order side/status, trade status, `cancelled`,
  `BacktestSignal`, `BacktestOrder`, `BacktestTrade`, and
  `BacktestEquityPoint`.
- [ ] 2.5 Export and register the evolved/new shared-data types through the
  existing barrels, TypeORM root configuration, `strategyEntities`, and
  `strategyProviders` without introducing any `PortfolioBacktest*` class.
- [ ] 2.6 Run migration/schema and shared-data tests, then inspect generated SQL
  and entity metadata for foreign keys, terminal-result immutability, stable
  query indexes, and cascade behavior limited to run-owned facts.

## 3. Paired Strategy Rules And Shared Evaluation

- [ ] 3.1 Implement the breaking V1 strategy DTO/entity/service mapping for
  `entryRule`, `exitRule`, and integer `lookbackBars` from 1 through 250, with
  legacy `rule` removed from public types.
- [ ] 3.2 Implement `backtestEnabled` create/update/read behavior, validate the
  current version plus daily/source eligibility before enabling, and keep it
  independent from live enable/disable/archive status.
- [ ] 3.3 Add a shared registered-field catalog with path/type/history/resolver
  metadata and tighten `StrategyRuleValidator` so every accepted path is
  available to both live and historical contexts.
- [ ] 3.4 Extend `StrategyEvaluationContextBuilder` to produce bounded as-of K,
  security, and the specified MACD/RSI/KDJ/ADX/ATR/MA values from completed
  history only; reject `chan.*` and every uncatalogued path until a later stable
  source-aware historical resolver is specified.
- [ ] 3.5 Implement all accepted evaluator operators, including numeric
  crossover semantics over prior/current contexts, while keeping evaluation
  pure and side-effect free.
- [ ] 3.6 Update `StrategyScanService`, `StrategySignal`, scan results, and alert
  dedupe to evaluate paired rules and persist distinct `entry`/`exit` signal
  kinds without consulting `backtestEnabled`.
- [ ] 3.7 Run paired-rule, field-catalog, context, scan, signal, alert, service,
  controller, and route metadata tests; verify identical live/historical
  fixtures produce identical match results.

## 4. Deterministic Portfolio Engine

- [ ] 4.1 Define framework-free engine input/state/output types and fixed-point
  fen/share utilities, with normalized daily-bar sorting by date and canonical
  security code.
- [ ] 4.2 Add red engine fixtures for close-signal/next-available-open fills,
  no same-bar lookahead, exit-before-entry ordering, both-rule matches, missing
  bars, end-of-range expiry, and repeat-run determinism.
- [ ] 4.3 Implement the daily event loop, typed signal creation, pending order
  scheduling, stable side/security ordering, close marking, and open-position
  carry at the end date.
- [ ] 4.4 Add red allocation fixtures for long-only behavior, equal equity
  slots, 100-share lot floors, fee-aware affordability, maximum positions,
  no pyramiding, whole-position exits, insufficient cash, and T+1.
- [ ] 4.5 Implement cash, position, order, and trade lifecycle transitions for
  the approved A-share envelope, including auditable rejected/expired reasons
  and no partial fills.
- [ ] 4.6 Add red execution-cost fixtures for directional 5 bps default
  slippage, both-side commission/minimum and transfer fee, sell-only stamp
  duty, per-fee half-up fen rounding, and editable overrides.
- [ ] 4.7 Implement immutable normalized cost configuration and fixed-point
  fill/fee/cash accounting with the approved product defaults and benchmark
  `000300`.
- [ ] 4.8 Add red metric fixtures and implement equity/benchmark/drawdown
  points plus total/annualized return, volatility, Sharpe, maximum drawdown and
  duration, Calmar, benchmark/excess return, win rate, profit factor, trade
  count, average holding days, turnover, and exposure with null zero-denominator
  ratios.
- [ ] 4.9 Run the complete pure-engine suite twice with shuffled equivalent
  inputs and compare normalized signals, orders, trades, equity, and metrics.

## 5. Background Processor And Persistence

- [ ] 5.1 Add failing processor tests for atomic pending-run claims, exclusive
  unexpired ownership, lease heartbeats, bounded progress/stage updates, one
  active job per instance, and cooperative event-loop yielding.
- [ ] 5.2 Implement `StrategyBacktestProcessor` inside `mist-backend` with
  MySQL lease claiming/renewal, normalized data loading, lookback-only warmup,
  bounded engine batches, and batched fact persistence.
- [ ] 5.3 Add failing coverage tests for 1–50 stock universes, daily-only and
  10-year limits, definition source compatibility, non-stock rejection,
  missing universe/benchmark series, internal gaps, and no datasource fetches
  during processing.
- [ ] 5.4 Implement persisted-K coverage validation, structured missing-code
  errors, selected-source benchmark normalization, adjusted-price assumption
  snapshot fields, and next-available-bar handling.
- [ ] 5.5 Add failing cancellation tests for immediate pending cancellation,
  running cancellation at the next batch boundary, terminal idempotence or
  conflict, and prevention of post-cancel fact writes.
- [ ] 5.6 Implement cancellation request/status transitions and terminal
  timestamp/error behavior using `BacktestRunStatus.CANCELLED = 'cancelled'`.
- [ ] 5.7 Add failing restart tests for expired leases, partial-fact cleanup,
  attempt increments, snapshot-based restart, unique run fact keys, and
  equivalence to a clean run.
- [ ] 5.8 Implement expired-lease recovery that transactionally clears all
  engine-derived facts/metrics/progress and deterministically restarts without
  checkpoint state.
- [ ] 5.9 Run processor/service integration tests against MySQL-compatible
  transaction semantics and verify failed/cancelled/completed runs are
  immutable and retain snapshots/error details.

## 6. Existing V1 Backtest API And Queries

- [ ] 6.1 Reshape `CreateBacktestRunDto` and `StrategyBacktestService.createRun`
  to resolve current/explicit versions, enforce definition eligibility and
  request bounds, apply defaults, snapshot normalized inputs, persist pending,
  and return without executing.
- [ ] 6.2 Extend `StrategyBacktestController` with HTTP 202 create, cursor run
  listing/filtering, detail/progress/metrics, and cancel while preserving the
  existing version-first controller prefix.
- [ ] 6.3 Implement stable cursor-paginated signal, order, trade, and
  reconstructed as-of position queries with date/id tiebreakers and ownership
  checks.
- [ ] 6.4 Implement the bounded ascending equity endpoint and detail envelopes
  that serialize fixed-point money/metrics safely without BigInt, `NaN`, or
  `Infinity` leaks.
- [ ] 6.5 Add API tests for authorization-equivalent not-found boundaries,
  pagination cursors/filters, immutable terminal re-run behavior, disabled
  strategy history visibility, structured failures, and route metadata.
- [ ] 6.6 Run focused strategy API/service tests plus backend typecheck and lint,
  and search the changed backend for legacy `version.rule`, synchronous
  `executeRun`, `mqmt`, and new `PortfolioBacktest*` names.

## 7. Strategy Editor And Frontend API

- [ ] 7.1 Update `mist-fe/app/api/client.ts` strategy/backtest interfaces and
  methods for paired V1 rules, `backtestEnabled`, canonical `qmt`, async
  lifecycle/progress, metrics, cancel, equity, signals, orders, trades, and
  positions.
- [ ] 7.2 Replace the single rule editor with separate entry/exit JSON editors,
  lookback input, and independent live-status/backtest switches while
  preserving existing local/API error placement.
- [ ] 7.3 Add client-side eligibility guidance and field validation without
  duplicating backend rule evaluation; allow an empty exit only while
  backtesting is disabled.
- [ ] 7.4 Run strategy editor/client tests and frontend typecheck, then confirm
  no strategy UI type or request still emits `rule` or `mqmt`.

## 8. Portfolio Backtest Operator Workspace

- [ ] 8.1 Add failing component tests for the selected layout: run history and
  filters on the left, selected status/result on the right, and a new-backtest
  configuration drawer that preserves selection.
- [ ] 8.2 Implement cursor-backed run history, stable selection, operational
  empty/error states, status/progress/headline values, and the full defaulted
  configuration drawer with eligibility reasons.
- [ ] 8.3 Add failing lifecycle tests for bounded polling, terminal stop,
  unmount/selection cleanup, stale-response suppression, cancellation, and
  one-time terminal result refresh.
- [ ] 8.4 Implement pending/running progress and cancellation behavior without
  reloading unrelated strategy workspace tabs.
- [ ] 8.5 Add failing result tests for every metric card, null ratios,
  equity/benchmark/drawdown chart data, paginated trades/orders/signals,
  end/as-of positions, strategy/config assumptions, and structured errors.
- [ ] 8.6 Implement metric cards and ECharts equity/benchmark/drawdown using the
  existing initialization, resize, disposal, theme, and test-mock lifecycle
  pattern.
- [ ] 8.7 Implement lazy result tabs for trades, orders, signals, positions,
  snapshots, and errors, distinguishing empty results from failed requests and
  disclosing adjusted-price/full-fill exclusions.
- [ ] 8.8 Run focused React tests, frontend typecheck, lint, and production build;
  inspect the strategies page at desktop and narrow widths for overflow,
  readable dense tables, drawer behavior, and chart cleanup.

## 9. End-To-End Verification And Handoff

- [ ] 9.1 Seed or fixture an eligible paired daily strategy and run a small
  end-to-end portfolio backtest through the V1 API, verifying 202, progress,
  completion, snapshots, facts, metrics, and UI rendering.
- [ ] 9.2 Exercise cancellation and expired-lease recovery end to end, proving
  no duplicate/partial facts and result equivalence after retry.
- [ ] 9.3 Run full relevant backend and frontend test/typecheck/lint/build suites,
  route-contract tests, migration validation, and
  `openspec validate add-strategy-portfolio-backtesting --strict`.
- [ ] 9.4 Review the final diff for repository naming/formatting conventions,
  untouched migration 006 and unrelated changes, no Redis/Python/new container
  or gateway drift, and no fields/features from the explicit non-goals.
- [ ] 9.5 Record exact verification evidence and remaining adjusted-price,
  corporate-action, exchange-limit/ST, liquidity, and partial-fill limitations
  before requesting code review and archive readiness.
