## ADDED Requirements

### Requirement: QMT experimental consumer is independent
The backend SHALL implement QMT experimental realtime through a dedicated module, client, allowlist, store, and diagnostic controller that do not inherit from or instantiate the legacy TDX realtime graph.

#### Scenario: TDX is off and QMT experimental is enabled
- **WHEN** the Mist app starts with `TDX_REALTIME_MODE=off` and `QMT_REALTIME_MODE=builtin_experimental`
- **THEN** historical collection and QMT experimental diagnostics are available while both TDX realtime modules are absent

#### Scenario: Schedule app starts
- **WHEN** the schedule app starts under any realtime mode values
- **THEN** it imports historical collection only and exposes no realtime client or route

### Requirement: QMT experimental readback is internal and memory-only
The backend SHALL expose QMT latest-snapshot state only through guarded internal experimental diagnostics and SHALL NOT expose a product snapshot endpoint or persist experimental snapshots.

#### Scenario: Authorized diagnostic readback
- **WHEN** an authorized loopback or admin caller reads an allowlisted QMT format code
- **THEN** the backend returns its latest accepted snapshot, epoch, sequence, timestamps, freshness, and counters

#### Scenario: Product snapshot path is requested
- **WHEN** a caller requests a QMT experimental snapshot through a public product route
- **THEN** no such route exists
