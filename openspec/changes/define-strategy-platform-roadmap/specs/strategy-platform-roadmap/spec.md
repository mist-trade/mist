## ADDED Requirements

### Requirement: Strategy Platform Roadmap Shall Govern Product Expansion

The strategy platform roadmap SHALL define the product-scope sequence for
strategy registration, realtime signal alerts, and signal-level backtesting
without directly implementing runtime code.

#### Scenario: A strategy platform implementation is requested

- **WHEN** work begins on strategy registration, signal alerts, or backtesting
- **THEN** the work MUST enter a focused child OpenSpec change
- **AND** the child change MUST reference this roadmap or a newer superseding
  roadmap

### Requirement: Child Changes Shall Remain Independently Scoped

The roadmap SHALL decompose strategy platform work into independently
spec-able, testable, and archivable child changes.

#### Scenario: A child strategy change is created

- **WHEN** a follow-up OpenSpec change is created for the strategy platform
- **THEN** it MUST state owner repositories, runtime impact, API or data-model
  impact, validation commands, live-runtime relevance, and archive criteria

### Requirement: Shared Strategy Definition Shall Come First

The first implementation child change SHALL define a shared strategy
definition model that can be consumed by both realtime signal detection and
historical signal backtesting.

#### Scenario: Alert or backtest work starts before strategy definitions

- **WHEN** a child change proposes alert scanning or signal backtesting
- **THEN** it MUST either depend on `add-strategy-definition-registry`
- **OR** explicitly include the shared definition contract needed by both
  realtime and historical execution

### Requirement: Initial Strategy Expressions Shall Be Declarative

The first strategy-definition phase SHALL use declarative, persisted, and
validated rule expressions instead of arbitrary user-provided code.

#### Scenario: A first-phase strategy definition is proposed

- **WHEN** the child change defines how users register strategy logic
- **THEN** it MUST model rules as declarative expressions over known Mist data
  or computed analysis outputs
- **AND** it MUST NOT require arbitrary user JS, Python, SQL, or shell code

### Requirement: Product Strategy Names Shall Avoid Runtime Strategy Ambiguity

The roadmap SHALL keep product strategy terminology separate from existing data
collection strategies and TDX/QMT desktop strategy identity.

#### Scenario: A strategy platform child change names types or modules

- **WHEN** the child change introduces product strategy entities, DTOs, APIs, or
  UI labels
- **THEN** it MUST avoid implying that collector `DataCollectionStrategy`
  classes or datasource-side TDX/QMT strategy identities are business trading
  strategies

### Requirement: Signal Alerts Shall Follow Strategy Definition

The roadmap SHALL prioritize realtime or near-realtime signal detection and
alert events after the shared strategy definition foundation.

#### Scenario: Alert child change is created

- **WHEN** `add-strategy-signal-alerts` or its successor is created
- **THEN** it MUST define how enabled strategy definitions are scanned
- **AND** it MUST define persisted signal and alert event semantics
- **AND** it MUST define validation for duplicate suppression or alert
  cooldown behavior

### Requirement: Alerts Shall Persist Backend Events Before Delivery

Mist SHALL own strategy signal and alert event persistence before AstrBot or
other delivery surfaces consume the events.

#### Scenario: AstrBot alert integration is planned

- **WHEN** a child change adds AstrBot or `mist-skills` behavior for strategy
  alerts
- **THEN** it MUST consume Mist backend signal or alert events
- **AND** it MUST NOT make AstrBot or `mist-skills` the primary strategy rule
  execution engine

### Requirement: Initial Backtesting Shall Be Signal-Level

The first backtesting phase SHALL replay declarative strategy definitions over
historical market data and produce signal-level results, not portfolio-level
execution simulation.

#### Scenario: Backtest child change is created

- **WHEN** `add-strategy-signal-backtesting` or its successor is created
- **THEN** it MUST define inputs for strategy, target universe, period, and time
  range
- **AND** it MUST define outputs for signal occurrences and aggregate signal
  statistics
- **AND** it MUST exclude cash, positions, orders, fees, slippage, and portfolio
  allocation unless a later portfolio-backtesting child change is created

### Requirement: Frontend Strategy UX Shall Follow Backend Contracts

The frontend operator experience SHALL be planned after backend strategy
definition, signal, alert, and backtest contracts are specified.

#### Scenario: Strategy frontend work is proposed

- **WHEN** a child change proposes strategy editor, signal list, alert state, or
  backtest result screens
- **THEN** it MUST name the backend contracts it depends on
- **AND** it MUST continue using Mist backend APIs rather than calling
  datasource services directly

### Requirement: Roadmap Disposition Shall Be Tracked

The roadmap SHALL remain open until each child item has an explicit
disposition.

#### Scenario: Strategy roadmap is considered for archive

- **WHEN** this roadmap is ready to be archived
- **THEN** each child item MUST be marked completed, archived, superseded,
  deferred, or dropped
- **AND** deferred or dropped items MUST include a reason
