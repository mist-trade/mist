## ADDED Requirements

### Requirement: QMT bridge assumes single-owner serial execution
The datasource SHALL treat the full-QMT built-in Python bridge as a
single-owner, serial execution runtime.

#### Scenario: Multiple bridge owners register
- **WHEN** a second QMT bridge owner attempts to register while one owner is
  active
- **THEN** the command gateway MUST reject the second owner or report the owner
  conflict as unhealthy

#### Scenario: External requests arrive concurrently
- **WHEN** multiple external requests enqueue QMT work
- **THEN** the command gateway MUST serialize the work before it reaches the
  QMT built-in Python script
- **AND** it MUST use stable timeout or error envelopes rather than parallel
  native QMT execution

### Requirement: QMT production bridge avoids unverified runtime features
The QMT production bridge script SHALL avoid runtime features that are risky in
the full-QMT built-in Python runtime.

#### Scenario: Bridge script is inspected
- **WHEN** static guardrails inspect the production bridge script
- **THEN** it MUST NOT import or use realtime-duplex transport, thread APIs,
  process APIs, subprocess APIs, or unverified third-party libraries
- **AND** it MUST use standard-library HTTP polling for command intake

### Requirement: QMT command latency is observable
The datasource SHALL report bridge readiness and command failures without
silently stalling the process.

#### Scenario: Command timeout expires
- **WHEN** a QMT bridge command does not complete before its configured timeout
- **THEN** the command gateway MUST mark it failed with a stable timeout error
- **AND** health output MUST expose enough state for operators to diagnose the
  stale owner or queue

#### Scenario: Bridge heartbeat stops
- **WHEN** the QMT bridge stops polling
- **THEN** the datasource MUST report QMT bridge readiness as false while the
  datasource process remains observable

### Requirement: Local historical reads avoid update collisions
The datasource SHALL avoid reading QMT historical DAT files during configured
update windows and while files are changing.

#### Scenario: DAT read is blocked by schedule
- **WHEN** current China time is after `QMT_LOCAL_DAT_BLOCK_AFTER`
- **THEN** the datasource MUST avoid opening the DAT file
- **AND** it MUST return a retryable datasource error or configured fallback

#### Scenario: DAT file changes during stability check
- **WHEN** file size or modification time changes between the pre-read and
  post-wait stat checks
- **THEN** the datasource MUST treat the file as unstable and MUST NOT parse it
