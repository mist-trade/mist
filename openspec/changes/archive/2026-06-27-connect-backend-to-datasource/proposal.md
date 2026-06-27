## Why

The Python datasource now exposes a broad normalized `/v1` surface and the Mist
backend has already moved its core TDX bar and snapshot reads to the normalized
datasource envelope. The remaining work is to record the current backend
integration state, close field-preservation gaps, harden WebSocket protocol edge
cases, and finish deployment checks that prove backend and datasource are using
the same configured service URL.

## What Changes

- Treat the backend TDX HTTP client migration to `/v1/bars/query` and
  `/v1/snapshots/query` as the current baseline, with focused tests guarding the
  request and envelope-mapping behavior.
- Keep the backend boundary provider-neutral: NestJS depends on the Python
  datasource contract, not TongDaXin native HTTP, `tqcenter`, or raw TDX debug
  calls.
- Extend the datasource/backend bar contract so backend-required fields such as
  `ForwardFactor`, `VolInStock`, and dividend adjustment are preserved as
  structured fields instead of being dropped during normalization.
- Harden backend WebSocket handling for datasource `ready`, `subscribed`,
  `unsubscribed`, `bar`, `quote`, `pong`, and `error` messages, then prefer
  normalized `bar` events for minute freshness.
- Add deploy-time configuration and health checks that verify the datasource
  service URL used by backend, the datasource `/health`, and at least one
  normalized API probe.
- Add focused unit, integration, and Windows smoke tests for backend-to-
  datasource connectivity, response mapping, failure envelopes, and startup
  configuration.
- Document the current connection path and the execution order for local
  backend testing, datasource testing, and Windows appliance verification.
- No breaking public Mist HTTP API change is intended; the change is internal
  to how backend fetches and streams TDX datasource data.

## Capabilities

### New Capabilities

- `backend-datasource-integration`: Backend datasource client wiring,
  deployment configuration, and interface verification for the Mist backend
  consuming the Python datasource service.

### Modified Capabilities

None. No archived OpenSpec capabilities exist under `openspec/specs/`; this
change depends on the active `tdx-python-datasource` direction but does not
change the datasource API requirements themselves.

## Impact

- Mist backend TDX client code under `apps/mist/src/sources/tdx`, especially
  `tdx-source.service.ts`, `tdx-websocket.service.ts`, and `types.ts`.
- Backend collection flow through `apps/mist/src/collector/strategies` and
  `CollectorService` save paths where TDX polling or streaming data is
  persisted.
- Shared configuration validation and examples under `libs/config`,
  `.env.example`, and `deploy/windows/backend.env.example`.
- Windows appliance scripts and docs under `deploy/windows`, especially
  `health-check.ps1` and backend/datasource startup guidance.
- Backend tests under `apps/mist/src/sources/tdx`, collector strategy tests, and
  any new datasource contract/interface smoke tests needed to verify the
  backend client against a running datasource service.
