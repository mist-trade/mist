## Context

This change is the later portfolio-backtesting child anticipated by
`define-strategy-platform-roadmap`. The first strategy wave deliberately
stopped at synchronous signal replay. The current implementation therefore has
one `StrategyVersion.rule`, a `StrategyRuleEvaluator` whose crossover operators
never match, a context builder that only supplies K-line and security values,
and a `StrategyBacktestService` that loops over K rows synchronously and counts
matches. It has no execution, cash, positions, costs, equity, recovery, or
operator analytics.

The strategy platform has not entered production. We can make a deliberate
breaking change to its V1 payloads and development data instead of maintaining
two strategy schemas or adding `/v1/portfolio-backtests`. The existing
version-first routes and established class names remain the product boundary.

Operational constraints are equally important:

- `apps/mist` is the deployed public API owner; `apps/schedule` is not in the
  default production stack.
- MySQL is already required and TypeORM synchronization is disabled. Schema
  changes must enter a new `007_*.sql` migration; migration `006` is immutable.
- Redis, a Python backtest engine, and a separate worker container are not part
  of the current deployment.
- Daily K data has no adjustment dimension. Current TDX collection requests
  `front`; current QMT collection requests and persists the declared
  `front_ratio` ingestion marker. EF daily collection has no equivalent
  adjustment contract, so V1 portfolio backtesting supports only configured
  `tdx` and `qmt` sources. This remains an adjusted-price approximation, not
  explicit dividend, split, or rights-issue accounting.
- The active experimental TDX realtime slice is isolated from portfolio
  semantics: it writes no K data and invokes no scanner or strategy side
  effects. It does plan separate `app.module.ts` and `schedule.module.ts`
  wiring, so implementation uses a dedicated worktree and reconciles module
  registration at integration time.
- Backend TypeScript uses camelCase members, snake_case database columns,
  uppercase enum members with lower-case serialized values, kebab-case files,
  single quotes, and trailing commas. Frontend TypeScript uses the existing
  strict, double-quoted style and ECharts lifecycle wrapper.

The initial operating envelope is A-share long-only, at most 50 securities,
daily bars, and a date range of at most 10 years. The intended operator is the
same strategy workspace user who defines rules and inspects live signals.

## Goals / Non-Goals

**Goals:**

- Make one V1 strategy version express paired entry and exit rules using the
  same validated evaluator for live scans and historical simulation.
- Add a separate `backtestEnabled` eligibility switch without coupling it to
  live-scan lifecycle status.
- Turn the existing `/v1/strategy-backtests` resource into an asynchronous,
  cancellable, restart-safe portfolio backtest workflow.
- Implement deterministic A-share execution, cost, portfolio, equity, and
  benchmark semantics in a native TypeScript engine.
- Preserve immutable strategy/config snapshots and auditable signal, order,
  trade, and equity facts.
- Detect changes to the exact persisted market-data input before retrying an
  abandoned run; fail safely rather than combine facts from different inputs.
- Execute cursor pagination in MySQL for unbounded run/fact histories while
  preserving the complete bounded equity-series contract.
- Deliver a complete operator UI with run history, configuration, progress,
  metrics, charts, and fact inspection.
- Make code and naming conventions explicit acceptance criteria, not cleanup
  work deferred until after implementation.

**Non-Goals:**

- Minute/weekly/monthly backtests, intraday execution, short selling,
  leverage, margin, futures/options, or multi-currency accounting.
- Pyramiding, partial fills, liquidity/volume impact, full limit-up/limit-down
  matching, ST-specific price limits, suspension calendars beyond available
  bar data, or order-book simulation.
- Explicit corporate-action cash/share events. Forward-adjusted stored prices
  remain an approximation and this limitation is shown in the run snapshot.
- Arbitrary user code, a second strategy DSL, a new API version, a second
  backtest resource, Redis, Python, or a new deployment container.
- Report/PDF/CSV export, parameter optimization, walk-forward testing,
  multi-strategy portfolios, or automatic backtest execution when a switch is
  enabled.

## Decisions

### 1. Reshape the existing V1 strategy contract in place

`StrategyRuleSchemaVersion.V1` remains the only schema enum value, but a
`StrategyVersion` stores:

