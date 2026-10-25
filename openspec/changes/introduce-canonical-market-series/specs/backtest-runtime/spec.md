# backtest-runtime Specification Delta

## REMOVED Requirements

### Requirement: Backtest Shall Accept TDX, QMT And Vendor Sources

**Reason**: Backtest no longer selects a provider. Every run replays the canonical series for its
security and period, assembled from an external splice policy. Keeping a provider selector in the
create contract would preserve the very design this capability removes, and would expose a private
splice strategy to callers.

**Migration**: Replaced by "Backtest Shall Replay The Canonical Series" below. Runs created before
this change keep their original provider value and remain replayable through the legacy
single-provider path. The create contract no longer accepts `source`.

## ADDED Requirements

### Requirement: Backtest Shall Replay The Canonical Series

A Backtest run SHALL replay the canonical series for each target security and the run's period.
The create contract SHALL NOT accept a provider source. The run SHALL record the applied splice
policy version, and every persisted result SHALL record the raw provider origin of its bar.

Runs created before this capability SHALL remain replayable using their original provider, without
being rewritten or reinterpreted.

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
