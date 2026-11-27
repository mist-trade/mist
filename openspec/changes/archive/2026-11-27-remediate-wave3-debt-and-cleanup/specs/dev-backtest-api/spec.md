## ADDED Requirements

### Requirement: Dev Gateway Bounded Backtest Caches And Replaced Session Cleanup
`tools/strategy-dev/server.ts` SHALL store `backtestSignalsCache`, `backtestRunSignalsMap`, and `backtestRunRuleSnapshotMap` inside bounded LRU caches, cap in-memory `mockRuns` growth, and invoke `.destroy()` on any pre-existing active session before overwriting the same `sessionId`.

#### Scenario: Restarting the same sessionId destroys the prior session timer
- **WHEN** a simulation session with an existing active `sessionId` is replaced in `activeSessions`
- **THEN** `destroy()` MUST be called on the displaced `StrategySimulationSession` prior to insertion
