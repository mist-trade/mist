## ADDED Requirements

### Requirement: Backtests Shall Replay Strategy Versions

Mist SHALL replay a requested immutable strategy version over historical K-line
data.

#### Scenario: Backtest run is requested

- **WHEN** a client creates a backtest run with strategy version, target
  universe, period, source, start date, and end date
- **THEN** the backend MUST evaluate the requested strategy version against
  historical K-line records in the requested range
- **AND** it MUST use the same rule evaluator semantics as live scans

### Requirement: Backtest Matches Shall Be Persisted As Signal Results

Backtests SHALL persist signal-level result rows for each historical match.

#### Scenario: Historical K-line matches

- **WHEN** a historical K-line context matches the strategy rule
- **THEN** the backend MUST persist a `BacktestSignalResult`
- **AND** the result MUST include strategy definition, strategy version,
  security code, period, source, signal time, context snapshot, and rule
  snapshot

### Requirement: Backtest Runs Shall Report Aggregate Signal Statistics

Backtest runs SHALL expose aggregate signal-level statistics after replay.

#### Scenario: Backtest completes

- **WHEN** historical replay completes successfully
- **THEN** the backend MUST mark the run completed
- **AND** it MUST set signal count and matched security count
- **AND** it MUST set started and completed timestamps

### Requirement: Backtests Shall Exclude Portfolio Simulation

Signal-level backtests SHALL NOT include portfolio-level execution semantics.

#### Scenario: Backtest response is inspected

- **WHEN** a backtest run is returned
- **THEN** it MUST NOT require or populate cash, positions, orders, fills, fees,
  slippage, allocation, equity curve, or portfolio return fields

### Requirement: Backtest Failure Shall Be Recorded

Backtest execution errors SHALL be recorded on the run.

#### Scenario: Replay fails

- **WHEN** the backend cannot complete a requested replay
- **THEN** it MUST mark the run failed
- **AND** it MUST store an error message on the run