```text
entryRule      required declarative expression
exitRule       optional unless backtesting is enabled
lookbackBars   integer from 1 through 250
validationSummary
```

`StrategyDefinition.backtestEnabled` defaults to `false`. It controls whether
new portfolio runs may be created; it does not enqueue work. Strategy
`status` continues to control live scanning. The two fields are independent:
an enabled live strategy may be ineligible for backtesting, and an archived or
disabled live strategy may retain old completed runs. Hard deletion is not
introduced.

Setting `backtestEnabled=true` requires the current version to have valid entry
and exit rules, the definition to include `Period.DAY`, and at least one
configured source from the V1 portfolio allowlist `{tdx, qmt}`. Setting it to
false leaves entry rules required but permits an absent exit rule. Creating a
run revalidates the selected version, requested source, and definition; the
switch is therefore an eligibility gate, not a trusted cached validation
result.

Alternative considered: add rule schema V2 and keep V1 unchanged. The platform
has no production consumers, and a second rule model would force live scans,
backtests, and the editor to carry compatibility logic before real usage.

Alternative considered: use `backtestEnabled` to start runs automatically.
Eligibility and execution are different operator actions; automatic execution
would make a configuration update unexpectedly expensive and harder to audit.

### 2. Make accepted rule semantics complete and as-of safe

`StrategyRuleValidator`, `StrategyRuleEvaluator`, and
`StrategyEvaluationContextBuilder` remain the shared boundary. Validation is
tightened from root-only checks to a field registry that binds each accepted
path to its type, required history, and context resolver. A field path is
rejected unless both live scan and backtest contexts can resolve it. This
prevents the current situation where `indicator.*` and `chan.*` pass validation
but evaluate as `undefined`.

The version `lookbackBars` value must meet the greatest required-history value
among both rules. For example, a registered field that needs 34 prior bars is
rejected when the version declares fewer than 34; the backend returns the field
path and required minimum rather than accepting a permanently incomplete
context.

The initial V1 field catalog is explicit:

- `k.open`, `k.high`, `k.low`, `k.close`, `k.volume`, and `k.amount`;
- `security.code` and `security.type`; and
- `indicator.macd.macd`, `indicator.macd.signal`,
  `indicator.macd.histogram`, `indicator.rsi14`, `indicator.kdj.k`,
  `indicator.kdj.d`, `indicator.kdj.j`, `indicator.adx14`,
  `indicator.atr14`, `indicator.ma13`, and `indicator.ma60`.

`chan.*` is rejected in this change. The active Chan Phase A refactor means
there is not yet one stable, source-aware, historical as-of field contract to
freeze into portfolio results. A later focused change can register Chan paths
after that contract and its lookahead fixtures are stable; rejecting them now
is preferable to the current silent non-match behavior.

For every evaluation timestamp, the context builder receives only completed
bars at or before that timestamp plus at most `lookbackBars` prior bars.
Indicator resolvers compute as-of values from that bounded history.
Unsupported paths are rejected even if their root was previously accepted.

`crossesAbove` means the left field was less than or equal to the numeric
threshold on the previous completed bar and is greater on the current bar.
`crossesBelow` is the inverse. The first context without a prior resolved value
cannot cross. All accepted logical and comparison operators must produce the
same pure result in scan and backtest tests.

Live scans evaluate both rules and persist signal kind `entry` or `exit`.
Their dedupe key includes signal kind. A timestamp may therefore produce both
facts when both rules match; portfolio execution applies the ordering rule in
Decision 5.

Alternative considered: implement a second evaluator optimized for the
backtest engine. That would recreate the live/historical drift that the shared
strategy model was intended to prevent.

Alternative considered: keep accepting arbitrary nested paths under known
roots. Silent non-matches are more dangerous than a clear validation error and
make a backtest appear valid when it did not evaluate the authored strategy.

### 3. Extend established API and class names instead of adding a parallel module

The public resource stays `/v1/strategy-backtests`. The implementation keeps
`StrategyBacktestService`, `CreateBacktestRunDto`, `BacktestRun`, and
`BacktestRunStatus`, and adds only the roles the current code lacks:

- `StrategyBacktestProcessor`: MySQL lease claiming, data loading, cooperative
  chunking, persistence, heartbeats, cancellation, and terminal status.
