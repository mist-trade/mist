## ADDED Requirements

### Requirement: Portfolio Backtest Requests Shall Be Eligible And Bounded

Mist SHALL create a portfolio backtest only from a strategy definition whose
`backtestEnabled` value is true and from a complete selected strategy version.

#### Scenario: Current strategy version is requested

- **WHEN** a client submits a valid request with a strategy definition id and
  no strategy version id
- **THEN** the backend MUST resolve the definition current version at request
  time
- **AND** the resolved version MUST contain valid entry and exit rules
- **AND** the backend MUST copy the resolved strategy and normalized request
  configuration into immutable run snapshots

#### Scenario: Explicit strategy version is requested

- **WHEN** a client submits a strategy version id
- **THEN** that version MUST belong to the requested strategy definition
- **AND** it MUST independently satisfy the portfolio rule requirements

#### Scenario: Ineligible strategy is requested

- **WHEN** `backtestEnabled` is false or the selected version has no valid exit
  rule
- **THEN** the backend MUST reject the request before persisting a run

#### Scenario: Run envelope is invalid

- **WHEN** a request has fewer than 1 or more than 50 stock codes, a period
  other than daily, a source not configured on the strategy, an end date before
  its start date, or a range longer than 10 years
- **THEN** the backend MUST reject the request with field-specific validation
  details

#### Scenario: Execution configuration is invalid

- **WHEN** initial cash is not positive, maximum positions is outside 1 through
  50, slippage is outside 0 through 10,000 basis points, a fee minimum is
  negative, a rate is outside 0 through 1, or benchmark code is not a canonical
  configured index
- **THEN** the backend MUST reject the request before persisting a run
- **AND** the response MUST identify every invalid configuration field

### Requirement: Portfolio Backtests Shall Run Asynchronously

The existing `/v1/strategy-backtests` resource SHALL enqueue portfolio runs
without performing simulation on the HTTP request thread.

#### Scenario: Valid run is created

- **WHEN** a client posts a valid run request to `/v1/strategy-backtests`
- **THEN** the backend MUST return HTTP 202 with a persisted `pending` run
- **AND** background processing MUST transition it to `running`
- **AND** the response MUST not wait for historical replay to complete

#### Scenario: Run progress is inspected

- **WHEN** a client reads a pending or running run
- **THEN** the detail MUST include status, processing stage, completed work,
  total work, progress percentage, attempt count, and timestamps where
  available

#### Scenario: Run completes

- **WHEN** all requested dates are simulated and result facts are persisted
- **THEN** the processor MUST mark the run `completed`
- **AND** it MUST persist completion time and final metrics before releasing
  ownership

### Requirement: Portfolio Processing Shall Be Restart Safe

Background processing SHALL use exclusive renewable ownership and MUST recover
an abandoned run without retaining ambiguous partial output.

#### Scenario: Another processor observes an active lease

- **WHEN** a run is owned by a processor whose lease has not expired
- **THEN** another processor MUST NOT execute or persist facts for that run

#### Scenario: Processing lease expires

- **WHEN** a running processor stops heartbeating and its lease expires
- **THEN** the next owner MUST remove all partial engine-derived facts for the
  run
- **AND** it MUST restart from the immutable snapshots
- **AND** it MUST increment the attempt count

#### Scenario: Retry completes

- **WHEN** an expired run is restarted with unchanged snapshots and market
  data
- **THEN** its portfolio facts and metrics MUST match a clean first attempt
  after database ids and operational timestamps are ignored

### Requirement: Portfolio Backtests Shall Support Cancellation

Operators SHALL be able to cancel non-terminal runs cooperatively.

#### Scenario: Pending run is cancelled

- **WHEN** a client posts to `/v1/strategy-backtests/:runId/cancel` for a
  pending run
- **THEN** the backend MUST transition the run to `cancelled` without starting
  simulation

#### Scenario: Running run is cancelled

- **WHEN** cancellation is requested for a running run
- **THEN** the processor MUST observe the request no later than the next
  bounded processing batch
- **AND** it MUST stop producing facts and mark the run `cancelled`

#### Scenario: Terminal run cancellation is requested

- **WHEN** cancellation is requested for a completed, failed, or cancelled run
- **THEN** the backend MUST leave the terminal result immutable
- **AND** it MUST return the current terminal state or a conflict response

### Requirement: Signals Shall Execute At The Next Available Open

Portfolio simulation SHALL evaluate completed daily bars and MUST prevent
same-bar or future-data execution.

#### Scenario: Entry rule matches at a daily close

- **WHEN** an entry rule matches a completed bar at time T
- **THEN** the engine MUST persist the entry signal at T
- **AND** the earliest permitted fill MUST be the security next available daily
  open after T

#### Scenario: Exit rule matches at a daily close

