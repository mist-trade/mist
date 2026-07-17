## Why

Theme A is split across newer experimental TDX code already on `master` and older QMT/TDX branches that depend on the removed aggregate collector graph, incompatible health fields, and an explicitly blocked TDX native call. A single convergence change is required before Theme B can be based on a coherent and verifiable realtime contract.

## What Changes

- Treat `experimental-tdx-realtime-slice` as the authoritative TDX implementation and do not merge the superseded `add-tdx-builtin-realtime-bridge` code.
- Add an independently gated QMT builtin experimental transport with strict snapshot validation, epoch/sequence fencing, an exact allowlist, in-memory latest-snapshot diagnostics, and no K persistence.
- Keep both experimental transports disabled by default and prohibit K, scanner, signal, alert, or trading side effects.
- Update Windows deployment smoke and monitoring to consume loopback experimental health without changing legacy health behavior or producing alerts while a mode is disabled.
- Require accepted Windows TDX F2 and QMT trading-session evidence on exact `master` SHAs before Theme A is complete or Theme B may be merged.
- Transfer the remaining realtime ownership from the historical BigQMT change and preserve its completed history evidence without importing contradictory product-persistence requirements.

## Capabilities

### New Capabilities

- `experimental-realtime-bridges`: Mode gating, wire fencing, no-K isolation, diagnostics, and Windows evidence requirements shared by the TDX and QMT experimental transports.

### Modified Capabilities

- `backend-datasource-integration`: Add a separately gated QMT experimental WebSocket consumer and explicitly exclude public snapshot and K persistence behavior.
- `datasource-provider-contract`: Define QMT builtin experimental snapshot transport without changing QMT historical or TDX legacy contracts.
- `datasource-runtime-safety`: Require mode-isolated startup, loopback diagnostics, strict frames, bounded ownership, and no database side effects.
- `monitoring-health-alerts`: Monitor experimental readiness only when the matching source mode is enabled and preserve legacy health semantics.

## Impact

- `mist-datasource`: QMT runtime mode, collector, experimental WebSocket/health routes, and strict tests.
- `mist`: QMT experimental module, allowlist resolver, client/store/diagnostics, module matrix, and no-K guardrails.
- `mist-deploy`: source-specific experimental transport smoke and Windows evidence capture.
- `mist-monitoring`: mode-aware loopback health parsing, metrics, and alerts.
- `mist` OpenSpec: Theme A ownership, stable capability deltas, Windows HIL evidence, and closure gates that block Theme B.
