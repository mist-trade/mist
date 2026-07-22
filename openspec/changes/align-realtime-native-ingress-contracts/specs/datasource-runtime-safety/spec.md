## ADDED Requirements

### Requirement: QMT owner results are generation fenced
QMT bridge poll and result operations MUST bind commands to the current owner generation or lease, owner replacement MUST create a new stream epoch, and results from a retired owner or previous epoch MUST be rejected before publication.

#### Scenario: Owner changes with a command in flight
- **WHEN** a QMT owner is replaced before an earlier `get_full_tick` command returns
- **THEN** the old result is rejected and no frame is published in the new epoch

#### Scenario: QMT bridge registers
- **WHEN** the builtin bridge becomes the current owner
- **THEN** loopback health and evidence identify its owner, generation, build identity and artifact digest without exposing a lease secret

### Requirement: Realtime boundary rejects unsafe native objects
Datasource HTTP and WebSocket boundaries SHALL reject native objects that cannot be represented as bounded JSON or violate configured size, depth, field, or sensitive-data guards.

#### Scenario: Native payload exceeds a boundary
- **WHEN** a provider returns an oversized, over-deep, unserializable, or forbidden native object
- **THEN** the datasource records a stable validation error and does not publish a partial frame

### Requirement: QMT builtin bridge remains Python 3.6 compatible
All QMT builtin production scripts changed by formal realtime work MUST parse and run under the embedded Python 3.6 runtime without third-party dependencies, threads, subprocesses or local listeners.

#### Scenario: Compatibility guard runs
- **WHEN** QMT bridge validation executes in CI and Windows HIL
- **THEN** forbidden newer syntax and dependencies are rejected before deployment
