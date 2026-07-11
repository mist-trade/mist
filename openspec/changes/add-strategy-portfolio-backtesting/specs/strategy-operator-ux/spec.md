## MODIFIED Requirements

### Requirement: Strategy UX Shall Use Mist Backend Strategy APIs

The strategy operator workspace SHALL call Mist backend strategy APIs through
the configured Mist API base path and version-first `/v1/*` endpoints,
including all portfolio backtest lifecycle and result routes.

#### Scenario: Strategy API calls are made

- **WHEN** the strategy workspace loads or performs a strategy action
- **THEN** the frontend MUST call Mist backend endpoints under `/v1/strategies`,
  `/v1/strategy-signals`, `/v1/strategy-alert-events`,
  `/v1/strategy-scans/run`, or `/v1/strategy-backtests`
- **AND** it MUST NOT call datasource services or raw provider endpoints
  directly

#### Scenario: Backtest result families are loaded

- **WHEN** a selected run requests equity, signals, orders, trades, or as-of
  positions
- **THEN** the frontend MUST call the corresponding route below
  `/v1/strategy-backtests/:runId`
- **AND** paginated fact requests MUST preserve the backend cursor contract

#### Scenario: QMT source is submitted

- **WHEN** an operator selects the BigQMT source
- **THEN** the frontend MUST serialize the canonical backend value `qmt`
- **AND** it MUST NOT serialize the stale value `mqmt`

### Requirement: Operators Shall Manage Strategy Definitions

The strategy workspace SHALL allow operators to inspect and change strategy
definition lifecycle state, paired V1 rules, and portfolio backtest
eligibility.

#### Scenario: Strategy registry is loaded

- **WHEN** strategy definitions are returned by the backend
- **THEN** the workspace MUST show definition name, live status,
  `backtestEnabled`, current version, target universe, period, source, and
  update timestamps where available

#### Scenario: Strategy definition is saved

- **WHEN** an operator submits valid strategy metadata, entry rule, optional
  exit rule, and lookback bars
- **THEN** the frontend MUST call the strategy create or update API
- **AND** it MUST refresh the registry or selected detail after the save

#### Scenario: Strategy lifecycle action is requested

- **WHEN** an operator enables or disables a strategy for live scans
- **THEN** the frontend MUST call the corresponding lifecycle API
- **AND** it MUST show the updated live status without changing the backtest
  switch

#### Scenario: Backtesting is enabled

- **WHEN** an operator enables `backtestEnabled`
- **THEN** the frontend MUST require entry and exit rule JSON, valid lookback
  bars, daily period, and a configured source
- **AND** it MUST show the backend validation reason when eligibility fails
- **AND** it MUST not change the live lifecycle status

### Requirement: Strategy Rule Editing Shall Be Explicit

The strategy workspace SHALL edit V1 entry and exit rules as separate explicit
JSON expressions, edit `lookbackBars`, and surface local and backend validation
failures.

#### Scenario: Entry rule JSON is invalid

- **WHEN** an operator submits malformed entry rule JSON
- **THEN** the frontend MUST block the API call
- **AND** it MUST show an entry rule JSON parse error near that editor

#### Scenario: Exit rule JSON is invalid

- **WHEN** an operator submits malformed exit rule JSON
- **THEN** the frontend MUST block the API call
- **AND** it MUST show an exit rule JSON parse error near that editor

#### Scenario: Exit rule is omitted while backtesting is disabled

- **WHEN** the strategy has a valid entry rule and
  `backtestEnabled=false`
- **THEN** the editor MUST allow the exit rule to remain empty
- **AND** it MUST explain that portfolio run creation remains unavailable

#### Scenario: Backend rejects a paired rule

- **WHEN** the backend rejects an unsupported field, operator, lookback, or
  eligibility update
- **THEN** the frontend MUST show the API error near the corresponding strategy
  field

## ADDED Requirements

### Requirement: Operators Shall Configure Portfolio Backtests

The Backtests workflow SHALL allow operators to create a bounded run from an
eligible strategy through a configuration drawer.

#### Scenario: New backtest drawer is opened

- **WHEN** an operator selects “New backtest”
- **THEN** the workspace MUST preserve the currently selected result
- **AND** it MUST show strategy/version, universe, daily source, dates, initial
  cash, maximum positions, benchmark, slippage, commission, minimum
  commission, stamp duty, and transfer fee controls
- **AND** it MUST prefill the approved backend defaults

#### Scenario: Ineligible strategy is selected

- **WHEN** a selected definition has `backtestEnabled=false` or an incomplete
  selected version