- `StrategyBacktestEngine`: framework-independent deterministic portfolio
  state transitions over normalized input.
- `BacktestSignal`, `BacktestOrder`, `BacktestTrade`, and
  `BacktestEquityPoint`: consistently named auditable result facts.

The existing `BacktestSignalResult` is renamed in place to `BacktestSignal`,
and its physical table is renamed to `backtest_signals` in migration 007. This
is a breaking cleanup of the unused V1 contract, not a parallel
`PortfolioBacktestSignal` type.

Alternative considered: introduce `/v1/portfolio-backtests` and
`PortfolioBacktestService`. That would duplicate routing, query, version,
signal, and operator concepts while leaving the existing backtest resource
ambiguous.

### 4. Run asynchronous jobs inside `mist-backend` with MySQL leases

`POST /v1/strategy-backtests` validates and snapshots the request, persists a
`pending` run, returns HTTP 202, and does not execute the simulation on the
request thread. A `StrategyBacktestProcessor` provider in `mist-backend`
polls for work and atomically claims one pending run or one running run with an
expired lease. Lease owner, expiry, heartbeat, attempt count, stage, processed
work, total work, and percentage are stored on `BacktestRun`.

The processor performs bounded batches and yields to the event loop between
batches so API traffic remains responsive. Multiple backend replicas may poll;
only the active lease owner may mutate a run. A running cancellation request
is observed between batches. Pending cancellation becomes `cancelled`
immediately; running cancellation records the request and becomes `cancelled`
after the current bounded batch.

If a process dies and its lease expires, the next owner transactionally removes
all partial facts for that run, resets engine-derived fields while retaining the
market-data fingerprint, and increments the attempt count. It reloads the exact
engine input and compares its canonical `sha256-v1` fingerprint before
simulation. Unchanged input deterministically restarts from the snapshots;
changed input fails as `BACKTEST_MARKET_DATA_CHANGED` without retaining mixed
facts. V1 deliberately does not checkpoint portfolio state or materialize K
input. Terminal states are `completed`, `failed`, and `cancelled`; non-terminal
states are `pending` and `running`.

Alternative considered: Redis/BullMQ or a new worker deployment. Neither is in
the production topology, so it would turn a product feature into an
infrastructure migration. The pure engine and processor boundary allows that
move later without changing the API or result schema.

Alternative considered: resume from checkpoints. Correctly restoring cash,
lots, pending next-open orders, fee accumulators, and metrics is more complex
than replaying at this bounded V1 scale. Clean deterministic retry is easier to
prove.

### 5. Use one deterministic daily event order

The engine processes a union of trading dates in ascending order. Within a
date it uses this sequence:

1. Execute previously scheduled exit orders at each security's next available
   daily open.
2. Execute previously scheduled entry orders at each security's next available
   daily open, ordered by canonical security code.
3. Mark positions and cash to that date's latest available close and emit one
   equity point.
4. Build contexts from completed bars and evaluate exit then entry rules.
5. Persist matching signal facts and schedule their orders for the security's
   next available open after the signal bar.

Evaluation state is isolated by canonical security code. Each security keeps a
rolling normalized-bar window and its own previous context; a timestamp shared
by multiple securities is never a cache key. The engine reuses the normalized
bars prepared for execution, so entry and exit evaluation does not repeat
date parsing, numeric conversion, sorting, or indicator calculation. Pending
orders, next bars, and trades are indexed by their lookup keys rather than
rescanning full arrays inside the date loop.

No order may execute on the bar that produced its signal. Missing bars do not
invent prices: a pending order waits for that security's next available open;
if none exists within the requested range it expires with a reason. An exit and
entry for the same security may both execute at the same later open, in exit
then entry order. Entry signals while already holding are recorded but do not
pyramid; exit signals without an open position are recorded but produce no
executable quantity.

Stable date, side, and security ordering plus immutable inputs make repeated
runs byte-for-byte equivalent after ignoring database ids and timestamps.

Alternative considered: close-to-close execution. It hides a one-bar lookahead
because a close signal cannot be known before that same close is traded.

Alternative considered: database row order. Repository ordering is not a
portfolio allocation rule and can make equal-slot results change across runs.

### 6. Model the approved A-share execution envelope explicitly

