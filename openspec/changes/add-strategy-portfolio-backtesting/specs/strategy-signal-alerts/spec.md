## MODIFIED Requirements

### Requirement: Enabled Strategies Shall Be Scanned

Mist SHALL provide a shared scan service that evaluates the paired rules of
enabled strategy definitions against completed market context, independently
from portfolio backtest eligibility.

#### Scenario: Manual scan is requested

- **WHEN** an operator requests a strategy scan
- **THEN** the backend MUST evaluate live-enabled strategy definitions
- **AND** it MUST use each definition current strategy version
- **AND** it MUST evaluate configured target universe, period, and source
  coverage
- **AND** it MUST evaluate the entry rule and the exit rule when present

#### Scenario: Backtest eligibility differs from live status

- **WHEN** an enabled live strategy has `backtestEnabled=false`
- **THEN** the scan service MUST still evaluate its current entry rule
- **AND** the backtest switch MUST NOT suppress live scanning

### Requirement: Strategy Rules Shall Be Evaluated Deterministically

The scan service SHALL evaluate declarative rule expressions through the same
pure field registry, context builder, and rule evaluator used by portfolio
backtesting.

#### Scenario: Rule matches completed context

- **WHEN** an entry or exit expression matches the current completed K-line,
  registered indicator values, security metadata, and bounded prior context
- **THEN** the evaluator MUST return a match result and signal kind without
  writing data

#### Scenario: Rule does not match completed context

- **WHEN** an expression does not match or lacks the prior value needed for a
  crossover
- **THEN** the evaluator MUST return a non-match result without writing data

#### Scenario: Live and historical context is compared

- **WHEN** live scan and portfolio backtest evaluate the same strategy version,
  security, source, period, timestamp, and completed bar history
- **THEN** they MUST resolve the same context values
- **AND** they MUST return the same entry and exit match results

### Requirement: Matching Scans Shall Persist Signals And Alert Events

Mist SHALL persist typed live strategy signals and alert events when enabled
strategy entry or exit rules match.

#### Scenario: An entry rule match is found

- **WHEN** an enabled strategy current entry rule matches a scanned security
- **THEN** the backend MUST persist a `StrategySignal` with kind `entry`
- **AND** it MUST persist the matched entry rule snapshot
- **AND** it MUST persist a linked `StrategyAlertEvent` in pending status

#### Scenario: An exit rule match is found

- **WHEN** an enabled strategy current exit rule matches a scanned security
- **THEN** the backend MUST persist a `StrategySignal` with kind `exit`
- **AND** it MUST persist the matched exit rule snapshot
- **AND** it MUST persist a linked `StrategyAlertEvent` in pending status

#### Scenario: Both rules match

- **WHEN** entry and exit rules both match the same completed context
- **THEN** the backend MUST persist one typed signal and alert candidate for
  each rule
- **AND** it MUST NOT collapse the two signal kinds into one ambiguous fact

### Requirement: Alert Events Shall Be Deduplicated

Mist SHALL suppress duplicate alert events for repeated scans of the same
strategy/version/security/period/source/timestamp/signal-kind tuple.

#### Scenario: Duplicate typed signal candidate is scanned

- **WHEN** a scan sees a candidate whose alert dedupe key already exists for
  the same signal kind
- **THEN** the backend MUST NOT create another signal
- **AND** it MUST NOT create another alert event
- **AND** the scan result MUST report the skipped duplicate

#### Scenario: Opposite signal kind matches at the same time

- **WHEN** an entry alert exists and an exit rule also matches the same
  strategy/version/security/period/source/timestamp
- **THEN** the exit candidate MUST use a distinct dedupe key
- **AND** it MUST remain eligible for its own signal and alert event
