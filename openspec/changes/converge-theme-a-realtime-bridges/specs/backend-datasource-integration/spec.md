## ADDED Requirements

### Requirement: QMT experimental consumer is independent
The backend SHALL implement QMT experimental realtime through a dedicated module, client, allowlist, store, and diagnostic controller that do not inherit from or instantiate the legacy TDX realtime graph.

#### Scenario: QMT experimental is enabled beside TDX
- **WHEN** the Mist app starts with `QMT_REALTIME_MODE=builtin_experimental`
- **THEN** historical collection and the independent TDX and QMT realtime consumers are all available

#### Scenario: Schedule app starts
- **WHEN** the schedule app starts
- **THEN** it imports historical collection only and exposes no realtime client or route

### Requirement: TDX desired subscriptions use the realtime WebSocket
The backend TDX leader SHALL send the complete desired subscription set over its datasource realtime WebSocket and SHALL NOT call a loopback-only HTTP desired-state route from Docker.

#### Scenario: TDX ready frame is accepted
- **WHEN** the backend accepts a valid TDX ready frame
- **THEN** it sends one `sync_subscriptions` WebSocket message containing the complete resolved allowlist

### Requirement: QMT experimental readback is internal and memory-only
The backend SHALL expose QMT latest-snapshot state only through guarded internal experimental diagnostics and SHALL NOT expose a product snapshot endpoint or persist experimental snapshots.

#### Scenario: Authorized diagnostic readback
- **WHEN** an authorized loopback or admin caller reads an allowlisted QMT format code
- **THEN** the backend returns its latest accepted snapshot, epoch, sequence, timestamps, freshness, and counters

#### Scenario: Product snapshot path is requested
- **WHEN** a caller requests a QMT experimental snapshot through a public product route
- **THEN** no such route exists
