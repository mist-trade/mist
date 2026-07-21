## Context

Current `master` already contains the audited `experimental-tdx-realtime-slice`: an opt-in TDX transport using `get_market_snapshot`, strict epoch/sequence fencing, an exact allowlist, an in-memory store, and a deliberate no-K boundary. Older Theme A branches predate the three-module collector split, use incompatible public-health fields, and include a TDX implementation that its own OpenSpec blocks from merge.

The useful QMT work is a native `get_full_tick` collector over the existing full-QMT command gateway, but its branch enables a product WebSocket and K persistence before accepted trading-session evidence. Theme A must converge on one experimental safety model before Theme B can use `master` as a stable baseline.

## Goals / Non-Goals

**Goals:**

- Keep the current TDX builtin transport authoritative and make it the only TDX realtime runtime.
- Add QMT as a separate, default-off experimental transport with equivalent strict framing, allowlist, latest-snapshot diagnostics, and no-K isolation.
- Preserve historical TDX/QMT and schedule module behavior while removing legacy TDX realtime.
- Make monitoring always-on for TDX and mode-aware for QMT without exposing loopback diagnostic state publicly.
- Capture reproducible Windows evidence on exact `master` SHAs before Theme A completion.

**Non-Goals:**

- Realtime candle aggregation or K persistence for either experimental source.
- Public latest-snapshot APIs, strategy/scanner/alert integration, or trading operations.
- Reusing the removed aggregate `CollectorModule` or inheriting QMT behavior from the legacy TDX WebSocket service.
- Installing or validating Theme B MySQL infrastructure in this change.

## Decisions

### Current TDX experimental code is the only TDX merge base

The remote `add-tdx-builtin-realtime-bridge` implementation is not merged. Its useful intent is already represented by the newer gateway, while its old `get_full_tick` TDX call, public health contract, and product-persistence graph are superseded. The builtin gateway is now always mounted; the legacy mode, adapter, routes, collector, and backend graph are removed.

### QMT has an independent experimental mode

Both datasource and backend accept `QMT_REALTIME_MODE=off|builtin_experimental`, defaulting to `off`. The datasource mounts the QMT experimental WebSocket and starts its collector only in the experimental mode. The backend imports `ExperimentalQmtRealtimeModule` independently beside the always-on TDX module, while schedule continues to import historical collection only.

The QMT endpoint is `/ws/qmt-experimental/{clientId}`. `ready` and snapshot frames freeze `payloadType=qmt.experimental.snapshot`, `schemaVersion=0`, `draftRevision=1`, a stream epoch, and a monotonic sequence. Owner replacement or collector restart creates a new epoch; the backend rejects stale, duplicate, out-of-order, unknown-contract, unauthorized, or malformed frames.

### QMT subscriptions are allowlist-owned and fail closed

`QMT_EXPERIMENTAL_ALLOWLIST` is a comma-separated set of at most five exact QMT format codes. Each entry must resolve to exactly one enabled QMT security source. The backend publishes the full desired set after a valid `ready` and again after an epoch change. Empty or unresolved allowlists produce no native subscription.

### Experimental data is memory-only

`ExperimentalQmtRealtimeModule` imports only security identity repositories. It owns an independent client, store, and internal diagnostic controller at `/internal/experimental/qmt/realtime/status` and `/internal/experimental/qmt/realtime/:formatCode`. It does not import K entities, historical collection, aggregators, scanners, signals, or alerts. No public `/v1/market/snapshots/latest` endpoint is added.

### Detailed health stays loopback-local

QMT exposes `/qmt/realtime/health` only to loopback callers. TDX keeps `/tdx/bridge/health`. Windows exporter always probes TDX bridge health and probes QMT only while QMT realtime is enabled; Mac watchdog consumes exporter metrics and never calls experimental routes directly.

### Code may enter master before HIL, activation may not

TDX builtin realtime enters master as the sole TDX path while QMT remains default-off. Windows workflows must name exact repository and bridge-script SHAs. Theme B remains blocked until accepted TDX F2 and QMT trading-session evidence, restart/rollback evidence, and a before/after database content digest prove no K mutation.

### Activation and evidence are separate workflows

