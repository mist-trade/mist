## ADDED Requirements

### Requirement: Full-QMT bridge assumes single-threaded built-in runtime
The datasource SHALL treat full-QMT built-in Python as a single-threaded,
single-owner runtime unless Windows spike evidence explicitly proves a broader
execution model safe.

#### Scenario: QMT bridge code is inspected
- **WHEN** static checks inspect the QMT built-in bridge script
- **THEN** the script MUST NOT import or use thread, process, subprocess, or
  worker-pool APIs

#### Scenario: External requests arrive concurrently
- **WHEN** multiple external datasource requests target QMT at the same time
- **THEN** the command gateway MUST serialize work before it reaches the QMT
  bridge owner
- **AND** queued commands MUST time out or fail with stable errors rather than
  forcing parallel native QMT execution

### Requirement: Full-QMT blocking behavior is bounded and observable
The datasource SHALL bound and report bridge command latency so QMT built-in
Python blocking behavior cannot silently stall production collection.

#### Scenario: QMT command exceeds timeout
- **WHEN** a QMT bridge command does not complete before its configured timeout
- **THEN** the command gateway MUST mark the command failed with a stable
  timeout error
- **AND** health output MUST expose the timeout in bridge status

#### Scenario: Bridge heartbeat stops
- **WHEN** the QMT bridge stops polling or posting heartbeats
- **THEN** the datasource MUST report QMT bridge readiness as false while
  keeping the process observable

#### Scenario: WebSocket blocking loop is evaluated
- **WHEN** a WebSocket spike keeps a QMT-initiated connection open in one
  script thread
- **THEN** the loop MUST be bounded by a configured maximum duration
- **AND** spike output MUST report whether the loop prevented other QMT
  callbacks or strategies from running
- **AND** production WebSocket transport MUST remain disabled until that impact
  is explicitly accepted

### Requirement: Local historical file reads avoid update collisions
The datasource SHALL avoid reading QMT historical DAT files during the
operator-configured update window and SHALL verify file stability before
parsing.

#### Scenario: DAT read is blocked by schedule
- **WHEN** the current China time is after the configured local DAT block time
- **THEN** the datasource MUST avoid opening the DAT file
- **AND** the response MUST be either a retryable datasource error or a bridge
  fallback according to configuration

#### Scenario: DAT file changes during stability check
- **WHEN** size or modification time changes between the pre-read and post-wait
  stat checks
- **THEN** the datasource MUST treat the file as unstable and MUST NOT parse it

#### Scenario: DAT block policy is fallback bridge
- **WHEN** local DAT reads are blocked by schedule or file instability and the
  configured policy is `fallback_bridge`
- **THEN** the datasource MAY try the verified QMT bridge path
- **AND** if the bridge is unavailable or the operation is not implemented, the
  datasource MUST return a retryable datasource error instead of opening the
  local file
