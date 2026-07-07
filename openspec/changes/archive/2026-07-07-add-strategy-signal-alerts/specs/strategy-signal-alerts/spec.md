## ADDED Requirements

### Requirement: Enabled Strategies Shall Be Scanned

Mist SHALL provide a shared scan service that evaluates enabled strategy
definitions against current market context.

#### Scenario: Manual scan is requested

- **WHEN** an operator requests a strategy scan
- **THEN** the backend MUST evaluate enabled strategy definitions
- **AND** it MUST use each definition current strategy version
- **AND** it MUST evaluate configured target universe, period, and source
  coverage

### Requirement: Strategy Rules Shall Be Evaluated Deterministically

The scan service SHALL evaluate declarative rule expressions through a pure
rule evaluator.

#### Scenario: Rule matches K-line context

- **WHEN** a rule expression matches the built K-line and security context
- **THEN** the evaluator MUST return a match result without writing data

#### Scenario: Rule does not match K-line context

- **WHEN** a rule expression does not match the built context
- **THEN** the evaluator MUST return a non-match result without writing data

### Requirement: Matching Scans Shall Persist Signals And Alert Events

Mist SHALL persist live strategy signals and alert events when enabled strategy
rules match.

#### Scenario: A strategy match is found

- **WHEN** an enabled strategy current version matches a scanned security
- **THEN** the backend MUST persist a `StrategySignal`
- **AND** it MUST persist a linked `StrategyAlertEvent` in pending status

### Requirement: Alert Events Shall Be Deduplicated

Mist SHALL suppress duplicate alert events for repeated scans of the same
strategy/version/security/period/source/timestamp.

#### Scenario: Duplicate signal candidate is scanned

- **WHEN** a scan sees a candidate whose alert dedupe key already exists
- **THEN** the backend MUST NOT create another signal
- **AND** it MUST NOT create another alert event
- **AND** the scan result MUST report the skipped duplicate

### Requirement: Scan APIs Shall Use Version-First Paths

Manual scan APIs SHALL be exposed from `apps/mist` using `/v1/<resource>` paths.

#### Scenario: Scan route metadata is inspected

- **WHEN** strategy scan controller route metadata is inspected
- **THEN** it MUST expose `/v1/strategy-scans/run`
- **AND** it MUST NOT include `/api/mist`, `/api/chan`, or `/strategy/v1`
