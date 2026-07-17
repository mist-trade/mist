# Verification Evidence

Verified on 2026-07-11 from the isolated backend and frontend worktrees.

## Automated checks

- Backend: `pnpm test:ci` — 63 suites, 430 tests passed.
- Backend: `pnpm typecheck`, `pnpm lint:check`, and `pnpm build` passed.
- Frontend: `pnpm test:ci` — 15 suites, 93 tests passed.
- Frontend: `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- `pnpm exec openspec validate add-strategy-portfolio-backtesting --strict`
  passed.

## MySQL and V1 API integration

- A disposable MySQL 8 container applied migrations `001` through `007` with
  the repository migration runner. The resulting schema contains the required
  snapshots, run status/stage enums, and `backtest_orders.expired_at` column.
- An eligible daily paired-rule strategy was created through `POST
/v1/strategies`. `POST /v1/strategy-backtests` returned HTTP 202 with an
  immutable pending snapshot.
- The processor completed the run through the V1 API with 4 signals, 4 orders,
  1 closed trade, 4 equity points, metrics, and numeric decimal API fields.
- Immediate V1 cancellation produced a terminal `cancelled` run with zero
  facts. An expired leased run with injected partial facts was reclaimed,
  cleared, and completed on attempt 2. Its fact counts and total return matched
  the clean run exactly.

## Known model limitations

The product deliberately uses persisted forward-adjusted daily bars, next
available open execution, and full fills. It does not model dividends, splits,
rights issues, complete exchange price-limit behavior, ST rules, liquidity, or
partial fills. These limitations are retained in immutable run snapshots and
shown in the operator workspace.

## Remaining manual visual check

Focused React tests and the production frontend build pass. Direct visual
inspection at desktop and narrow widths remains pending because the in-app
browser blocks the local `localhost` reload under its URL policy; no bypass was
attempted.

## Second-pass audit remediation (2026-07-17)

A follow-up read-only audit identified one blocking correctness bug and
several robustness gaps; all were addressed before the next validation gate:

- **Date-boundary timezone fix (blocking).** `new Date('YYYY-MM-DD')` parsed
  request/as-of dates as UTC midnight, but QMT/TDX persist daily K bars at
  Beijing midnight (UTC 16:00 the prior day), so `row.timestamp >= startDate`
  dropped the first day. The service and controller now parse every
  `YYYY-MM-DD` via `TimezoneService.parseDateString` (Asia/Shanghai). The
  frontend `formatDateTime` now renders via `Intl.DateTimeFormat` with
  `timeZone: 'Asia/Shanghai'`, so a Beijing-midnight bar no longer displays as
  the prior day. A new service test asserts `startDate=2026-01-01` persists as
  `2025-12-31T16:00:00.000Z`.
- **Snapshot field ownership.** `priceModel` and `limitations` now live solely
  in `configSnapshot` (matching the spec's "client reads the run configuration
  snapshot" requirement); the duplicate `priceModel` was removed from
  `strategySnapshot`. The frontend reads assumptions from the snapshot instead
  of hardcoding them.
- **Single config decode + strict decoder.** `processClaimedRun` decodes both
  snapshots exactly once and threads the typed values through
  `loadMarketData`/`toEngineInput`. The decoder now rejects `null`/`""`/
  non-finite values (`BACKTEST_CONFIG_SNAPSHOT_INVALID`) instead of coercing
  `"" -> 0` or `"abc" -> NaN` into the engine.
- **Serializer JSON-blob guard.** Snapshot/metrics/errorDetails columns are no
  longer recursed with decimal-field coercion, so a diagnostic like
  `{ commission: "provider unavailable" }` survives intact (only bigint/NaN/
  Date type-safe transforms apply inside blobs).
- **Frontend polling.** The poll loop now fetches run metadata only; the full
  equity series is fetched once on selection and once on terminal transition.
  Transient failures retry up to 3 times instead of permanently halting.
- **Frontend race conditions.** `versions` is cleared on strategy switch;
  `refreshBacktests`/`loadMoreBacktests` drop stale responses via a strategy-id
  ref guard; the positions button drives the guarded effect via a refresh tick
  instead of an unguarded parallel fetch.
- **Period and execution params.** The drawer period input is read-only
  (`日线 1440`); `StrategyBacktestRequest.period` is the literal `1440`. Empty
  optional execution params are omitted (`undefined`) rather than coerced to
  `0`, so a cleared fee field no longer silently produces a zero-cost backtest.
- **QMT marker batching + lease.** The QMT `effectiveDividendType` lookup is
  batched (`QMT_MARKER_BATCH_SIZE = 1000`) with lease renewal between batches,
  and a `renewLease` covers the loading→simulate gap, so a 50×10y universe can
  no longer expire the 30 s lease mid-check.
- **Cleanup.** `BacktestRun.source` no longer defaults to `EAST_MONEY`; the
  history-list return now uses the unavailable formatter (`-`) instead of
  `0.00%` for runs with null metrics.

## Third-pass audit remediation (2026-07-17)

A third read-only audit found three regressions from the second pass plus
several robustness gaps; all addressed:

- **Strategy-switch rule contamination (blocking).** `currentVersion` no longer
  falls back to `versions[0]` across strategies; while a strategy's versions
  load, the rule editor is cleared and the "更新当前策略" button is disabled so a
  stale previous strategy's rules cannot be written into the current one.
- **Terminal poll state machine (blocking).** The run-poll failure counter
  resets only after a successful run fetch; equity has its own independent
  bounded retry (see fourth pass) so a persistently failing equity fetch can
  no longer keep a terminal run polling forever, nor does it permanently leave
  a stale/empty chart. Terminal runs stop polling; the terminal transition
  refreshes equity and bumps the fact-page (trades/orders/signals/positions)
  once. Equity errors surface independently and never count against run polling.
- **History-list date leakage (blocking).** The history list now renders
  `startDate`/`endDate` via `formatBeijingDate` (Asia/Shanghai), so a persisted
  Beijing-midnight instant no longer leaks as the prior day's raw ISO string.
- **Strict snapshot decoders.** `readConfigSnapshot` now requires real
  `typeof === 'number'` values (rejects numeric strings, null, booleans) and
  re-validates finite/integer/range per field; `benchmarkCode` must be a
  six-digit string; `readStrategySnapshot` validates `lookbackBars 1..250` and
  a required exit rule.
- **Single date parse.** DTO uses `@Matches(BEIJING_DATE_REGEX)` (not
  `@IsDateString`); `createRun` parses each date once and passes the parsed
  values to `assertRequestBounds`, so validation and persistence cannot
  diverge.
- **optionalNumber NaN guard + typed inputs.** Empty/non-numeric optional
  params become `undefined` (never `NaN`→JSON null); drawer numeric fields use
  `type="number"` with min/max/step.
- **QMT marker provenance + fingerprint UI.** `configSnapshot` records
  `priceModelProvenance` (ingestion-contract declaration, not provider
  attestation); the snapshot tab now shows the fingerprint digest, algorithm,
  and "drift detection, not a replayable snapshot" purpose.
- **Async request-key guards.** `refreshBacktests` drops responses when the
  strategy id OR status filter changed; `loadMoreBacktestFacts` guards against
  run-id/tab changes via refs; stale append results no longer merge into a
  different run/tab.
- **Lease redundancy.** Removed the redundant `renewLease` immediately before
  the SIMULATING heartbeat. The remaining long synchronous stretches
  (`loadMarketData` + fingerprint on a large universe) cannot be preempted by a
  timer on the single event loop and are tracked with the MySQL integration
  verification (bounding via K-load batching or a longer lease).
- **Cleanup.** `BacktestSignal.source` no longer defaults to `EAST_MONEY`.

## Fourth-pass audit remediation (2026-07-17)

A fourth read-only audit found one correctness bug in the shared rule
evaluator and two scale risks; all addressed:

- **`neq` phantom-signal fix (blocking).** `eq`/`neq` previously used raw
  `===`/`!==`, so a missing indicator (`undefined !== 0` → true) produced
  phantom entry/exit signals on both live scan and backtest. `eq`/`neq` now
  respect the field's registered `valueType`: number fields treat
  missing/NaN/Infinity as "not evaluable, no match" (including `neq`), and
  string fields require both sides present. Five regression tests cover
  missing number, NaN, missing string, and the positive present-number case.
- **Engine evaluation cost.** `evaluateDateRules` now builds each current bar's
  `{current, previous}` evaluation context exactly once per date, shared by
  both the entry and exit rules, eliminating the prior per-(rule × bar)
  re-filter, re-map, and full indicator recompute (≈2× redundant work).
- **K query bounded.** `loadMarketData` now bounds the K query with
  `Between(startDate − warmup calendar days, endDate)` instead of
  `LessThanOrEqual(endDate)`, so a long-history security no longer pulls its
  entire persisted series. The fifth pass supersedes this calendar heuristic
  with keyset-paged in-range rows and exact per-security warmup selection.
- **`cnyToFen` safe-integer bound.** `initialCash`/`minCommission` are now
  capped at `MAX_BACKTEST_CNY` (1e12 CNY → 1e14 fen ≪ MAX_SAFE_INTEGER) in
  both the service validation and the processor decoder, preventing the
  round-trip error previously observed at `MAX_SAFE_INTEGER`.
- **Terminal equity retry.** Equity fetches now have their own bounded retry
  (up to 3) independent of the run-poll counter, so a transient terminal-state
  equity failure no longer permanently leaves a stale/empty chart, and a
  successful refresh clears a prior `loadError`.
- **Cleanup.** ECharts dynamic import gained a `.catch` (was unhandled
  rejection); the unused `.strategy-success` CSS class was removed.

### Remaining items (deferred, low-risk)

- The run-list cursor indexes do not cover definition-only / status-only
  filter shapes, and 007 carries a few redundant indexes. Modifying an
  already-applied migration risks drift (the runner keys on filename), so
  these belong in a follow-up `008` migration after checking
  `schema_migrations`.
- `loadMoreBacktests`/`loadMoreBacktestFacts` guards cover strategy-id, status
  filter, run-id, and tab, but not cursor/asOf; a full request-generation key
  is a future hardening step.
- Positions still issue a guarded refetch on both date change and the explicit
  button; a draft/applied date split is a future UX refinement.

### Verification

- Backend: 65 suites / 462 passed / 1 skipped (MySQL); typecheck, lint:check,
  build, OpenSpec strict, and `git diff --check` all clean.
- Frontend: 15 suites / 101 passed; typecheck, eslint, build clean.

## Fifth-pass implementation and verification (2026-07-17)

The post-audit modification plan is implemented without completing the three
real-MySQL-dependent tasks:

- Engine evaluation state is isolated by security, normalized bars and
  indicators are not rebuilt for each rule, and next-bar, pending-order, and
  trade lookups no longer rescan full collections. Shared-timestamp and
  non-finite-metric fixtures pass.
- Market-data loading uses `(timestamp,id)` pages for the requested range and
  the exact latest `lookbackBars + 1` rows per target. Loading, QMT-marker, and
  fingerprint checkpoints renew the lease and observe cancellation. The
  fingerprint is streamed into SHA-256 while retaining the locked
  `sha256-v1` compatibility digest.
- Typed route/query DTOs replaced controller string/number coercion; service
  JSON serialization has one recursive conversion path; redundant strategy
  validation and cancellation reads were removed. Migration 008 adds filtered
  run indexes and removes indexes made redundant by cursor indexes.
- Frontend run polling, equity retry, fact refresh, pagination, cancellation,
  and position draft/application state are independent. Request generations
  discard stale success/error results, terminal equity retries stop after
  three attempts, and malformed optional numbers fail visibly instead of being
  omitted.

Fresh evidence:

- Backend full Jest: 66 suites passed, 478 tests passed, 1 real-MySQL suite
  skipped (67 suites / 479 tests total).
- Backend TypeScript, full ESLint, and Nest production build passed; webpack
  compiled successfully.
- Frontend full Jest: 15 suites and 106 tests passed. TypeScript, full ESLint,
  and Next.js production build passed.
- Focused backend convergence suites: 7 suites and 87 tests passed. Focused
  strategy workspace suite: 20 tests passed.
- `openspec validate add-strategy-portfolio-backtesting --strict`, CI release
  contract checks, and both worktrees' `git diff --check` passed.
- `MIST_TEST_MYSQL_URL` is not configured. Tasks 9.1, 10.5, and 10.7 therefore
  remain unchecked pending the real MySQL cursor/persistence/recovery gate.

## Sixth-round implementation and verification (2026-07-17)

- Benchmark loading now derives the first portfolio equity timestamp from the
  earliest actual in-range target row and requires an exact benchmark row at
  that timestamp. Missing alignment fails with
  `BACKTEST_BENCHMARK_ALIGNMENT_MISSING` and stable benchmark/timestamp details;
  the engine independently returns null benchmark/excess metrics if its first
  equity point is unaligned.
- Processor snapshot decoding now requires `ruleSchemaVersion=v1`. Backtest
  error codes, JSON record cloning, and fingerprint canonical-row construction
  each have one source of truth. The locked fingerprint digest remains
  `2d1d98b257be04df01631f01ae426fc48edc4ad89925a1ff4bedc2543b638695`.
- DTO, service/processor, and frontend validation share the 1e12 CNY ceiling.
  T+1 compares fixed UTC+8 Beijing calendar days. Cancellation failures have a
  scoped visible frontend state, restore the button, preserve the current run,
  and clear after success or selection change.
- Backend full Jest passed: 66 suites and 484 tests, with the separate
  real-MySQL suite skipped. TypeScript, full ESLint, Nest build, CI release
  contracts, strict OpenSpec validation, and backend `git diff --check` passed.
- Frontend full Jest passed: 15 suites and 109 tests. TypeScript, full ESLint,
  Next.js production build, and frontend `git diff --check` passed using the
  installed project binaries.
- No migration was added or changed for this round. With
  `MIST_TEST_MYSQL_URL` unavailable, tasks 9.1, 10.5, and 10.7 remain unchecked.
