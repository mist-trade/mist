## 1. Baseline And V1 Contract Tests

- [x] 1.1 Record clean focused backend/frontend baseline commands and confirm
      implementation will preserve unrelated workspace changes and migration
      `006_strategy_platform_core.sql`.
- [x] 1.2 Add failing strategy definition DTO/service/controller tests for
      `entryRule`, optional `exitRule`, `lookbackBars`, independent
      `backtestEnabled`, version creation, and enablement rejection reasons.
- [x] 1.3 Add failing rule validator/evaluator/context tests proving accepted
      field paths are resolvable as-of, unsupported nested paths are rejected, and
      `crossesAbove`/`crossesBelow` use prior completed context without lookahead.
- [x] 1.4 Add failing backtest controller/service contract tests for the
      breaking V1 create payload, HTTP 202, current/explicit version resolution,
      bounded validation, immutable snapshots, list/detail/cancel, fact routes,
      equity, and as-of positions.
- [x] 1.5 Add failing frontend API and strategy editor tests for paired rules,
      backtest eligibility, canonical `qmt`, async run types, cancellation, and all
      portfolio result methods.

## 2. Migration And Shared Data Model

- [x] 2.1 Add migration-focused assertions for the next `007_*.sql`, including
      single-rule-to-entry-rule transformation, false backtest defaults, removal
      of development signal-only runs, table/column/index shape, enum values, and
      the guarantee that migration 006 is unchanged.
- [x] 2.2 Create `007_strategy_portfolio_backtesting.sql` to evolve strategy
      definitions/versions/runs, rename the physical signal fact table to
      `backtest_signals`, add order/trade/equity tables and indexes, and preserve
      TypeORM synchronize-off deployment semantics.
- [x] 2.3 Extend `StrategyDefinition`, `StrategyVersion`, and `BacktestRun`,
      rename unused `BacktestSignalResult` in place to `BacktestSignal`, and map all
      camelCase members to snake_case columns while keeping existing timestamp
      conventions and immutable snapshot fields.
- [x] 2.4 Add lower-case serialized enums and shared-data entities for signal
      kind, run stage, order side/status, trade status, `cancelled`,
      `BacktestSignal`, `BacktestOrder`, `BacktestTrade`, and
      `BacktestEquityPoint`.
- [x] 2.5 Export and register the evolved/new shared-data types through the
      existing barrels, TypeORM root configuration, `strategyEntities`, and
      `strategyProviders` without introducing any `PortfolioBacktest*` class.
- [x] 2.6 Run migration/schema and shared-data tests, then inspect generated SQL
      and entity metadata for foreign keys, terminal-result immutability, stable
      query indexes, and cascade behavior limited to run-owned facts.

## 3. Paired Strategy Rules And Shared Evaluation

- [x] 3.1 Implement the breaking V1 strategy DTO/entity/service mapping for
      `entryRule`, `exitRule`, and integer `lookbackBars` from 1 through 250, with
      legacy `rule` removed from public types.
- [x] 3.2 Implement `backtestEnabled` create/update/read behavior, validate the
      current version plus daily/source eligibility before enabling, and keep it
      independent from live enable/disable/archive status.
- [x] 3.3 Add a shared registered-field catalog with path/type/history/resolver
      metadata and tighten `StrategyRuleValidator` so every accepted path is
      available to both live and historical contexts.
- [x] 3.4 Extend `StrategyEvaluationContextBuilder` to produce bounded as-of K,
      security, and the specified MACD/RSI/KDJ/ADX/ATR/MA values from completed
      history only; reject `chan.*` and every uncatalogued path until a later stable
      source-aware historical resolver is specified.
- [x] 3.5 Implement all accepted evaluator operators, including numeric
      crossover semantics over prior/current contexts, while keeping evaluation
      pure and side-effect free.
- [x] 3.6 Update `StrategyScanService`, `StrategySignal`, scan results, and alert
      dedupe to evaluate paired rules and persist distinct `entry`/`exit` signal
      kinds without consulting `backtestEnabled`.
- [x] 3.7 Run paired-rule, field-catalog, context, scan, signal, alert, service,
      controller, and route metadata tests; verify identical live/historical
      fixtures produce identical match results.

## 4. Deterministic Portfolio Engine

- [x] 4.1 Define framework-free engine input/state/output types and fixed-point
      fen/share utilities, with normalized daily-bar sorting by date and canonical
      security code.
- [x] 4.2 Add red engine fixtures for close-signal/next-available-open fills,
      no same-bar lookahead, exit-before-entry ordering, both-rule matches, missing
      bars, end-of-range expiry, and repeat-run determinism.
- [x] 4.3 Implement the daily event loop, typed signal creation, pending order
      scheduling, stable side/security ordering, close marking, and open-position
      carry at the end date.
