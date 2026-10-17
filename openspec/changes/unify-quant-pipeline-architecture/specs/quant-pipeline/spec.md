# quant-pipeline Specification

## Purpose
Define the formal domain specification for `QuantPipeline` and its pluggable `QuantSink` architecture, unifying historical replay, live sealed candle streaming, and simulation under a deterministic reactive stream model, while decoupling broker execution, position management, and simulation frame generation from the core strategy library.

## ADDED Requirements

### Requirement: Unified Reactive Quant Pipeline Orchestration
The system SHALL provide a `QuantPipeline` orchestrator that accepts a `BarSource`, drives a `StrategyEvaluationKernel`, and broadcasts sequential event callbacks (`onBar`, `onSignal`, `onDayClose`, `flush`) to registered `QuantSink` implementations. The pipeline execution MUST preserve strict temporal causality: $t_{\text{bar}} \le t_{\text{eval}} < t_{\text{next}}$.

#### Scenario: Deterministic sequential step execution
- **WHEN** a sealed `StrategyBar` is passed to `pipeline.step(bar)`
- **THEN** the pipeline MUST invoke `onBar(bar)` on all sinks before evaluating the current bar
- **AND** it MUST push the bar into `StrategyEvaluationKernel`
- **AND** if any `KernelSignal` instances are emitted, it MUST invoke `onSignal(signal, bar)` for each signal on all sinks
- **AND** if the bar represents daily closing, it MUST invoke `onDayClose(bar)` on all sinks.

#### Scenario: Driving from historical bar source
- **WHEN** `pipeline.drive(historicalBarSource)` is executed
- **THEN** the historical bar source MUST feed prewarm bars silently to the kernel
- **AND** it MUST stream public replay pages into `pipeline.step(bar)` sequentially without skipping bars or reordering timestamps.

---

### Requirement: Pluggable QuantSink Interface & Lifecycle
The system SHALL define a standard `QuantSink` interface with optional lifecycle methods (`onBar`, `onSignal`, `onDayClose`, `flush`). Sinks SHALL NOT depend directly on each other and MUST NOT introduce I/O, framework, or database dependencies into `libs/strategy`.

#### Scenario: QuantSink lifecycle hooks
- **WHEN** an event occurs in the pipeline
- **THEN** sinks implementing the corresponding lifecycle hook MUST be invoked in declaration order
- **AND** any sink throwing an unhandled exception SHALL halt the pipeline and report the failed stage.

---

### Requirement: Standard Broker Execution Sink
The system SHALL encapsulate `SimulatedBroker` and `PositionStateMachine` inside a standard `BrokerExecutionSink`. The sink SHALL manage order creation upon entry/exit signals, Next-Bar order matching, A-share microstructure constraints (T+1 locking, limit-up/down blocking, fees/taxes), and Mark-to-Market daily NAV accounting.

#### Scenario: Entry signal reception
- **WHEN** `BrokerExecutionSink.onSignal(signal, bar)` receives a valid entry signal while position status is `EMPTY`
- **THEN** it MUST calculate target round lots (multiples of 100) based on available cash and current close price
- **AND** it MUST submit a buy market order to `SimulatedBroker` timestamped with `signal.signalTime`.

#### Scenario: Next-bar execution
- **WHEN** subsequent Bar $t+1$ arrives and `BrokerExecutionSink.onBar(bar)` is invoked
- **THEN** `SimulatedBroker` MUST execute pending orders against Bar $t+1$ open price (adjusted for slippage and fee rules)
- **AND** fill events MUST update `PositionStateMachine` cash and holding quantities.

#### Scenario: Daily close mark-to-market
- **WHEN** a bar satisfying `isDailyCloseBar(bar)` triggers `BrokerExecutionSink.onDayClose(bar)`
- **THEN** `PositionStateMachine` MUST append a `DailyNavSnapshot` reflecting current total equity, cash, and market value.

---

### Requirement: Simulation Frame Sink for Interactive Dev Gateway
The system SHALL encapsulate local visualization frame generation inside `SimulationFrameSink`. The sink SHALL capture sliding window bars, render geometric commands, and assemble immutable `SimulationFrame` instances for development tools and SSE streaming.

#### Scenario: Frame assembly
- **WHEN** `SimulationFrameSink.onBar(bar)` and `onSignal(signal, bar)` are invoked
- **THEN** it MUST record the current active window slice from the kernel
- **AND** it MUST format decision trace evidence and UI display tags into the active frame.

---

### Requirement: Backtest Run Executor Pipeline Refactoring
The `BacktestRunExecutor` in `apps/backtest` SHALL assemble and execute回测 via `QuantPipeline`, replacing manual coordination loops with standard pipeline sinks (`BrokerExecutionSink` and `SignalBatchCollectorSink`).

#### Scenario: Backtest run execution parity
- **WHEN** a backtest run is executed through the refactored `QuantPipeline`
- **THEN** emitted `BacktestSignalResult` and `BacktestTradeResult` rows MUST match the exact identical timestamps, quantities, prices, and performance metrics as the legacy execution loop.
