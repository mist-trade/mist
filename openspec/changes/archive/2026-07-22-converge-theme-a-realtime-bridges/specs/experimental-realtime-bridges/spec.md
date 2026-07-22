## ADDED Requirements

### Requirement: TDX builtin realtime is always active and QMT is independently gated
The system SHALL mount the TDX builtin bridge without a TDX mode switch, while QMT SHALL activate realtime only when `QMT_REALTIME_MODE=builtin_experimental` and SHALL default to `off`.

#### Scenario: TDX mode environment is absent
- **WHEN** the TDX datasource and Mist backend start
- **THEN** the TDX bridge routes and TDX realtime consumer are active without reading `TDX_REALTIME_MODE`

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
TDX and QMT realtime modules MUST keep snapshots in memory only and MUST NOT write K rows or invoke historical collectors, aggregators, scanners, strategies, signals, alerts, or trading operations.

#### Scenario: Experimental snapshot is accepted
- **WHEN** a valid authorized TDX or QMT snapshot reaches the backend
- **THEN** diagnostic latest-snapshot state changes and all K and business-side-effect probes remain untouched

### Requirement: Theme A completion requires Windows evidence
Theme A MUST remain incomplete until accepted TDX F2 and QMT trading-session evidence identifies exact master SHAs, native runtime versions, bridge script hashes, snapshots, restart and rollback results, and unchanged database content digests.

#### Scenario: Local replay passes without Windows evidence
- **WHEN** all macOS tests pass but either live evidence package is absent
- **THEN** QMT remains default off, TDX remains builtin, and Theme B remains blocked from merge

### Requirement: Experimental activation is reversible and evidence is phased
Windows activation SHALL use a dedicated operator-triggered workflow that
atomically backs up and updates QMT mode and source allowlists. The
evidence workflow SHALL not mutate those modes and SHALL compare every later
phase with a baseline captured before activation.

#### Scenario: Experimental source is enabled
- **WHEN** an operator enables one source with an exact allowlisted symbol
- **THEN** the workflow records a local backup identifier, recreates the affected runtime, and does not disable the other source

#### Scenario: Experimental source is rolled back
- **WHEN** an operator supplies the recorded backup identifier
- **THEN** the exact prior configuration is restored and the default source path becomes healthy before rollback succeeds

#### Scenario: Evidence phases are captured
- **WHEN** Windows HIL is executed
- **THEN** `baseline`, `enabled`, `post_restart`, and `post_rollback` are captured in order and all protected table digests remain identical

#### Scenario: Evidence is collected outside a trading session
- **WHEN** an operator runs identity, mode, route, owner, health, historical API, database digest, baseline, or rollback checks outside the supported exchange session
- **THEN** those control-plane and historical results MAY be retained, but they MUST NOT satisfy fresh native snapshot, sequence progression, or realtime transport acceptance

#### Scenario: Enabled transport evidence is accepted
- **WHEN** `enabled` or `post_restart` evidence is evaluated for TDX or QMT
- **THEN** it MUST be captured during the tested symbol's supported exchange session and include a same-session native snapshot, a strictly increasing sequence, fresh backend readback, and converged monitoring state

### Requirement: Windows restart domains are independently recoverable
Windows automation SHALL expose separate datasource-service and desktop-terminal
restart workflows for TDX and QMT, and QMT terminal recovery SHALL NOT restart a
datasource service as a side effect.

#### Scenario: QMT datasource is restarted
- **WHEN** the QMT datasource restart workflow runs
- **THEN** only the QMT WinSW datasource is restarted and the desktop QMT process is left untouched

#### Scenario: QMT terminal is restarted
- **WHEN** the QMT terminal recovery workflow runs
- **THEN** QMT is stopped and relaunched through an interactive user task, automatic login completes, and a new builtin bridge owner registers without strategy registration, external bridge-process killing, or datasource restart

#### Scenario: QMT executable path is omitted
- **WHEN** QMT is already running and the recovery workflow receives no executable path
- **THEN** it discovers and records the executable path and working directory before stopping the process

#### Scenario: TDX terminal is restarted
- **WHEN** the TDX terminal recovery workflow runs
- **THEN** other content windows are minimized, TDX is relaunched and logged in through the interactive user session, a different bridge owner reaches revision convergence, and the official `:17709` POST succeeds without datasource restart or strategy registration

#### Scenario: Old TDX bridge remains alive after terminal shutdown
- **WHEN** a replacement built-in bridge registers while the previous owner process is still present
- **THEN** datasource lease takeover and fencing retire the stale owner without the recovery workflow killing arbitrary Python processes
