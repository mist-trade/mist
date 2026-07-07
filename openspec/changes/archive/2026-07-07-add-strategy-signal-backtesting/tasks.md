# Tasks: Add strategy signal backtesting

## 1. Contract Tests

- [x] 1.1 Add backtest service tests for historical K-line replay and persisted
      `BacktestSignalResult` rows.
- [x] 1.2 Add tests proving completed runs report signal count, matched
      security count, and timestamps.
- [x] 1.3 Add tests proving backtest responses do not require portfolio fields.
- [x] 1.4 Add tests proving failed replay marks the run failed with an error
      message.

## 2. Backend Implementation

- [x] 2.1 Extend `StrategyBacktestService` dependencies to include K-line
      repository, context builder, and rule evaluator.
- [x] 2.2 Implement historical K-line loading by strategy version, target
      universe, period, source, and date range.
- [x] 2.3 Persist `BacktestSignalResult` rows for each matching historical
      context.
- [x] 2.4 Update `BacktestRun` status, signal count, matched security count,
      started timestamp, completed timestamp, and error message.
- [x] 2.5 Keep existing `/v1/strategy-backtests` controller paths and DTO
      shapes unchanged.

## 3. Documentation And Roadmap

- [x] 3.1 Update README strategy API text to note that backtests now execute
      signal-level replay.
- [x] 3.2 Update strategy roadmap disposition to mark
      `add-strategy-signal-backtesting` as created/in progress.

## 4. Verification

- [x] 4.1 Run focused strategy backtest tests.
- [x] 4.2 Run full focused strategy test group.
- [x] 4.3 Run TypeScript typecheck.
- [x] 4.4 Run focused ESLint on strategy/shared-data files.
- [x] 4.5 Run `openspec validate add-strategy-signal-backtesting --strict`.
- [x] 4.6 Run `openspec validate define-strategy-platform-roadmap --strict`.
- [x] 4.7 Confirm no template markers or trailing whitespace remain in changed
      OpenSpec documents.
