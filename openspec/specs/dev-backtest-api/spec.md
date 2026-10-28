# dev-backtest-api Specification

## Purpose
TBD - created by archiving change evaluate-private-tactical-strategies. Update Purpose after archive.
## Requirements
### Requirement: Dev Server Shall Provide HTTP Backtest API With Execution Metrics
The local development gateway (`tools/strategy-dev/server.ts`) SHALL expose a standard `POST /v1/strategy-backtests` endpoint that accepts backtest criteria, drives a multi-period push replay through `HistoricalBarSource` into the unified `StrategyEvaluationKernel` (evaluation period plus plugin-derived context periods), matches trades via `SimulatedBroker`, maintains daily NAV with `PositionStateMachine`, and returns annualized Sharpe ratio computed via Rust Polars. Trade matching, position transitions, risk arbitration, and NAV daily settlement SHALL be driven exclusively by evaluation-period bars; context bars only feed kernel windows.

#### Scenario: Successful backtest run via HTTP API
- **WHEN** client sends `POST /v1/strategy-backtests` with valid symbol, period, and date range
- **THEN** server MUST execute push evaluation using `StrategyEvaluationKernel`
- **AND** simulate Next-Bar trade fills via `SimulatedBroker`
- **AND** return HTTP 200 or 202 with `performance.sharpeRatio`, `performance.maxDrawdown`, and trade count

#### Scenario: Multi-period replay with plugin-derived context
- **WHEN** the compiled decision flow references plugins that declare context requirements (e.g. 30m evaluation with 5m/1440 context)
- **THEN** server MUST merge per-period local bar streams via `HistoricalBarSource` in `(availabilityKey, period)` ascending order
- **AND** context bars MUST NOT trigger broker fills, position transitions, risk arbitration, or NAV settlement
- **AND** response MUST include read-only `prewarmStatus` and per-period prewarm diagnostics

#### Scenario: Missing context data fails closed
- **WHEN** a context period required by plugin declarations has no local synced data file
- **THEN** server MUST reject the request with a bounded error code and a `dev:sync` hint
- **AND** MUST NOT silently evaluate with an empty context window

#### Scenario: Stored definition replay via local export
- **WHEN** a backtest request references a `strategyDefinitionId` whose definition version JSON has been exported to the private-repo definitions directory (`mist-alpha-private/market-data/strategy-definitions/`)
- **THEN** server MUST compile it via the shared stored-definition compile boundary (producing flow and `contextRequirements` identically to the production backtest runtime)
- **AND** exported definition files MUST live only in the private repo (they may contain proprietary plugin parameters)

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

### Requirement: Dev Server Context Requirements Shall Derive From Factor Plugin Metadata
The dev server backtest plan SHALL derive `contextRequirements` from factor plugin metadata via the shared compile-boundary derivation (`deriveContextRequirements`), taking the max per period across all plugin nodes of the decision flow. The HTTP caller SHALL NOT pass lookback or context-window parameters; a plugin that is unregistered or declares an invalid requirement SHALL fail the request with a bounded error instead of degrading to an empty context.

#### Scenario: Context derivation from plugin declarations
- **WHEN** a backtest request compiles a decision flow whose plugins declare context requirements
- **THEN** server MUST derive the merged per-period requirement map and populate the kernel plan
- **AND** the request body MUST NOT accept caller-provided lookback overrides

#### Scenario: Invalid or unknown plugin declaration fails the request
- **WHEN** the flow references an unregistered plugin or a plugin declares an invalid context requirement
- **THEN** server MUST return HTTP 422 with a bounded error code
- **AND** MUST NOT start the replay

### Requirement: Local Synced Market Data Shall Preserve Source And Quality Semantics
The dev sync tool (`tools/strategy-dev/sync.ts`) SHALL persist each row's real `k.source` and SHALL consume `k_quality` masks: invalid volume/amount fields SHALL be persisted as `null` (delegating degradation to factor-plugin null contracts), and rows with any invalid OHLC mask SHALL be dropped. Large series SHALL be persisted as compact JSON and pulled in bounded chunks to avoid unbounded buffering.

#### Scenario: Quality semantics preserved with production parity
- **WHEN** syncing rows alongside `k_quality` masks
- **THEN** the default MUST persist raw values (production backtest replay does not consume quality masks; masking would fork local-vs-run parity)
- **AND** an explicit opt-in (`--mask-quality`) MUST drop rows with any invalid OHLC mask and persist `null` for invalid volume/amount
- **AND** each row MUST carry its real segment source

#### Scenario: Source provenance preserved
- **WHEN** synced rows span multiple canonical segments (e.g. vendor_a then qmt)
- **THEN** each row MUST carry its real segment source
- **AND** the dev replay port MUST propagate it into `StrategyBar.source`

#### Scenario: Full-range long-history sync
- **WHEN** syncing a series larger than the single-response buffer budget
- **THEN** the tool MUST pull in bounded chunks and merge strictly ascending
- **AND** large outputs MUST be persisted as compact JSON

### Requirement: Dev Server Multi-Period Replay Shall Reuse Production Merge Machinery
The dev server SHALL NOT implement its own cross-period merge, prewarm slicing, or availability computation; it SHALL reuse `HistoricalBarSource` (including `mergeByAvailability` and the shared `availabilityKey` helper) so that the local lane's push order is identical to the production backtest and realtime lanes. The boundary guard SHALL enforce this statically.

#### Scenario: Boundary guard forbids hand-written merge loops
- **WHEN** the boundary guard suite scans `tools/strategy-dev/**`
- **THEN** it MUST fail if server code implements its own cross-period merge or availability computation
- **AND** it MUST verify that replay advancement imports `HistoricalBarSource`

#### Scenario: Dev lane matches production replay order
- **WHEN** the same bar series and strategy shape are replayed locally and in the production backtest runtime
- **THEN** emitted signals MUST match one-for-one in order and timestamps

