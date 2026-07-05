## Why

QMT collection cannot keep using MiniQMT or `xtquant`: the supported path now
runs inside the full QMT client's built-in Python runtime, which has library,
thread, process, and blocking-behavior constraints that must be verified on the
Windows host before production integration. Mist needs a provider-neutral QMT
bridge that keeps NestJS on normalized datasource contracts while preventing
new product dependencies on XtQuant APIs or account/trading surfaces.

## What Changes

- Add a full-QMT built-in Python bridge plan that requires two Windows spikes
  before enabling the provider: library/network capability and
  process/execution-model capability.
- Add a single-owner QMT bridge model: one controlled QMT strategy script owns
  native QMT API access, performs no threading/process spawning, and processes
  commands serially.
- Add a stdlib-only, QMT-initiated polling protocol between the QMT script and
  the Mist datasource command gateway; WebSocket is optional only after Windows
  spike evidence proves single-thread command-loop execution safe.
- Add a full-QMT local DAT historical-bars fast path for the first supported
  periods (`1d`, `1m`, `5m`), guarded by explicit configuration,
  file-stability checks, and a configurable update window that defaults to
  blocking reads after 18:00 China time.
- Keep the QMT local DAT implementation aligned with the existing TDX
  provider style: route code dispatches to provider operations, operations call
  focused QMT reader/normalizer helpers, and public responses reuse the
  existing normalized `/v1/bars/query` contract.
- **BREAKING**: Remove MiniQMT/`xtquant` as an allowed production integration
  path. Future QMT docs, code, tests, and research references must use full-QMT
  built-in Python documentation and APIs.
- Keep QMT account, position, order, deal, cancel, and placement APIs out of
  this market datasource change; they require a later trading/account design.
- Add static guardrails and runtime smoke expectations for the bridge, spikes,
  unsupported account/trading boundaries, and normalized provider contracts.

## Capabilities

### New Capabilities

- `bigqmt-datasource-bridge`: Full-QMT built-in Python bridge, Windows spike
  evidence, command polling protocol, WebSocket command-loop spike,
  single-owner execution model, local DAT bars fast path, and production
  enablement gates.

### Modified Capabilities

- `datasource-provider-contract`: QMT provider requirements must forbid
  MiniQMT/`xtquant`, require normalized `/v1` responses, and keep account and
  trading APIs out of the market datasource boundary.
- `datasource-runtime-safety`: QMT bridge runtime must honor the built-in
  Python single-thread/process assumptions until Windows evidence proves a
  broader model safe.
- `backend-datasource-integration`: Backend consumers must remain on the
  normalized datasource boundary and must not call QMT built-in APIs, bridge
  internals, raw command endpoints, or account/trading methods directly.

## Impact

- `mist-datasource` QMT adapter/provider code, FastAPI routes, capability
  manifests, WebSocket bridge, command-gateway scaffolding, Windows smoke
  scripts, documentation, fixtures, and repository hygiene tests.
- `mist` backend datasource client and collector tests that enforce normalized
  provider usage.
- `mist-deploy` datasource management and runtime smoke workflows when QMT
  bridge enablement is added after Windows evidence exists.
- Operator workflows for the Windows QMT terminal, especially spike evidence
  capture, single bridge ownership, and disabled-account/trading guarantees.
