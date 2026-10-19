# dev-backtest-api Specification

## Purpose
Define the local development server backtest API contract, boundary guard invariants, execution pipeline integration, and extreme stress testing capabilities without leaking proprietary tactical factors.

## ADDED Requirements

### Requirement: Dev Server Shall Provide HTTP Backtest API With Execution Metrics
The local development gateway (`tools/strategy-dev/server.ts`) SHALL expose a standard `POST /v1/strategy-backtests` endpoint that accepts backtest criteria, pushes bars through the unified `StrategyEvaluationKernel`, matches trades via `SimulatedBroker`, maintains daily NAV with `PositionStateMachine`, and returns annualized Sharpe ratio computed via Rust Polars.

#### Scenario: Successful backtest run via HTTP API
- **WHEN** client sends `POST /v1/strategy-backtests` with valid symbol, period, and date range
- **THEN** server MUST execute push evaluation using `StrategyEvaluationKernel`
- **AND** simulate Next-Bar trade fills via `SimulatedBroker`
- **AND** return HTTP 200 or 202 with `performance.sharpeRatio`, `performance.maxDrawdown`, and trade count

### Requirement: Dev Server Shall Support Five Preset Stress Scenarios
When `runStressSuite` is requested or configured, the local development gateway SHALL execute the five standard historical A-share stress scenarios (`CRASH_2015`, `CIRCUIT_2016`, `BEAR_2018`, `SQUEEZE_2024`, `PULSE_2024`) via `StressTestingSuiteOrchestrator` and return the consolidated health card.

#### Scenario: Stress testing suite inclusion
- **WHEN** `runStressSuite` is true in `POST /v1/strategy-backtests`
- **THEN** response MUST include `stressReport` with `overallRating`, `overallHealthScore`, and individual scenario outcomes

### Requirement: System Shall Enforce Boundary Guard Forbidding Direct Internal Calls
The system SHALL maintain an automated boundary guard test ensuring that strategy evaluation and testing workflows are executed strictly via the local dev server HTTP API, forbidding direct invocation of unexposed low-level implementation functions.

#### Scenario: Boundary verification
- **WHEN** boundary guard suite `dev-server-api-boundary.guard.spec.ts` runs
- **THEN** it MUST verify that client evaluation workflows communicate over HTTP
- **AND** verify that no direct low-level math or proprietary classes are accessed outside standard ports

### Requirement: Specs and Public Code Shall Preserve Private Factor Confidentiality
All OpenSpec specifications, schemas, and public codebase files SHALL interact with external plugins solely via abstract interfaces (`ExternalFactorPluginLoader`, `FactorPlugin`, generic IDs). No proprietary formulas, rules, or confidential parameters SHALL be disclosed.

#### Scenario: Confidentiality audit
- **WHEN** static scans or CI inspections review public change specifications
- **THEN** no proprietary implementation code or confidential tactical parameters SHALL be present
