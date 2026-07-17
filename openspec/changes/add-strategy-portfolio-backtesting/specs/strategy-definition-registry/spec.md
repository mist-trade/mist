## MODIFIED Requirements

### Requirement: Strategy Definitions Shall Be Versioned

Mist SHALL store business strategy identity separately from immutable strategy
rule versions, and each V1 version SHALL carry the complete paired trading-rule
contract used by live and historical evaluation.

#### Scenario: A strategy is created

- **WHEN** a client creates a strategy definition with a valid V1 entry rule,
  optional exit rule, and valid `lookbackBars`
- **THEN** the backend MUST persist one `StrategyDefinition`
- **AND** it MUST persist initial `StrategyVersion` number `1`
- **AND** the version MUST store `entryRule`, `exitRule`, `lookbackBars`, rule
  schema version, and validation metadata
- **AND** the definition MUST reference that version as its current version

#### Scenario: Versioned strategy behavior is updated

- **WHEN** a client updates `entryRule`, `exitRule`, or `lookbackBars`
- **THEN** the backend MUST create a new `StrategyVersion`
- **AND** it MUST update the definition current version pointer
- **AND** previous versions MUST remain available for later signal and backtest
  reproducibility

#### Scenario: Registry-only metadata is updated

- **WHEN** a client updates only definition identity or registry metadata
- **THEN** the backend MUST update the existing definition
- **AND** it MUST NOT create a duplicate rule version

### Requirement: Strategy Rules Shall Be Declarative And Validated

V1 strategy definitions SHALL store declarative entry and exit rule JSON and
MUST NOT accept arbitrary executable user code or a field/operator that the
shared evaluation context cannot resolve consistently.

#### Scenario: Paired rules are accepted

- **WHEN** entry and exit expressions use allowed logical groups, registered
  field paths, and deterministic operators
- **THEN** the validator MUST validate each expression independently
- **AND** the persisted version MUST include validation metadata for both rules
- **AND** every accepted field/operator combination MUST have shared live-scan
  and historical evaluation coverage

#### Scenario: Exit rule is omitted for a non-backtest strategy

- **WHEN** a definition has `backtestEnabled=false` and submits a valid entry
  rule without an exit rule
- **THEN** the backend MUST accept the version for live entry-signal use
- **AND** it MUST keep that version ineligible for a new portfolio backtest

#### Scenario: Unsupported context field is submitted

- **WHEN** a rule uses a nested field path for which no shared as-of resolver is
  registered
- **THEN** the backend MUST reject the strategy request before persistence
- **AND** a historically accepted root name alone MUST NOT make the path valid

#### Scenario: Chan field is submitted before an as-of contract exists

- **WHEN** a V1 rule in this change uses a `chan.*` field path
- **THEN** the backend MUST reject the version before persistence
- **AND** it MUST explain that Chan strategy fields require a later registered
  source-aware historical resolver

#### Scenario: Declared lookback cannot resolve a registered field

- **WHEN** either rule uses a registered field whose required prior history is
  greater than `lookbackBars`
- **THEN** the backend MUST reject the version before persistence
- **AND** the validation error MUST identify the field path and minimum
  required lookback

#### Scenario: Crossover operator is accepted

- **WHEN** a rule uses `crossesAbove` or `crossesBelow` with a registered
  numeric field and numeric threshold
- **THEN** the evaluator MUST compare current and prior completed contexts
- **AND** the first context without a prior resolved value MUST not match a
  crossover

#### Scenario: Executable code is rejected

- **WHEN** a rule expression contains arbitrary code text or an unsupported
  operator
- **THEN** the backend MUST reject the strategy request before persistence

## ADDED Requirements

### Requirement: V1 Strategy Field Catalog Shall Be Explicit

The V1 validator SHALL accept only `k.open`, `k.high`, `k.low`, `k.close`,
`k.volume`, `k.amount`, `security.code`, `security.type`,
`indicator.macd.macd`, `indicator.macd.signal`,
`indicator.macd.histogram`, `indicator.rsi14`, `indicator.kdj.k`,
`indicator.kdj.d`, `indicator.kdj.j`, `indicator.adx14`,
`indicator.atr14`, `indicator.ma13`, and `indicator.ma60` until a later change
adds another shared as-of resolver.

