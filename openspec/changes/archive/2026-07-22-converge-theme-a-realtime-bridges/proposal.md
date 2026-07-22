## Why

Theme A is split across newer experimental TDX code already on `master` and older QMT/TDX branches that depend on the removed aggregate collector graph, incompatible health fields, and an explicitly blocked TDX native call. A single convergence change is required before Theme B can be based on a coherent and verifiable realtime contract.

## What Changes

- Treat `experimental-tdx-realtime-slice` as the authoritative TDX implementation and do not merge the superseded `add-tdx-builtin-realtime-bridge` code.
- Add an independently gated QMT builtin experimental transport with strict snapshot validation, epoch/sequence fencing, an exact allowlist, in-memory latest-snapshot diagnostics, and no K persistence.
- Make TDX builtin realtime the only TDX runtime path, remove `TDX_REALTIME_MODE`, the process-local SDK adapter, legacy REST/WebSocket routes, and the backend legacy graph.
- Keep QMT independently default-off and prohibit K, scanner, signal, alert, or trading side effects in both realtime consumers.
- Update Windows deployment smoke and monitoring to always consume TDX loopback bridge health while remaining mode-aware for QMT.
- Require accepted Windows TDX F2 and QMT trading-session evidence on exact `master` SHAs before Theme A is complete or Theme B may be merged.
- Keep reversible QMT activation and allowlist backup while treating TDX as always mounted; preserve the four-phase evidence sequence.
- Transfer the remaining realtime ownership from the historical BigQMT change and preserve its completed history evidence without importing contradictory product-persistence requirements.

## Capabilities

### New Capabilities

- `experimental-realtime-bridges`: Mode gating, wire fencing, no-K isolation, diagnostics, and Windows evidence requirements shared by the TDX and QMT experimental transports.

### Modified Capabilities

- `backend-datasource-integration`: Add a separately gated QMT experimental WebSocket consumer and explicitly exclude public snapshot and K persistence behavior.
- `datasource-provider-contract`: Define QMT builtin experimental snapshot transport without changing QMT historical or TDX `/v1` contracts.
- `datasource-runtime-safety`: Require always-on TDX builtin startup, QMT mode isolation, loopback diagnostics, strict frames, bounded ownership, and no database side effects.
- `monitoring-health-alerts`: Always monitor TDX bridge readiness and monitor QMT only when its mode is enabled.

## Impact

- `mist-datasource`: QMT runtime mode, collector, experimental WebSocket/health routes, bounded TDX native evidence readback, and strict tests.
- `mist`: QMT experimental module, allowlist resolver, client/store/diagnostics, module matrix, and no-K guardrails.
- `mist-deploy`: TDX mode removal, reversible QMT/allowlist switching, source-specific transport smoke, and four-phase Windows evidence capture.
- `mist-monitoring`: always-on TDX and mode-aware QMT loopback health parsing, metrics, and alerts.
- `mist` OpenSpec: Theme A ownership, stable capability deltas, Windows HIL evidence, and closure gates that block Theme B.