- **WHEN** an exit rule matches a completed bar at time T for an open position
- **THEN** the engine MUST persist the exit signal at T
- **AND** it MUST schedule the whole-position exit for the security next
  available daily open after T

#### Scenario: Security has a missing next calendar bar

- **WHEN** a signaled security has no bar on the next portfolio trading date
- **THEN** its order MUST wait for that security next available open
- **AND** the engine MUST NOT borrow another security price or invent a fill

#### Scenario: No later bar exists in range

- **WHEN** a scheduled order has no later bar on or before the requested end
  date
- **THEN** the order MUST expire with an auditable reason and no cash or
  position mutation

### Requirement: Daily Events Shall Have Deterministic Ordering

The engine SHALL process every date and security in a stable order independent
of database row ordering.

#### Scenario: A date has exits and entries

- **WHEN** multiple orders are executable on the same date
- **THEN** all exits MUST execute before any entry
- **AND** orders within the same side MUST execute by canonical security code

#### Scenario: Signals are evaluated after open execution

- **WHEN** a daily event is processed
- **THEN** the engine MUST execute pending open orders before close marking
- **AND** it MUST mark daily equity before evaluating that completed close
- **AND** it MUST evaluate exit rules before entry rules

#### Scenario: Both rules match one security

- **WHEN** both entry and exit signals from the same completed bar become
  executable at the same later open
- **THEN** the exit MUST execute first
- **AND** the engine MUST evaluate the new entry afterward using all normal
  entry constraints
- **AND** it MUST execute that entry only when every constraint passes

### Requirement: Portfolio State Shall Follow A-Share Long-Only Constraints

V1 portfolio simulation SHALL model long-only A-share stock positions using
equal-weight slots and whole-share-lot accounting.

#### Scenario: Entry quantity is calculated

- **WHEN** an eligible entry order reaches its execution open
- **THEN** target notional MUST equal current portfolio equity divided by
  `maxPositions`
- **AND** quantity MUST be floored to a multiple of 100 shares
- **AND** quantity MUST be reduced by whole lots until fill value and fees fit
  available cash

#### Scenario: Entry cannot buy one lot

- **WHEN** available cash cannot cover 100 shares plus fees
- **THEN** the engine MUST record a rejected order with an insufficient-cash
  reason
- **AND** it MUST NOT create a position

#### Scenario: Security is already held

- **WHEN** another entry signal becomes executable for a currently open
  security
- **THEN** the engine MUST not increase that position
- **AND** it MUST preserve the signal and the non-execution reason for audit

#### Scenario: Exit becomes executable

- **WHEN** an eligible exit order executes for an open position
- **THEN** it MUST close the entire share quantity
- **AND** the engine MUST NOT create a short position

#### Scenario: T plus one blocks a sale

- **WHEN** an exit would sell shares on the same trade date on which they were
  purchased
- **THEN** the engine MUST keep the order pending until the security next
  available open on a later trade date
- **AND** it MUST NOT reduce the position on the purchase date

#### Scenario: Run ends with open positions

- **WHEN** the requested end date is reached before an exit executes
- **THEN** the engine MUST keep the trade open
- **AND** it MUST mark the position to its latest available close rather than
  force liquidation

### Requirement: Execution Costs Shall Be Configurable And Snapshotted

Every run SHALL apply directional slippage and explicit commission, stamp duty,
and transfer fee settings from its immutable configuration snapshot.

#### Scenario: Defaults are omitted

- **WHEN** a valid request omits execution cost overrides
- **THEN** the backend MUST use CNY 1,000,000 initial cash, 10 maximum
  positions, 5 slippage basis points, 0.0003 commission rate, CNY 5 minimum
  commission, 0.0005 sell-side stamp duty rate, and 0.00001 two-sided transfer
  fee rate
- **AND** it MUST use benchmark code `000300`

#### Scenario: Buy order fills

- **WHEN** a buy order executes
- **THEN** fill price MUST apply positive slippage to the open price
- **AND** commission and transfer fee MUST reduce cash
- **AND** stamp duty MUST NOT be charged

#### Scenario: Sell order fills

- **WHEN** a sell order executes
- **THEN** fill price MUST apply negative slippage to the open price
- **AND** commission, transfer fee, and stamp duty MUST reduce proceeds

#### Scenario: Money is rounded

- **WHEN** a fill or fee produces fractions below CNY 0.01
- **THEN** fill price and each fee MUST be rounded half-up to CNY 0.01
- **AND** cash accounting MUST use fixed-point fen values without accumulating
  binary floating-point residue

### Requirement: Market Data Assumptions Shall Be Explicit

Portfolio runs SHALL consume persisted Mist daily K data only and SHALL expose
the limitations of its adjusted-price model.

#### Scenario: Lookback history is loaded

- **WHEN** the selected strategy declares `lookbackBars`
- **THEN** the processor MUST load enough prior completed bars to build the
  first in-range context
