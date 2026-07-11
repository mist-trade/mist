## REMOVED Requirements

### Requirement: Backtests Shall Replay Strategy Versions

**Reason**: Synchronous single-rule replay is no longer a standalone backtest
capability. Historical entry/exit evaluation is now the signal-provenance stage
inside `strategy-portfolio-backtesting`.

**Migration**: Keep `StrategyBacktestService` and
`/v1/strategy-backtests`, resolve and snapshot the paired selected version, and
enqueue the asynchronous portfolio processor defined by the replacement
capability.

### Requirement: Backtest Matches Shall Be Persisted As Signal Results

**Reason**: A signal-only result row cannot explain whether a match became an
order, fill, position, trade, or rejected execution.

**Migration**: Preserve historical entry/exit matches as typed
`backtest_signals` linked to portfolio orders, trades, context snapshots, and
rule snapshots under `strategy-portfolio-backtesting`.

### Requirement: Backtest Runs Shall Report Aggregate Signal Statistics

**Reason**: Signal count and matched-security count alone are insufficient for
the approved portfolio product outcome.

**Migration**: Retain signal aggregates as supporting counts while making
equity, risk, benchmark, trade, turnover, and exposure metrics the completed
run result defined by `strategy-portfolio-backtesting`.

### Requirement: Backtests Shall Exclude Portfolio Simulation

**Reason**: This exclusion described the deliberately limited first backtest
phase and is directly superseded by the later portfolio-backtesting child
change anticipated by the strategy roadmap.

**Migration**: Replace the unused synchronous V1 payload in place with the
capital, allocation, execution-cost, order, trade, equity, and metric semantics
in `strategy-portfolio-backtesting`; do not introduce a second API path or
parallel service family.

### Requirement: Backtest Failure Shall Be Recorded

**Reason**: The synchronous replay failure rule does not cover asynchronous
ownership, structured stages, cancellation, lease recovery, or partial-output
cleanup.

**Migration**: Use the replacement capability run lifecycle, which records
structured failures, terminal timestamps, cooperative cancellation, and clean
deterministic restart after an expired lease.