An operator-triggered mode workflow owns configuration mutation. It updates the
datasource and Docker environment files atomically, recreates the backend so it
reads the selected allowlists and QMT mode, synchronizes monitoring, and records a machine-local
backup identifier. Rollback restores that exact backup. Environment backups may
contain secrets and are never uploaded as Actions artifacts or printed.

The evidence workflow never selects a mode. It captures four ordered phases:
`baseline` before activation, `enabled` after a fresh native snapshot,
`post_restart` after runtime and terminal-owner recovery, and `post_rollback`
after the default mode is restored. Every phase after baseline compares all
protected table row counts and deterministic content digests with baseline.

### TDX native HIL evidence is bounded and loopback-only

The TDX gateway retains only the latest accepted native request evidence for
each currently desired symbol. A loopback-only experimental route exposes that
bounded evidence without the lease token. Evidence is cleared on owner epoch
change and unsubscribe. This allows Windows HIL to preserve the native
`get_market_snapshot` object while keeping product APIs and persistence out of
Theme A.

### Realtime acceptance is separated from non-session verification

Build identity, bridge artifact hashes, process and owner liveness, loopback
routes, mode status, protected-table digests, historical TDX HTTP/QMT bridge
matrices, `baseline`, and `post_rollback` are valid outside exchange trading
sessions. A long-running bridge health observation outside a session proves
lifecycle stability only.

`enabled` and `post_restart` acceptance require a same-session native snapshot,
strictly increasing sequence, fresh backend diagnostic readback, and converged
monitoring. A connected WebSocket, healthy owner, cached snapshot, or successful
workflow outside the session cannot substitute for that evidence. The execution
ledger and ordered 2026-07-22 checklist are recorded in
`evidence/2026-07-21-session-validation-matrix.md`.

### Datasource and terminal restart domains are independent

Windows exposes four separately triggered recovery checks: TDX datasource,
QMT datasource, TDX terminal, and QMT terminal. QMT terminal recovery does not
restart either datasource service. This keeps its owner/transport recovery
evidence separate from WinSW process recovery evidence. TDX terminal recovery
follows the same boundary: it does not restart the datasource, load an SDK into
the datasource process, or copy, register, start, stop, or delete a terminal
strategy.

TDX terminal recovery records the current experimental bridge owner, minimizes
other visible content windows, stops and relaunches TDX in the logged-in user
session, and runs the existing calibrated login steps. It succeeds only after a
different fresh owner registers, `desiredRevision` and `convergedRevision`
match, and the independent official `:17709` POST probe succeeds. A stale old
bridge is retired through the datasource lease takeover protocol rather than by
killing arbitrary Python processes.

QMT terminal recovery runs in the logged-in operator session through dedicated
interactive scheduled tasks. Before stopping QMT it records the current bridge
owner. It then stops QMT, starts the previously discovered or explicit QMT
executable in the interactive session, relies on QMT automatic login, and waits
for a different builtin bridge owner to register. It never kills a separate
bridge console, copies, registers, or deletes a QMT strategy.

## Risks / Trade-offs

- [QMT native field shape differs by full-QMT release] -> Preserve sanitized raw evidence, reject unknown/malformed frames, and revise the draft contract rather than filling values.
- [Experimental modules accidentally gain product side effects] -> Enforce static dependency scans, DI mode matrices, poison mocks, and database content digests.
- [Monitoring reports false failures] -> Always classify TDX bridge health and suppress QMT realtime metrics while QMT is disabled.
- [Cross-repo releases drift] -> Require exact SHAs in workflows and evidence, and rerun HIL after any functional fix.
- [Old branches contain useful docs mixed with blocked behavior] -> Port evidence and decisions selectively; never merge the branch wholesale.

## Migration Plan

1. Checkpoint Theme B without merging it.
2. Merge always-on TDX cleanup and default-off QMT datasource, backend, deploy, and monitoring changes in dependency order.
3. Run local cross-repo replay and contract checks.
4. Capture a TDX-builtin/QMT-off baseline, update source allowlists or QMT mode through the reversible workflow, then run enabled and restart evidence against exact `master` SHAs.
5. Restore the recorded configuration backup and capture post-rollback evidence.
6. On failure, keep modes disabled, merge the correction, and repeat all affected evidence.
7. On success, sync stable specs and archive Theme A changes.

## Open Questions

None. Realtime productization and K persistence require a separate post-HIL change.
