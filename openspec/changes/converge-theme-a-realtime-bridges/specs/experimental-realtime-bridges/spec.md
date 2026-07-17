## ADDED Requirements

### Requirement: Experimental realtime modes are explicit and default off
The system SHALL activate a builtin experimental realtime transport only when the corresponding source mode equals `builtin_experimental`, and QMT SHALL default to `off`.

#### Scenario: QMT mode is omitted
- **WHEN** the QMT datasource and backend start without `QMT_REALTIME_MODE`
- **THEN** no QMT experimental collector, WebSocket route, client, or diagnostic controller is active

#### Scenario: QMT experimental mode is selected
- **WHEN** both components start with `QMT_REALTIME_MODE=builtin_experimental`
- **THEN** only the experimental QMT transport is activated and historical QMT behavior remains available

### Requirement: Experimental snapshots are fenced and strict
Each experimental transport MUST freeze a versioned payload contract, stream epoch, and monotonic sequence, and the backend MUST reject frames that are stale, duplicate, out of order, unauthorized, malformed, or from an unknown contract.

#### Scenario: Snapshot sequence is replayed
- **WHEN** a backend store has accepted a sequence and receives that sequence again in the same epoch
- **THEN** the replay is dropped and the stable duplicate counter increases

#### Scenario: Owner generation changes
- **WHEN** the datasource starts a new stream epoch after owner replacement or restart
- **THEN** the backend invalidates the previous epoch before accepting new snapshots

### Requirement: Experimental transports have no K or business side effects
Experimental TDX and QMT modules MUST keep snapshots in memory only and MUST NOT write K rows or invoke historical collectors, aggregators, scanners, strategies, signals, alerts, or trading operations.

#### Scenario: Experimental snapshot is accepted
- **WHEN** a valid authorized TDX or QMT snapshot reaches the backend
- **THEN** diagnostic latest-snapshot state changes and all K and business-side-effect probes remain untouched

### Requirement: Theme A completion requires Windows evidence
Theme A MUST remain incomplete until accepted TDX F2 and QMT trading-session evidence identifies exact master SHAs, native runtime versions, bridge script hashes, snapshots, restart and rollback results, and unchanged database content digests.

#### Scenario: Local replay passes without Windows evidence
- **WHEN** all macOS tests pass but either live evidence package is absent
- **THEN** experimental modes remain default off and Theme B remains blocked from merge
