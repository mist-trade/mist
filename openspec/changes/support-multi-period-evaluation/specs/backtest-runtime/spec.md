# backtest-runtime Specification Delta

## MODIFIED Requirements

### Requirement: Backtest Shall Replay The Canonical Series

A Backtest run SHALL replay the canonical series for each target security. The run's period is
the plan's evaluation period; every context period declared by the plan's compiled context
requirements SHALL be replayed as an additional canonical series of the same security, merged in
causal order (same timestamp, lower period first). The create contract SHALL NOT accept a
provider source. The run SHALL record the applied splice policy version, and every persisted
result SHALL record the raw provider origin of its evaluated bar. Context-period bars SHALL
advance only their own windows: they MUST NOT drive trade execution, position accounting or
intraday NAV settlement.

Runs created before this capability SHALL remain replayable using their original provider,
without being rewritten or reinterpreted.

#### Scenario: A canonical run is created
- **WHEN** a create request is submitted without a source
- **THEN** the run MUST be accepted and marked as canonical
- **AND** its execution MUST read the canonical series for each target

#### Scenario: A legacy source is submitted on create
- **WHEN** a create request carries a `source` field
- **THEN** the request MUST be rejected with a validation error
- **AND** no StrategyVersion query, run insert or RPC submission MAY occur

#### Scenario: A legacy pending run is claimed
- **WHEN** the runner claims a PENDING run created before this capability
- **THEN** it MUST replay that run's original provider series
- **AND** it MUST NOT rewrite the run's source or apply the canonical policy

#### Scenario: The policy version is recorded
- **WHEN** a canonical run completes
- **THEN** `data_policy_version` MUST equal the policy version used for the replay
- **AND** result rows MUST record each bar's raw provider as their source

#### Scenario: A run contains multiple target securities
- **WHEN** a run resolves one or more securities from `targetUniverse`
- **THEN** every target MUST use the same canonical policy version and the run's period
- **AND** a target item MUST NOT select a different provider or policy

#### Scenario: Context periods are replayed as canonical series
- **WHEN** a plan's compiled context requirements declare periods other than the run's period
- **THEN** the runner MUST replay each declared period from the canonical series of the same
  security
- **AND** the merge MUST order the push stream by availability key ascending with period
  ascending on ties, reproducing the realtime trigger arrival order
- **AND** the canonical daily bars, labeled `00:00`, MUST be ordered by their availability key
  (`15:01` of their trading day) rather than their raw label
- **AND** pre-warm SHALL be supplied per period with the uniform degradation semantics, selected
  by availability key against the public boundary

#### Scenario: Context bars do not drive execution
- **WHEN** a context-period bar is pushed during replay
- **THEN** the bar MUST advance only its own window
- **AND** it MUST NOT trigger order arbitration, broker fills, position state transitions or
  intraday NAV day-close settlement
- **AND** daily close settlement MUST occur exactly once per trading day, driven only by
  evaluation-period bars

#### Scenario: The canonical range has no bars
- **WHEN** the canonical series has no bars for part of the requested replay
- **THEN** Backtest MUST preserve that absence
- **AND** it MUST NOT query, merge or fall back to a provider outside the policy

#### Scenario: Legacy runs of different providers are queried
- **WHEN** previously completed runs with different providers are read
- **THEN** their original results MUST remain unchanged
- **AND** runs created under different policy versions MUST be treated as independent experiments

#### Scenario: Startup or abnormal data exposes an unsupported pending run
- **WHEN** the runner claims a persisted PENDING run whose marker is neither canonical nor a
  supported legacy provider
- **THEN** it MUST enter the runner-owned FAILED path with safe class
  `BACKTEST_SOURCE_UNSUPPORTED`
- **AND** it MUST do so before the first historical page query or evaluation

#### Scenario: The removed selector is inspected
- **WHEN** this change is implemented or released
- **THEN** the public create contract MUST NOT expose a provider source field
- **AND** no per-request provider override MAY be added without a focused review