- [x] 4.4 Add red allocation fixtures for long-only behavior, equal equity
      slots, 100-share lot floors, fee-aware affordability, maximum positions,
      no pyramiding, whole-position exits, insufficient cash, and T+1.
- [x] 4.5 Implement cash, position, order, and trade lifecycle transitions for
      the approved A-share envelope, including auditable rejected/expired reasons
      and no partial fills.
- [x] 4.6 Add red execution-cost fixtures for directional 5 bps default
      slippage, both-side commission/minimum and transfer fee, sell-only stamp
      duty, per-fee half-up fen rounding, and editable overrides.
- [x] 4.7 Implement immutable normalized cost configuration and fixed-point
      fill/fee/cash accounting with the approved product defaults and benchmark
      `000300`.
- [x] 4.8 Add red metric fixtures and implement equity/benchmark/drawdown
      points plus total/annualized return, volatility, Sharpe, maximum drawdown and
      duration, Calmar, benchmark/excess return, win rate, profit factor, trade
      count, average holding days, turnover, and exposure with null zero-denominator
      ratios.
- [x] 4.9 Run the complete pure-engine suite twice with shuffled equivalent
      inputs and compare normalized signals, orders, trades, equity, and metrics.

## 5. Background Processor And Persistence

- [x] 5.1 Add failing processor tests for atomic pending-run claims, exclusive
      unexpired ownership, lease heartbeats, bounded progress/stage updates, one
      active job per instance, and cooperative event-loop yielding.
- [x] 5.2 Implement `StrategyBacktestProcessor` inside `mist-backend` with
      MySQL lease claiming/renewal, normalized data loading, lookback-only warmup,
      bounded engine batches, and batched fact persistence.
- [x] 5.3 Add failing coverage tests for 1–50 stock universes, daily-only and
      10-year limits, definition source compatibility, non-stock rejection,
      missing universe/benchmark series, internal gaps, and no datasource fetches
      during processing.
- [x] 5.4 Implement persisted-K coverage validation, structured missing-code
      errors, selected-source benchmark normalization, adjusted-price assumption
      snapshot fields, and next-available-bar handling.
- [x] 5.5 Add failing cancellation tests for immediate pending cancellation,
      running cancellation at the next batch boundary, terminal idempotence or
      conflict, and prevention of post-cancel fact writes.
- [x] 5.6 Implement cancellation request/status transitions and terminal
      timestamp/error behavior using `BacktestRunStatus.CANCELLED = 'cancelled'`.
- [x] 5.7 Add failing restart tests for expired leases, partial-fact cleanup,
      attempt increments, snapshot-based restart, unique run fact keys, and
      equivalence to a clean run.
- [x] 5.8 Implement expired-lease recovery that transactionally clears all
      engine-derived facts/metrics/progress and deterministically restarts without
      checkpoint state.
- [x] 5.9 Run processor/service integration tests against MySQL-compatible
      transaction semantics and verify failed/cancelled/completed runs are
      immutable and retain snapshots/error details.

## 6. Existing V1 Backtest API And Queries

- [x] 6.1 Reshape `CreateBacktestRunDto` and `StrategyBacktestService.createRun`
      to resolve current/explicit versions, enforce definition eligibility and
      request bounds, apply defaults, snapshot normalized inputs, persist pending,
      and return without executing.
- [x] 6.2 Extend `StrategyBacktestController` with HTTP 202 create, cursor run
      listing/filtering, detail/progress/metrics, and cancel while preserving the
      existing version-first controller prefix.
- [x] 6.3 Implement stable cursor-paginated signal, order, trade, and
      reconstructed as-of position queries with date/id tiebreakers and ownership
      checks.
- [x] 6.4 Implement the bounded ascending equity endpoint and detail envelopes
      that serialize fixed-point money/metrics safely without BigInt, `NaN`, or
      `Infinity` leaks.
- [x] 6.5 Add API tests for authorization-equivalent not-found boundaries,
      pagination cursors/filters, immutable terminal re-run behavior, disabled
      strategy history visibility, structured failures, and route metadata.
- [x] 6.6 Run focused strategy API/service tests plus backend typecheck and lint,
      and search the changed backend for legacy `version.rule`, synchronous
      `executeRun`, `mqmt`, and new `PortfolioBacktest*` names.

## 7. Strategy Editor And Frontend API

- [x] 7.1 Update `mist-fe/app/api/client.ts` strategy/backtest interfaces and
      methods for paired V1 rules, `backtestEnabled`, canonical `qmt`, async
      lifecycle/progress, metrics, cancel, equity, signals, orders, trades, and
      positions.
