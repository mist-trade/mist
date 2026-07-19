## ADDED Requirements

### Requirement: QMT realtime lifecycle is mode isolated
The QMT datasource MUST create and start its realtime collector only in `builtin_experimental` mode, MUST stop it during application shutdown, and MUST reject unknown mode values at startup.

#### Scenario: QMT mode is off
- **WHEN** the QMT application starts with mode `off`
- **THEN** no collector task, experimental WebSocket manager, or realtime health route is mounted

#### Scenario: Unknown QMT mode is configured
- **WHEN** the QMT application starts with any unsupported mode value
- **THEN** startup fails before runtime components are exposed

### Requirement: QMT native collection is bounded
The QMT realtime collector MUST permit one command in flight, use a bounded subscription set, validate current Beijing-session freshness, and expose stable error and overlap counters.

#### Scenario: Previous command has not completed
- **WHEN** a collection interval arrives while a QMT command remains pending
- **THEN** no second command is enqueued and the overlap counter increases

### Requirement: TDX native HIL evidence is bounded and secret-free
The TDX experimental gateway SHALL retain only the latest accepted native
snapshot evidence for currently desired symbols and SHALL expose it only on a
loopback route without lease credentials.

#### Scenario: Accepted native snapshot is inspected
- **WHEN** a loopback operator reads evidence for a desired TDX symbol
- **THEN** the response contains native data, capture metadata, stream epoch, and the accepted frame but no lease token

#### Scenario: Owner epoch changes
- **WHEN** a new TDX bridge owner epoch replaces the previous owner
- **THEN** all native evidence from the previous epoch is removed