V1 trades only `SecurityType.STOCK`, long-only, with no leverage. Each open
security uses one of `maxPositions` equal-weight slots. At an entry open, target
notional is current portfolio equity divided by `maxPositions`; quantity is
floored to a 100-share lot. Fees are included in the affordability check and
quantity is reduced by whole lots until cash is sufficient. Zero affordable
lots produces a rejected order fact. An exit closes the whole position. Shares
bought on a trade date cannot be sold until a later trade date (T+1).

Every executable order is fully filled at the adjusted open plus directional
slippage:

```text
buy fill  = open * (1 + slippageBps / 10_000)
sell fill = open * (1 - slippageBps / 10_000)
```

Fill price is rounded to CNY 0.01. Cash, notional, and fees use integer fen
internally; share quantities are integers. Each fee is rounded half-up to CNY
0.01 before cash is updated. This avoids accumulating binary floating-point
cash errors without adding a numeric dependency.

The product defaults, all captured in `configSnapshot`, are:

| Field             |       Default | Rule                                  |
| ----------------- | ------------: | ------------------------------------- |
| `initialCash`     | CNY 1,000,000 | Must be positive                      |
| `maxPositions`    |            10 | Integer from 1 through 50             |
| `slippageBps`     |             5 | From 0 through 10,000                 |
| `commissionRate`  |        0.0003 | Both sides; from 0 through 1          |
| `minCommission`   |         CNY 5 | Per filled order; non-negative        |
| `stampDutyRate`   |        0.0005 | Sell side only; from 0 through 1      |
| `transferFeeRate` |       0.00001 | Both sides; from 0 through 1          |
| `benchmarkCode`   |      `000300` | Same selected source and daily period |

Rates are editable request inputs because statutory and broker costs change.
The run never rereads application defaults after creation. V1 assumes full
fills and intentionally does not infer limit status, ST status, or liquidity
from incomplete metadata.

Alternative considered: use broker-specific hard-coded fees. Backtest history
would change silently when defaults change. Snapshotting editable rates makes
the assumption visible and reproducible.

### 7. Validate price provenance and fingerprint the exact engine input

The create request names one strategy definition, an optional version from that
definition, 1 through 50 canonical stock codes, `Period.DAY`, one configured
source from `{tdx, qmt}`, inclusive dates spanning no more than 10 years,
execution settings, and benchmark code. Omitting the version resolves the
current version at creation time. Both the resolved strategy version and
normalized configuration are copied into JSON snapshots on the run.

The processor loads in-range K rows with `(timestamp, id)` keyset pages and
loads exactly the latest `lookbackBars + 1` pre-range rows independently for
each selected stock. The extra row supplies the previous-bar context needed by
the first warmup evaluation; benchmark rows are bounded to the requested range.
Loading checkpoints renew the lease, observe cancellation, and yield between K
pages, security batches, and QMT marker batches. No warmup row may create a
trade or contribute to requested-range metrics. Every selected stock and benchmark must
have usable source/period coverage; otherwise the run fails with a structured
coverage error identifying missing codes. For QMT, every K row actually passed
to the engine, including warmup, in-range universe, and benchmark rows, must
have a persisted `KExtensionQmt.effectiveDividendType` ingestion marker equal to
`front_ratio`; otherwise the run fails as `BACKTEST_PRICE_MODEL_UNSUPPORTED`.
That marker records the adjustment contract requested by the current ingestion
path and is not independent provider attestation. TDX likewise relies on its
`dividendType=front` request contract. Gaps inside otherwise usable series
follow the next-available-bar rule. Open positions at `endDate` remain open,
are marked to their last available close, and appear in end positions; V1 does
not force liquidation.

The configuration snapshot records `priceModel=tdx_front` or
`priceModel=qmt_front_ratio`, `marketDataFingerprintAlgorithm=sha256-v1`, and
the existing corporate-action/execution limitations. The engine never calls a
raw datasource or fetches data during a run.