- **AND** it MUST NOT trade or include performance before the requested start
  date

#### Scenario: Required coverage is absent

- **WHEN** any requested stock or benchmark has no usable daily data for the
  selected source and range
- **THEN** the run MUST fail with a structured coverage error naming each
  missing code

#### Scenario: Data assumptions are inspected

- **WHEN** a client reads the run configuration snapshot
- **THEN** it MUST state that stored forward-adjusted prices are used
- **AND** it MUST state that explicit dividends, splits, allotments, full
  exchange price-limit rules, ST rules, liquidity, and partial fills are not
  modeled

### Requirement: Portfolio Facts Shall Be Auditable And Queryable

Each run SHALL persist immutable signal, order, trade, and daily equity facts
that explain the final portfolio result.

#### Scenario: Signal creates an execution attempt

- **WHEN** a signal is evaluated for execution
- **THEN** its fact MUST include run, strategy/version snapshot identity,
  security, signal kind, signal time, rule snapshot, and context snapshot
- **AND** any resulting order MUST link to that signal and include side,
  status, execution or expiry time, quantity, price, costs, and reason

#### Scenario: Position lifecycle changes

- **WHEN** a position opens or closes
- **THEN** one `BacktestTrade` lifecycle MUST capture its entry and optional
  exit order, dates, prices, quantity, fees, realized profit or loss, and
  holding days

#### Scenario: Daily portfolio is marked

- **WHEN** a simulated trading date completes
- **THEN** one equity point MUST contain cash, market value, total equity,
  normalized benchmark value, drawdown, and exposure

#### Scenario: Facts are queried

- **WHEN** a client requests run signals, orders, trades, or as-of positions
- **THEN** the backend MUST return stable cursor-paginated results
- **AND** positions MUST be reconstructed from trade lifecycles rather than a
  per-day-per-security position table

#### Scenario: End positions are queried without an as-of date

- **WHEN** a client requests run positions without `asOf`
- **THEN** the backend MUST reconstruct positions at the latest simulated
  equity date
- **AND** an explicit `asOf` MUST be constrained to the run requested date
  range

#### Scenario: Equity is queried

- **WHEN** a client requests `/v1/strategy-backtests/:runId/equity`
- **THEN** the backend MUST return the complete bounded daily equity,
  benchmark, and drawdown series in ascending date order

### Requirement: Run Discovery Shall Use Stable V1 APIs

Portfolio backtest history and details SHALL remain on version-first Mist API
paths and SHALL support stable operator navigation.

#### Scenario: Run history is listed

- **WHEN** a client gets `/v1/strategy-backtests`
- **THEN** the backend MUST support strategy and status filters
- **AND** it MUST return newest-first cursor pagination with a stable id
  tiebreaker

#### Scenario: Run detail is requested

- **WHEN** a client gets `/v1/strategy-backtests/:runId`
- **THEN** the response MUST include snapshots, lifecycle/progress, aggregate
  counts, metrics, error details, and timestamps available for that run

#### Scenario: Terminal run is re-run

- **WHEN** an operator submits the same configuration again
- **THEN** the backend MUST create a new run and immutable snapshot
- **AND** it MUST NOT overwrite the prior terminal result

### Requirement: Completed Runs Shall Report Portfolio Metrics

Completed runs SHALL persist performance, risk, benchmark, trade, turnover, and
exposure metrics computed from their own fact series.

#### Scenario: Portfolio metrics are finalized

- **WHEN** a run completes successfully
- **THEN** metrics MUST include total return, 252-day annualized return,
  annualized volatility, zero-risk-free-rate Sharpe ratio, maximum drawdown,
  drawdown duration, Calmar ratio, benchmark return, excess return, win rate,
  profit factor, trade count, average holding days, turnover, and average
  exposure

#### Scenario: Ratio denominator is zero

- **WHEN** a metric denominator is zero or no qualifying closed trade exists
- **THEN** the metric MUST be `null`
- **AND** the API MUST NOT serialize `Infinity` or `NaN`

#### Scenario: Benchmark series is normalized

- **WHEN** benchmark and portfolio first have comparable in-range data
- **THEN** benchmark value MUST start at initial portfolio cash
- **AND** benchmark return MUST be calculated over the same comparable dates

### Requirement: Portfolio Results Shall Be Reproducible

The engine SHALL produce deterministic economic output from the same strategy
snapshot, configuration snapshot, and ordered market data.

#### Scenario: Identical runs are compared

- **WHEN** two runs use identical snapshots and market data
- **THEN** their ordered signal, order, trade, equity, and metric values MUST be
  identical after run ids and operational timestamps are excluded

#### Scenario: Database rows arrive in another order

- **WHEN** equivalent market rows are returned in a different repository order
- **THEN** the engine MUST normalize them by date and canonical security code
- **AND** portfolio output MUST remain unchanged
