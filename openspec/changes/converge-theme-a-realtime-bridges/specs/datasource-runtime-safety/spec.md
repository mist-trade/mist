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