After constructing the exact `bars` and `benchmarkBars` arrays consumed by the
engine, the processor converts every row through `toEngineBar`, labels its role,
sorts by role/security code/timestamp, and streams canonical JSON directly into
the SHA-256 hash rather than materializing a second full canonical payload.
Fingerprint checkpoints retain lease/cancellation responsiveness without
changing the canonical byte sequence. Each row includes role, security code,
security type, source, period, ISO-8601 timestamp, open, high, low, close,
volume, and amount. Only selected warmup and in-range rows are included; older
queried-but-unused rows are excluded. The first owner persists the 64-character
SHA-256 digest under its active lease before entering `SIMULATING`. A retry
compares rather than overwrites it.

The fingerprint detects input drift; it is not a replayable market-data
snapshot. A completed historical run cannot reconstruct overwritten K rows from
the digest alone. Materializing run input remains outside V1.

The first processor lease owner establishes the fingerprint only after it has
built the exact engine input. Market-data changes between create-time and that
first claim are therefore part of the first run input, not drift. Only a later
owner retrying the same run compares against that retained baseline and can
fail with `BACKTEST_MARKET_DATA_CHANGED`; the create API remains a lightweight
asynchronous 202 and does not load or materialize K data.

Alternative considered: fetch missing history on demand. That would mutate the
input dataset during processing and make retries depend on external runtime
availability.

Alternative considered: continue retrying when the digest changes. That would
silently attach one run identity to two economic inputs, so V1 prefers an
auditable terminal failure.

### 8. Persist run state and facts for audit-oriented queries

Migration `007_strategy_portfolio_backtesting.sql` evolves the existing tables
and adds the following logical model:

```text
strategy_definitions
  + backtest_enabled

strategy_versions
  rule -> entry_rule
  + exit_rule, lookback_bars, validation_summary

backtest_runs
  existing identity/range/status/timestamps
  + strategy_snapshot, config_snapshot
  + market_data_fingerprint
  + stage/progress/lease/retry/cancel fields
  + metrics, error_code, error_details

backtest_signals          historical entry/exit matches and snapshots
backtest_orders           scheduled/filled/rejected/expired execution facts
backtest_trades           open/closed position lifecycles and realized P&L
backtest_equity_points    daily cash, market value, equity, benchmark,
                          drawdown, and exposure
```

`BacktestTrade` is the position lifecycle record. An open trade has no exit
fields; a closed trade has entry/exit orders, prices, fees, realized P&L, and
holding days. Positions at an `asOf` date are reconstructed from trades, so V1
does not store a per-day-per-security position snapshot table.

Run facts are immutable after a terminal state. Strategy/config snapshots make
old results queryable even after the definition changes or
`backtestEnabled` becomes false. The service exposes:

```text
POST /v1/strategy-backtests                         -> 202 pending run
GET  /v1/strategy-backtests                         -> cursor run list
GET  /v1/strategy-backtests/:runId                  -> detail/progress/metrics
POST /v1/strategy-backtests/:runId/cancel           -> cancellation state
GET  /v1/strategy-backtests/:runId/equity           -> complete daily series
GET  /v1/strategy-backtests/:runId/signals          -> cursor page
GET  /v1/strategy-backtests/:runId/orders           -> cursor page
GET  /v1/strategy-backtests/:runId/trades           -> cursor page
GET  /v1/strategy-backtests/:runId/positions?asOf=  -> reconstructed page
```

Run listing supports strategy/status filters and stable newest-first cursors.
Runs, signals, orders, trades, and reconstructed positions apply cursor
predicates, ordering, and `limit + 1` in MySQL rather than loading the full
result into memory. Ascending fact cursors use an explicit
`time > cursorTime OR (time = cursorTime AND id > cursorId)` predicate; the
newest-first run cursor uses the inverse comparison. Position lifecycle
filtering is also applied in SQL before pagination. Equity is returned as one
bounded ascending series.

The run cursor must preserve the precision of `backtest_runs.created_at`, which
is `datetime(6)`. The implementation carries an exact database microsecond sort
value in the opaque cursor instead of round-tripping it through JavaScript
millisecond `Date.getTime()`. MySQL integration tests cover equal timestamps,
distinct values within one millisecond, filters, and page boundaries with no
duplicates or omissions. Migration
`008_strategy_portfolio_backtesting_indexes.sql` adds covering run indexes for
definition/status filtered history queries and removes single-column or prefix
indexes made redundant by the portfolio cursor indexes. Query indexes align
with run/created time, signal time, scheduled order time, and trade entry time. Re-running creates a new run
and new snapshot; no endpoint mutates or overwrites a terminal run.

