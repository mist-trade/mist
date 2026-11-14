## ADDED Requirements

### Requirement: Backtest Execution Shall Follow The Multi-Period Evaluation Stream

Backtests SHALL drive order execution, risk arbitration, and T+1 settlement on
the same merged multi-period evaluation stream that drives strategy evaluation
(the evaluation-period bars), with mark-to-market NAV and all performance
metrics sampled once per trading day.

#### Scenario: An order fills on the next evaluation-period bar

- **WHEN** a signal is confirmed on an evaluation-period bar and an order is
  submitted
- **THEN** the simulated broker MUST fill the order on the next evaluation-period
  bar's open with slippage (market and limit orders), respecting limit price caps
- **AND** the fill timestamp MUST be the executing bar's timestamp

#### Scenario: Stop orders trigger intrabar on the evaluation stream

- **WHEN** a pending stop order exists and an evaluation-period bar's low
  touches the stop price
- **THEN** the broker MUST fill at the stop price with slippage
- **AND** a gap below the stop price MUST fill at that bar's open

#### Scenario: Price-limit checks use the previous trading day's close

- **WHEN** the broker evaluates limit-up or limit-down constraints on any bar
  of the evaluation stream
- **THEN** the reference price MUST be the previous trading day's final close
- **AND** on the first replay day the reference MUST come from the injected
  pre-close metadata when available
- **AND** a locked limit board MUST defer or reject the order per the
  established rules

#### Scenario: T+1 lock spans the trading-day boundary

- **WHEN** shares are bought on a trading day D (on any evaluation-period bar
  of D)
- **THEN** sell orders against those shares MUST be rejected on D's remaining
  bars
- **AND** they MUST become sellable from D+1's first evaluation-period bar
  after the daily settlement of D

#### Scenario: No forced cooldown after a risk exit

- **WHEN** a position exits through the hard stop-loss risk arbiter
- **THEN** the arbiter MUST NOT block a subsequent entry signal on the next
  evaluation-period bars
- **AND** the execution engine MUST NOT impose any cooldown mechanism on
  re-entry timing

#### Scenario: Performance metrics keep the daily basis

- **WHEN** a run evaluates and executes on the multi-period stream
- **THEN** the NAV series MUST still be settled exactly once per trading day
- **AND** `sharpe_ratio`, `max_drawdown`, `max_underwater_duration`, and all
  other performance metrics MUST keep their existing daily-basis semantics

#### Scenario: Missing evaluation-period bars mean no trading opportunity

- **WHEN** a trading day has no evaluation-period bars for a security
- **THEN** the replay MUST NOT fabricate bars or fall back to another period
  for execution
- **AND** the day MUST simply offer no fill opportunity
- **AND** historical data gaps SHALL be remediated at the data-source layer