- [x] 7.2 Replace the single rule editor with separate entry/exit JSON editors,
      lookback input, and independent live-status/backtest switches while
      preserving existing local/API error placement.
- [x] 7.3 Add client-side eligibility guidance and field validation without
      duplicating backend rule evaluation; allow an empty exit only while
      backtesting is disabled.
- [x] 7.4 Run strategy editor/client tests and frontend typecheck, then confirm
      no strategy UI type or request still emits `rule` or `mqmt`.

## 8. Portfolio Backtest Operator Workspace

- [x] 8.1 Add failing component tests for the selected layout: run history and
      filters on the left, selected status/result on the right, and a new-backtest
      configuration drawer that preserves selection.
- [x] 8.2 Implement cursor-backed run history, stable selection, operational
      empty/error states, status/progress/headline values, and the full defaulted
      configuration drawer with eligibility reasons.
- [x] 8.3 Add failing lifecycle tests for bounded polling, terminal stop,
      unmount/selection cleanup, stale-response suppression, cancellation, and
      one-time terminal result refresh.
- [x] 8.4 Implement pending/running progress and cancellation behavior without
      reloading unrelated strategy workspace tabs.
- [x] 8.5 Add failing result tests for every metric card, null ratios,
      equity/benchmark/drawdown chart data, paginated trades/orders/signals,
      end/as-of positions, strategy/config assumptions, and structured errors.
- [x] 8.6 Implement metric cards and ECharts equity/benchmark/drawdown using the
      existing initialization, resize, disposal, theme, and test-mock lifecycle
      pattern.
- [x] 8.7 Implement lazy result tabs for trades, orders, signals, positions,
      snapshots, and errors, distinguishing empty results from failed requests and
      disclosing adjusted-price/full-fill exclusions.
- [x] 8.8 Run focused React tests, frontend typecheck, lint, and production build;
      inspect the strategies page at desktop and narrow widths for overflow,
      readable dense tables, drawer behavior, and chart cleanup.

## 9. End-To-End Verification And Handoff

- [ ] 9.1 Seed or fixture an eligible paired daily strategy and run a small
      end-to-end portfolio backtest through the V1 API, verifying 202, progress,
      completion, snapshots, facts, metrics, and UI rendering.
- [x] 9.2 Exercise cancellation and expired-lease recovery end to end, proving
      no duplicate/partial facts and result equivalence after retry.
- [x] 9.3 Run full relevant backend and frontend test/typecheck/lint/build suites,
      route-contract tests, migration validation, and
      `openspec validate add-strategy-portfolio-backtesting --strict`.
- [x] 9.4 Review the final diff for repository naming/formatting conventions,
      untouched migration 006 and unrelated changes, no Redis/Python/new container
      or gateway drift, and no fields/features from the explicit non-goals.
- [x] 9.5 Record exact verification evidence and remaining adjusted-price,
      corporate-action, exchange-limit/ST, liquidity, and partial-fill limitations
      before requesting code review and archive readiness.

## 10. V3 Convergence: Input Integrity, Query Scale, And Price Provenance

- [x] 10.1 Update proposal, design, strategy registry, portfolio-backtesting,
      and operator-UX specs for canonical market-data fingerprinting, database-level
      cursors with complete equity output, the `tdx`/`qmt` source allowlist, QMT
      ingestion-marker semantics, migration preflight, and Theme A worktree
      isolation; pass strict OpenSpec validation.
- [x] 10.2 Extend the branch-local migration and shared `BacktestRun` model with
      `market_data_fingerprint char(64)`, aligned run/scheduled-order/trade-entry
      cursor indexes, and schema assertions. Keep migration 006 unchanged and
      document that a target already recording 007 requires the additive delta as
      008 instead of editing applied history.
- [x] 10.3 Add red processor tests, then implement `sha256-v1` canonical hashing
      over the exact post-normalization universe/benchmark engine input, persist it
      under the active lease before simulation, retain it across reset, and fail a
      changed retry as `BACKTEST_MARKET_DATA_CHANGED` with no mixed facts.
- [x] 10.4 Add red eligibility/processor tests, then restrict portfolio runs to
      configured `tdx`/`qmt` sources, require a supported source before enabling
      backtesting, snapshot `tdx_front` or `qmt_front_ratio`, register and explicitly
      query `KExtensionQmt`, and reject selected QMT rows without the
      `front_ratio` ingestion marker.
- [ ] 10.5 Add red service/MySQL integration coverage, then push run, signal,
      order, trade, and as-of-position cursor/filter/limit work into SQL while
      preserving complete ascending equity output and exact `datetime(6)` run
      cursor precision with no duplicate or omitted boundary rows.
- [x] 10.6 Add frontend API/component tests, then restrict the new-run source
      choices to the selected definition configured `tdx`/`qmt` intersection and
      render the immutable source-specific price model instead of a hard-coded
      generic label.
