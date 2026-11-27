## ADDED Requirements

### Requirement: Backtest Performance Summary Shall Precedes In-Memory Trade Flushing
`BacktestRunExecutor` SHALL compute `computePerformanceSummary(combinedNavSeries, trades)` against the complete executed `trades` slice before `flushTrades(trades)` drains or clears in-memory trade arrays, ensuring persisted `tradeCount`, `winRate`, and `profitLossRatio` reflect full trade history.

#### Scenario: Completed run persists non-zero trade metrics after flushTrades
- **WHEN** a backtest run completes with at least one closed trade and persists trades via `flushTrades`
- **THEN** the persisted `BacktestRun` summary MUST contain accurate `tradeCount > 0`, `winRate`, and `profitLossRatio` computed before the trade array is cleared

### Requirement: Suite Orchestrators Shall Respect Target Universe And Normalize Multi-Security Capital
`BacktestSuiteExecutor` SHALL honor a non-empty user-specified `masterRun.targetUniverse` when creating stress scenario runs (using scenario recommended defaults only when `masterRun.targetUniverse` is empty) and SHALL scale/normalize initial capital denominator consistently with per-security child allocation across both stress and walk-forward suites.

#### Scenario: Multi-security stress suite computes uninflated portfolio return
- **WHEN** a stress scenario executes across `N > 1` target securities where each security initializes independent broker capital
- **THEN** composite stress metrics MUST evaluate against `N * DEFAULT_BROKER_INITIAL_CASH` (or normalized equivalent capital) so initial capital matches the combined equity baseline
- **AND** explicit user `targetUniverse` entries MUST NOT be silently overridden by scenario recommendations
