## ADDED Requirements

### Requirement: Backtest Execution Grouping And Next-Bar Recompute Parity
`BacktestRunExecutor` SHALL derive each signal group's `effectiveTime` via `availabilityKey({ period, timestamp: first.signalTime })`, propagate `macroRegime` into `TradingEngine.surveilBar` / `decide`, and adjust Next-Bar Open buy order quantities via `recomputeNextBarOpenBuyQuantity` identically to `runTradingPipeline`.

#### Scenario: Backtest group uses canonical availabilityKey and shared Next-Bar buy recompute
- **WHEN** `BacktestRunExecutor` flushes pending signal groups on the next execution bar whose open differs from `triggerPrice`
- **THEN** the `SignalGroupInput.effectiveTime` MUST equal `availabilityKey` of the group's primary signal timestamp
- **AND** buy quantities MUST pass through `recomputeNextBarOpenBuyQuantity` before `broker.submitOrder`
