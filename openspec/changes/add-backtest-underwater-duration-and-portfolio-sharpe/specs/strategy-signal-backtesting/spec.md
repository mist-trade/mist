## ADDED Requirements

### Requirement: Backtests Shall Report Underwater Duration And Portfolio Sharpe

Backtest runs SHALL record the longest consecutive underwater duration of the
combined NAV series and SHALL compute `sharpe_ratio` with one unified
portfolio (covariance-based) estimator for both single-security and
multi-security runs.

#### Scenario: Backtest run completes with drawdown duration

- **WHEN** a backtest run completes historical replay
- **THEN** it MUST record the longest consecutive underwater trading-day run
  of the combined NAV series as `max_underwater_duration`
- **AND** the backtest run query API MUST expose `maxUnderwaterDuration`
- **AND** the recorded value MUST share the same combined NAV basis as
  `max_drawdown`

#### Scenario: Sharpe uses the unified portfolio estimator

- **WHEN** a completed run publishes `sharpe_ratio`
- **THEN** the value MUST be the annualized Sharpe of the equal-weight
  portfolio daily return series composed from each security's equity-derived
  daily returns on the union of trading dates
- **AND** per-security returns MUST be derived from fill-forward equity with
  missing days and the first observation treated as cash (zero return)
- **AND** portfolio volatility MUST follow the covariance composition of the
  per-security returns (equal-weight portfolio sample standard deviation)
- **AND** annualization and risk-free-rate conventions MUST stay unchanged
  (250 trading days per year, 0.02 annual risk-free rate)

#### Scenario: A single-security run keeps the existing Sharpe value

- **WHEN** a completed run replayed exactly one security
- **THEN** the unified estimator MUST degenerate to the existing
  single-series semantics with a bitwise-identical value
- **AND** the run MUST still record `max_underwater_duration`
