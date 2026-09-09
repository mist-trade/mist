# backtest-trade-decision Specification

## Purpose
Define the unified quantitative backtest decision state machine, Exit Trinity lifecycle management,
lookahead-free A-share execution simulation, and three-dimensional parity verification for Mist.

## ADDED Requirements

### Requirement: Position State Machine Shall Manage Lifecycle Across Backtest and Realtime
The system SHALL maintain a deterministic `PositionStateMachine` that transitions through `Empty`,
`PendingEntry`, `Holding`, `PendingPartialExit`, `PendingExit`, and `Closed`. Both offline backtesting
and live strategy evaluation MUST share the identical state machine logic. The state machine SHALL
consume entry decisions directly from `DecisionFlowEngine` without redundant internal entry filters.

#### Scenario: Initial state
- **WHEN** strategy state machine initializes or has no active positions
- **THEN** state MUST be `Empty`, quantity MUST be 0, and stop-loss anchor MUST be undefined

#### Scenario: Entry triggered by DecisionFlowEngine
- **WHEN** state is `Empty` and `DecisionFlowEngine` emits a `DecisionResult` with `action === 'BUY'`
- **THEN** state MUST transition to `PendingEntry`
- **AND** the trigger signal time and recommended structural stop-loss price (from `evidence`) MUST be recorded

#### Scenario: Execution on next-bar open
- **WHEN** state is `PendingEntry` and the subsequent Bar $t+1$ arrives
- **THEN** unless the bar opens at hard limit-up, an entry order MUST be filled at the `open` price of Bar $t+1$ adjusted for slippage and commission
- **AND** state MUST transition to `Holding`, setting `costPrice` and initializing `highWatermark`

### Requirement: Multi-Layer Exit and Stop-Loss Policy Shall Evaluate Exit Trinity
While in `Holding` state, the system SHALL evaluate the configured `StrategyExitPolicy` per bar, enforcing
the Exit Trinity: initial structural stop, 1R breakeven migration, and dual-track take-profit (partial profit taking and trailing stop).

#### Scenario: Initial structural stop loss from evidence
- **WHEN** strategy configures `structuralStop` and current low breaches the structural stop level retrieved from decision evidence
- **THEN** state MUST transition to `PendingExit` with `exitReason` set to `STRUCTURAL_STOP`

#### Scenario: 1R breakeven stop loss migration
- **WHEN** strategy configures `breakEven` with mode `1R` and high watermark exceeds `costPrice + (costPrice - initialStopLoss)`
- **THEN** current stop-loss price MUST be unconditionally updated to `costPrice * (1 + feeRatio)`
- **AND** subsequent pullbacks MUST NOT trigger capital losses

#### Scenario: Dual-track take-profit and partial exit
- **WHEN** strategy configures `partialProfit` and price reaches the target profit ratio
- **THEN** state MUST execute a partial exit for the specified ratio (default 50%)
- **AND** the remaining position MUST continue in `Holding` state tracked by `trailingStop`

#### Scenario: Hard stop loss fallback
- **WHEN** price breaches the hard stop loss threshold below `costPrice`
- **THEN** state MUST transition to `PendingExit` immediately with `exitReason` set to `HARD_STOP_LOSS`

#### Scenario: Decision flow reverse SELL exit
- **WHEN** `DecisionFlowEngine` emits a `DecisionResult` with `action === 'SELL'`
- **THEN** state MUST transition to `PendingExit` with `exitReason` set to `OPPOSITE_SIGNAL`

### Requirement: Simulated Broker Shall Enforce A-Share Trading Rules and Frictions
The backtest execution engine SHALL simulate realistic A-share trading rules, constraints, and cost structures.

#### Scenario: T+1 lockup rule
- **WHEN** a position is entered on day $t$
- **THEN** any exit orders triggered on the same day $t$ MUST NOT execute intra-day and MUST be deferred to day $t+1$

#### Scenario: Limit-up buy rejection
- **WHEN** a `PendingEntry` order faces an opening price equal to `highLimit` and remains locked
- **THEN** order MUST be cancelled with reason `BUY_REJECTED_LIMIT_UP` and state MUST revert to `Empty`

#### Scenario: Limit-down sell deferral
- **WHEN** a `PendingExit` order faces an opening price equal to `lowLimit` and remains locked
- **THEN** order MUST be marked as `SELL_BLOCKED_LIMIT_DOWN` and deferred to the next negotiable trading session

#### Scenario: Trading cost and differential stamp duty deduction
- **WHEN** orders are executed
- **THEN** brokerage commission and transfer fees MUST be deducted
- **AND** for stock instruments, 0.05% stamp duty MUST be deducted on sell; for ETF instruments, stamp duty MUST be zero

### Requirement: Causality Assertions and Parity Verification Shall Guarantee Lookahead-Free Execution
The system SHALL embed causality assertions and dual-track parity suites to guarantee lookahead-free integrity.

#### Scenario: Causality invariant assertions
- **WHEN** evaluating any decision or indicator at bar $t$
- **THEN** all input timestamps MUST be $\le t$, and all simulated execution fill timestamps MUST be $> t$

#### Scenario: Dual-track live vs backtest parity replay
- **WHEN** replaying the same historical slice through live `Signal App` and offline `Backtest App`
- **THEN** emitted signals, decision traces, and trade execution events MUST match 100% byte-for-byte

#### Scenario: Future data perturbation invariance
- **WHEN** future bars beyond $t$ are truncated or injected with random noise
- **THEN** decisions and states up to and including $t$ MUST remain strictly invariant

### Requirement: Backtest Trade Execution Results Shall Be Persisted with Attribution
The backtest engine SHALL persist detailed trade records into the `backtest_trade_results` table, recording entry/exit timestamps, prices, holding duration, PnL, R-multiples, fees, and exit attribution reasons.

#### Scenario: Persisting backtest trades
- **WHEN** a trade or partial close completes
- **THEN** a record MUST be written to `backtest_trade_results` capturing `exit_reason`, `is_partial`, `pnl_amount`, `pnl_ratio`, and `context_snapshot`
- **AND** summary metrics (total return, max drawdown, Sharpe ratio, win rate, profit-loss ratio) MUST be aggregated into `backtest_runs`