`BacktestOrderStatus.CANCELLED` remains a reserved persisted/API contract value
for later order-level cancellation even though V1 cooperative run cancellation
does not currently emit it. If a running cancellation arrives after one or more
bounded fact batches were committed, those already persisted facts remain as
the audit trail of work completed before the cancellation boundary; the
cancelled run is never reclaimed or presented as a completed result.

Alternative considered: store one position row per security per date. It would
multiply storage for information already derivable from trade lifecycles and
is unnecessary for the 50-security V1 envelope.

### 9. Define portfolio metrics once and store their inputs

On completion, `BacktestRun.metrics` contains:

- total return and annualized return using 252 trading days;
- annualized volatility from daily equity returns and Sharpe ratio with a zero
  V1 risk-free rate;
- maximum drawdown, peak-to-recovery duration in trading days, and Calmar
  ratio;
- benchmark return and excess return over the same date-aligned series;
- closed-trade win rate, profit factor, trade count, and average holding days;
- turnover as filled notional divided by average equity; and
- average exposure as invested market value divided by equity.

The equity points persist the daily inputs used to calculate these values.
Ratios whose denominator is zero, whose input is non-positive where the formula
requires a positive base, or whose result is non-finite are `null`, never
`Infinity` or `NaN`.
The processor derives the first portfolio equity timestamp from the earliest
in-range target K row across the requested universe. The benchmark MUST contain
an exact row at that timestamp; otherwise the run fails with
`BACKTEST_BENCHMARK_ALIGNMENT_MISSING` and fixed benchmark/timestamp details.
Benchmark value starts at the portfolio initial cash on that same timestamp.
As a defensive pure-engine boundary, a series whose first equity point lacks a
benchmark value produces null benchmark and excess returns instead of silently
using a later base. Metric formulas live beside the pure engine and have fixed
fixture tests.

Alternative considered: calculate metrics only in the frontend. That would
duplicate formulas, make API clients disagree, and lose the audited result
when presentation code changes.

### 10. Use the selected operator layout and existing frontend patterns

The Backtests tab becomes a split workspace: compact run history and filters on
the left, selected run detail on the right. “New backtest” opens a configuration
drawer rather than replacing the result view. Non-terminal rows poll detail at
a bounded interval and expose cancel; polling stops at a terminal state or
when the component unmounts.

Run polling and result loading use independent state machines. A terminal
transition stops run polling, refreshes the active fact family immediately,
and starts a bounded three-attempt equity refresh whose failures do not restart
run polling. Run-list and fact requests carry monotonically increasing request
generations so selection, filter, tab, cursor, or as-of changes discard stale
successes and errors. The positions date has draft and applied values; typing
does not query until the operator applies it.

The detail pane shows status/progress first, then metric cards and ECharts
series for portfolio equity, benchmark, and drawdown. Tabs expose trades,
orders, signals, end/as-of positions, the immutable configuration/strategy
snapshot, and structured failure details. The strategy editor uses separate
entry/exit JSON areas and a `backtestEnabled` switch, explains why an incomplete
strategy cannot enable backtesting, and keeps live status controls separate.
The new-run source selector contains only the selected definition configured
sources intersected with `{tdx, qmt}`. Result assumptions render the immutable
source-specific `tdx_front` or `qmt_front_ratio` snapshot value rather than a
hard-coded generic price label.

Frontend API types use `qmt`, matching backend `DataSource.QMT`; the stale
`mqmt` label/value is removed. The UI continues to call the Mist backend base
and never calls datasource or raw-provider routes.

Alternative considered: a standalone analytics route. The selected split view
preserves context across repeated runs and matches the existing single
strategy-operator workspace.

### 11. Enforce repository style and test boundaries during implementation

No `PortfolioBacktest*` parallel class family is introduced. New filenames are
kebab-case and services/entities are registered through the existing
`strategyEntities` and `strategyProviders` arrays. Entity members remain
camelCase with explicit snake_case column names, and timestamp names remain
`createTime`, `updateTime`, `startedAt`, and `completedAt`.
`BacktestRunStatus.CANCELLED = 'cancelled'` follows the existing enum pattern.