- **THEN** the create action MUST be disabled
- **AND** the drawer MUST show the specific eligibility reason

#### Scenario: Valid configuration is submitted

- **WHEN** an operator submits a valid portfolio configuration
- **THEN** the frontend MUST call `POST /v1/strategy-backtests`
- **AND** it MUST add the returned pending run to history
- **AND** it MUST select that run without waiting for completion

### Requirement: Portfolio Backtest Workspace Shall Use Split History And Detail

The Backtests workflow SHALL render run history on the left and the selected
run detail on the right.

#### Scenario: Backtest workspace is opened

- **WHEN** run history is available
- **THEN** the left pane MUST show strategy, version, date range, status,
  progress or headline return, and creation time
- **AND** selecting a row MUST update the right detail without replacing the
  history pane

#### Scenario: Run history is filtered or paged

- **WHEN** an operator changes strategy/status filters or reaches the current
  cursor boundary
- **THEN** the frontend MUST request the corresponding backend filter/cursor
- **AND** it MUST preserve a valid selected run where possible

#### Scenario: No run is selected

- **WHEN** history is empty or no row is selected
- **THEN** the detail pane MUST show an operational empty state and the new-run
  action
- **AND** it MUST not present a marketing-only placeholder

### Requirement: Operators Shall Observe And Cancel Asynchronous Runs

The portfolio UI SHALL keep non-terminal lifecycle state current without
leaking polling work.

#### Scenario: Pending or running run is selected

- **WHEN** the selected run is non-terminal
- **THEN** the workspace MUST show status, stage, progress, processed and total
  work, attempt count, and available timestamps
- **AND** it MUST poll run detail at a bounded interval

#### Scenario: Selected run becomes terminal

- **WHEN** the selected run becomes completed, failed, or cancelled
- **THEN** polling MUST stop
- **AND** the workspace MUST refresh the relevant result families once

#### Scenario: Component unmounts or selection changes

- **WHEN** polling is no longer relevant
- **THEN** the frontend MUST cancel the timer and ignore stale responses

#### Scenario: Operator cancels a run

- **WHEN** an operator confirms cancellation of a pending or running run
- **THEN** the frontend MUST call the run cancel endpoint
- **AND** it MUST show the returned cancellation state without removing prior
  immutable facts from the UI

### Requirement: Operators Shall Inspect Portfolio Results

Completed and terminal backtest details SHALL expose performance, assumptions,
and execution facts needed to audit the result.

#### Scenario: Completed run is selected

- **WHEN** a completed run detail is returned
- **THEN** the workspace MUST show cards for total and annualized return,
  annualized volatility, maximum drawdown and duration, Sharpe, Calmar,
  benchmark and excess return, win rate, profit factor, trade count, average
  holding days, turnover, and exposure
- **AND** unavailable ratios MUST render as unavailable rather than `Infinity`
  or `NaN`

#### Scenario: Equity data is loaded

- **WHEN** the equity series is returned
- **THEN** the workspace MUST render portfolio equity and benchmark together
- **AND** it MUST render drawdown with the existing ECharts lifecycle pattern

#### Scenario: Fact tab is selected

- **WHEN** an operator selects trades, orders, signals, end/as-of positions,
  configuration, or errors
- **THEN** the workspace MUST load and render the matching run facts or
  snapshot
- **AND** it MUST distinguish empty data from a failed request

#### Scenario: Adjusted-price assumptions are inspected

- **WHEN** the configuration snapshot is shown
- **THEN** the workspace MUST disclose the forward-adjusted price assumption
- **AND** it MUST disclose excluded corporate-action, exchange-limit, ST,
  liquidity, and partial-fill behavior

#### Scenario: Failed run is selected

- **WHEN** a run has failed
- **THEN** the workspace MUST show its stage, structured error code/details,
  attempt count, and timestamps
- **AND** it MUST preserve access to the immutable strategy/config snapshots

## REMOVED Requirements

### Requirement: Operators Shall Run Signal-Level Backtests

**Reason**: The signal-only form no longer represents the approved product; it
has been replaced by asynchronous portfolio execution and audit workflows.

**Migration**: Retain the Backtests tab and `/v1/strategy-backtests` client
family, replace its create payload and result rendering with the portfolio
configuration, history/detail, lifecycle, chart, metric, and fact contracts in
this change.

### Requirement: Strategy UX Shall Exclude Portfolio Simulation

**Reason**: The exclusion was intentional for the first signal-level phase and
is superseded by the later portfolio-backtesting child change.

**Migration**: Render only real backend portfolio fields delivered by this
change; remove the old signal-count-only presentation instead of showing empty
or mocked portfolio panels.