#### Scenario: Catalogued field is submitted

- **WHEN** a V1 condition uses a listed field with a type-compatible operator
  and value and sufficient lookback
- **THEN** the validator MUST accept that condition
- **AND** live and historical context builders MUST resolve it from completed
  data only

#### Scenario: Uncatalogued field is submitted

- **WHEN** a V1 condition uses any path outside the listed catalog
- **THEN** the validator MUST reject it before persistence

#### Scenario: Field value or operator type is incompatible

- **WHEN** a numeric field is compared to a non-numeric threshold, a string
  field uses a numeric ordering/crossover operator, or a crossover has a
  non-numeric threshold
- **THEN** the validator MUST reject the condition with field-specific details

### Requirement: Strategy Backtest Eligibility Shall Be Explicit

`StrategyDefinition.backtestEnabled` SHALL control creation eligibility for
portfolio backtests independently from the definition live-scan lifecycle
status.

#### Scenario: Backtesting is enabled

- **WHEN** a client sets `backtestEnabled=true`
- **THEN** the current version MUST contain valid entry and exit rules
- **AND** `lookbackBars` MUST be an integer from 1 through 250
- **AND** the definition MUST include daily period and at least one configured
  V1 portfolio source from `tdx` or `qmt`
- **AND** the backend MUST reject the update when any condition is not met

#### Scenario: Only an unsupported portfolio source is configured

- **WHEN** a definition has only `ef` configured and a client sets
  `backtestEnabled=true`
- **THEN** the backend MUST reject the update with a source eligibility reason
- **AND** live strategy use of that source MUST remain unchanged

#### Scenario: Backtesting is disabled

- **WHEN** a client sets `backtestEnabled=false`
- **THEN** the backend MUST reject creation of new portfolio runs for that
  definition
- **AND** it MUST preserve all existing versions and backtest runs

#### Scenario: Live status changes

- **WHEN** a definition is enabled, disabled, or archived for live scanning
- **THEN** the backend MUST NOT implicitly change `backtestEnabled`
- **AND** a `backtestEnabled` update MUST NOT implicitly change live status

### Requirement: V1 Development Strategy Data Shall Be Migrated Deterministically

The portfolio migration SHALL convert the unused single-rule V1 persistence
shape without creating a second rule schema.

#### Scenario: Existing strategy version is migrated

- **WHEN** migration 007 encounters an existing `strategy_versions.rule`
- **THEN** it MUST preserve that JSON as `entry_rule`
- **AND** it MUST set `exit_rule` to null and `lookback_bars` to 1
- **AND** the owning definition MUST have `backtest_enabled=false`

#### Scenario: Migrated definition is read

- **WHEN** a client reads a migrated strategy
- **THEN** it MUST be usable for its prior entry-signal behavior
- **AND** it MUST require an explicit valid exit rule before backtesting can be
  enabled

### Requirement: Backtest Interfaces Shall Carry Portfolio Configuration

The strategy registry foundation SHALL expose the existing V1 backtest
resource with portfolio execution inputs and immutable result snapshots.

#### Scenario: A portfolio backtest is requested

- **WHEN** a client requests a run with eligible strategy identity, target
  universe, daily period, source, dates, capital, allocation, execution-cost,
  and benchmark settings
- **THEN** the backend MUST persist the resolved strategy and normalized
  configuration snapshots on `BacktestRun`
- **AND** it MUST expose run lifecycle and portfolio result access below
  `/v1/strategy-backtests`

## REMOVED Requirements

### Requirement: Backtest Interfaces Shall Be Reserved Without Portfolio Fields

**Reason**: The reserved synchronous signal-only boundary is superseded by the
approved portfolio backtest module, which requires capital, allocation,
execution-cost, order, trade, equity, and performance fields.

**Migration**: Keep `/v1/strategy-backtests` and the established strategy
service/entity names, replace the unused V1 payload in place, migrate strategy
rules as specified above, and remove development-only signal-run data that
cannot represent portfolio execution.