Backend tests remain colocated `*.spec.ts`; frontend tests remain
`__tests__/*.test.tsx`. Implementation follows TDD and must include fixtures
for lookahead prevention, next-open execution, exit-before-entry ordering,
equal-slot sizing, 100-share lots, T+1, every fee side/minimum, missing bars,
stable tie ordering, cancellation, expired-lease restart, open end positions,
and repeat-run determinism. MySQL integration tests additionally prove SQL
cursor boundaries, microsecond run ordering, and no duplicate/omitted facts.
Route metadata and strict OpenSpec validation stay in the verification set.

## Risks / Trade-offs

- **In-process work competes with API traffic** -> bound processing and write
  batches, yield between batches, limit one active job per processor instance,
  and keep the engine movable behind `StrategyBacktestProcessor`.
- **MySQL lease races produce duplicate work** -> claim atomically, require
  lease ownership for writes, use run-scoped unique keys, and clear partial
  facts before a deterministic retry.
- **Persisted K rows change between attempts** -> retain a canonical digest of
  the exact first-attempt engine input and fail a retry on drift without mixed
  facts; do not claim the digest is a replayable snapshot.
- **Adjusted prices overstate real-world fidelity** -> label the approximation
  in every snapshot/result view and exclude explicit corporate actions from
  performance claims.
- **Missing exchange microstructure can make fills optimistic** -> show the
  full-fill assumption and keep limit/ST/liquidity behavior out of V1 rather
  than partially model it.
- **A rule accepted today could be unevaluable historically** -> bind
  validation to the shared field registry and require as-of fixtures for every
  accepted field/operator.
- **Cost defaults become stale** -> make all rates editable and snapshot them;
  update only defaults in a later reviewed change without affecting old runs.
- **A 50-security, 10-year run can create many facts** -> batch inserts,
  aligned indexes, database-level cursor pagination, and one bounded equity
  series. Preserve `datetime(6)` precision in run cursors.
- **An edited migration file is skipped by an environment that already applied
  it** -> query `schema_migrations` before deployment; revise branch-local 007
  only for targets where it is absent, otherwise ship the additive correction
  as 008.
- **Breaking V1 migration discards meaning from old signal-only runs** -> the
  feature has no production users; migration 007 removes development-only
  signal-run facts rather than pretending they are portfolio results, while
  preserving and transforming strategy definitions/versions.

## Migration Plan

1. Add failing unit/contract tests for the paired V1 strategy payload,
   eligibility switch, evaluator completeness, async 202 API, engine
   semantics, processor lifecycle, and frontend types.
2. Add `007_strategy_portfolio_backtesting.sql`. Set
   `backtest_enabled=false`; rename existing `rule` data to `entry_rule`, add a
   nullable `exit_rule`, and set `lookback_bars=1`. Remove development-only
   signal backtest runs/results before reshaping the result schema, because
   they cannot be converted into portfolio outcomes. Before deployment, query
   `schema_migrations`; if the target has already recorded 007, leave it
   immutable and put the fingerprint column and pagination indexes in 008.
3. Update shared-data enums/entities and exports without changing migration
   006 or enabling TypeORM synchronization.
4. Update strategy DTOs, definition service, rule field registry, validator,
   evaluator, context builder, signal kind persistence, and scan dedupe.
5. Implement the pure fixed-point engine and metric fixtures, then add the
   MySQL-backed processor, source-specific price validation, canonical input
   fingerprinting, recovery, cancellation, and batched persistence.
6. Extend the existing controller/service and typed frontend API client; build
   the approved split result view and configuration drawer.
7. Run focused and full backend/frontend tests, MySQL cursor/fingerprint
   integration tests, typechecks, non-mutating backend lint, builds, migration
   checks, route-contract checks, and strict OpenSpec validation.
8. Deploy migration and backend together, then frontend. No gateway or
   container topology change is required.

Rollback requires stopping processors, reverting backend/frontend artifacts,
and restoring the pre-007 database backup. Because legacy signal-only run facts
are intentionally removed, a schema-only down migration cannot restore them.

## Open Questions

There are no blocking V1 design questions. Later changes must separately decide
minute-bar execution, explicit corporate actions, complete exchange limit/ST
rules, liquidity/partial fills, report export, worker extraction, and strategy
parameter optimization; none may be inferred into this implementation.
