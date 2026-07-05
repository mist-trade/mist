## Why

QMT access is moving to the full QMT client's built-in Python runtime. The old
adapter-backed QMT surface is misleading now: it makes QMT look like another
TDX provider inside the TDX service, while the real production path is a
separate Windows QMT client with its own runtime and native data shape.

This change updates the design to the current decision:

- TDX service `:9001` is TDX-only.
- QMT service `:9002` is QMT-native.
- QMT historical bars return `marketData`, not the TDX bar row model.
- The full-QMT bridge uses stdlib HTTP polling only.

## What Changes

- Remove legacy QMT service surfaces: old QMT route groups, adapter-backed QMT
  realtime quote route, QMT mock adapter, and bridge realtime-duplex spike
  endpoints.
- Remove QMT from the TDX service: no `provider` request field, no
  `a QMT provider selector` branch, no QMT provider state, and no QMT capability manifest
  from TDX `/providers`.
- Add QMT native `POST :9002/v1/bars/query` for historical local DAT bars.
- Use official full-QMT `get_market_data_ex`-style request parameters:
  `fields`, `stock_list`, `period`, `start_time`, `end_time`, `count`,
  `dividend_type`, and `fill_data`; HTTP API does not expose `subscribe` and
  history semantics are fixed to `subscribe=False`.
- Return QMT native column-oriented `data.marketData` with source metadata
  instead of normalized TDX rows.
- Keep only HTTP polling bridge endpoints:
  `/qmt/bridge/owner`, `/qmt/bridge/poll`, `/qmt/bridge/result`, and
  `/qmt/bridge/health`.
- Add an independent Windows WinSW/deploy workflow for the QMT datasource
  service on `:9002`; it manages only the service process and leaves full-QMT
  strategy script load/register/delete as manual QMT client actions.
- Keep account, position, order, deal, cancel, and placement APIs out of this
  market datasource.

## Capabilities

### New Capabilities

- `bigqmt-datasource-bridge`: QMT native service boundary, QMT local DAT bars,
  stdlib HTTP polling bridge, single-owner command gateway, and Windows
  evidence requirements.

### Modified Capabilities

- `datasource-provider-contract`: TDX and QMT are separate datasource services;
  QMT native shapes are not forced into the TDX normalized bar schema.
- `datasource-runtime-safety`: QMT production bridge forbids realtime-duplex
  transport,
  threads, subprocesses, separate worker processes, and unverified third-party
  dependencies.
- `backend-datasource-integration`: backend callers use TDX `:9001` for TDX
  and QMT `:9002` for QMT; cross-provider shape unification belongs above the
  datasource layer.

## Impact

- `mist-datasource` QMT app routes, QMT local DAT reader/provider, command
  gateway tests, QMT built-in bridge scripts, TDX v1 schemas/routes, adapter
  factory cleanup, documentation, and guardrail tests.
- Mist backend callers that previously expected TDX `a QMT provider selector` must use
  the QMT service `:9002/v1/bars/query`.