- [ ] 10.7 Run focused and full backend/frontend tests, typechecks,
      non-mutating backend lint, builds, migration/schema checks, contract checks,
      strict OpenSpec validation, and final diff hygiene; record any environment-only
      UI/MySQL/recovery steps that remain rather than marking them complete without
      evidence.

## 11. Post-Audit Scale, Isolation, And Request-Convergence Hardening

- [x] 11.1 Isolate engine evaluation context per security, reuse normalized
      rolling bars, index next bars/pending orders/trades, and add shared-timestamp
      plus non-finite metric regression coverage.
- [x] 11.2 Replace calendar warmup approximation and unbounded K loading with
      per-security `lookbackBars + 1` selection, `(timestamp,id)` keyset pages,
      lease/cancellation checkpoints, and streaming fingerprint hashing that
      preserves the `sha256-v1` canonical bytes.
- [x] 11.3 Add typed route/query DTOs, remove redundant DTO/service narrowing
      and JSON conversion paths, reserve the currently unproduced cancelled-order
      enum value explicitly, and add migration 008 for filtered-run indexes and
      redundant-index cleanup.
- [x] 11.4 Separate frontend run polling, equity retry, fact refresh, paging,
      cancellation, and position draft/applied state; discard superseded requests
      with generation keys and reject malformed numeric input instead of silently
      omitting it.
- [x] 11.5 Add focused regression tests for terminal equity retry and fact
      refresh, stale run/fact responses, explicit position application, strict
      numeric payloads, controller DTOs, fingerprint compatibility, and engine
      cross-security isolation.

## V3 Verification Evidence (2026-07-16)

- Backend: `pnpm run typecheck`, `pnpm run lint:check`, `pnpm run build`, and
  the full Jest suite passed (65 suites, 462 passed tests, 1 environment-gated
  MySQL test skipped); migration-runner tests and `pnpm run ci:contracts`
  passed.
- Frontend: direct project ESLint and TypeScript binaries passed, the full Jest
  suite passed (15 suites, 101 tests), and the Next.js production build passed.
- UI: production output was inspected at 1440x900 and 390x844. The document had
  no horizontal overflow at either width; narrow result tables scroll inside a
  310px container with 620px nowrap content, and the 336px single-column new-run
  drawer offered only the selected definition's configured `qmt` source.
- Remaining environment-only evidence: run the gated real-MySQL cursor suite
  with `MIST_TEST_MYSQL_URL`, and run task 9.1 against a migrated Mist API plus
  persisted K/QMT extension data. These gaps keep tasks 10.5, 10.7, and 9.1
  unchecked.

## 12. Sixth-Round Correctness And Contract Convergence

- [x] 12.1 Require exact benchmark alignment to the earliest actual in-range
      target timestamp, add structured alignment failure details, and make the
      pure engine return null benchmark/excess metrics when its first point is
      defensively unaligned.
- [x] 12.2 Enforce `ruleSchemaVersion=v1` while decoding strategy snapshots,
      centralize backtest error codes, and apply the shared CNY ceiling in DTO,
      service/processor, and frontend validation.
- [x] 12.3 Replace duplicate JSON clone and fingerprint field-list logic,
      preserve the locked `sha256-v1` digest, adopt the clarified function
      names, and compare T+1 dates by fixed UTC+8 Beijing calendar day.
- [x] 12.4 Surface cancellation-scoped frontend failures, restore the cancel
      action in all outcomes, preserve the current run on failure, and clear the
      error on success or selection change.
- [x] 12.5 Add focused processor, engine, DTO, and React regression coverage for
      benchmark alignment, snapshot versions, every fingerprint field, CNY
      bounds, Beijing T+1, and cancellation failure/success behavior.
- [x] 12.6 Run and record the full macOS backend/frontend, build, lint,
      typecheck, OpenSpec strict, CI contract, and diff-hygiene verification;
      leave 9.1, 10.5, and 10.7 unchecked without the real MySQL environment.

## Sixth-Round Verification Evidence (2026-07-17)

- Backend: full Jest passed with 66 suites and 484 tests; the separate real
  MySQL suite remained skipped. TypeScript, full ESLint, Nest production build,
  and CI release contract checks passed.
- Frontend: full Jest passed with 15 suites and 109 tests. TypeScript, full
  ESLint, and Next.js production build passed using the installed project
  binaries.
- `openspec validate add-strategy-portfolio-backtesting --strict` and both
  worktrees' `git diff --check` passed. The locked `sha256-v1` fingerprint
  digest remained unchanged.
- `MIST_TEST_MYSQL_URL` is not configured, so tasks 9.1, 10.5, and 10.7 remain
  unchecked as required.
