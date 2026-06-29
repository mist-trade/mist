# Design: Refactor TDX Python datasource

## Context

`mist-datasource` is already a FastAPI bridge for Windows-only market data SDKs.
The current TDX instance exposes provider-shaped routes under `/api/tdx/*` and a
WebSocket stream under `/ws/quote/{client_id}`. The Mist backend then parses
these provider responses in `apps/mist/src/sources/tdx` and aggregates WebSocket
snapshots into candles in NestJS.

The target design changes that boundary. Python becomes the only TDX provider
boundary consumed by NestJS. TongDaXin native HTTP JSON-RPC
`http://127.0.0.1:17709/` and `tqcenter.subscribe_hq` remain internal provider
details. Subscription callbacks are treated as update notices, not full data
payloads. Minute-bar freshness is produced by Python through a dirty-symbol
queue and scheduled collection, then delivered to NestJS as normalized
WebSocket events. NestJS remains the durable owner of subscription intent,
K-line persistence, recent-bar reads, and product-facing query state.

Existing deployment docs and OpenSpec changes still refer to `MistTDX`, port
`9001`, and NSSM. This change introduces a new WinSW-managed service path for
the TDX datasource and must explicitly migrate those assumptions.

## Goals / Non-Goals

**Goals:**

- Add a stable `/v1` Python datasource API for TDX historical bars, snapshots,
  formulas, sectors, health, and raw debug calls.
- Add a normalized duplex WebSocket protocol for subscription sync, subscribe,
  unsubscribe, health, snapshot, and bar events between NestJS and Python.
- Normalize all TDX responses into provider-independent Pydantic models before
  data reaches NestJS.
- Keep general TDX function calls behind a `TdxHttpClient` that talks to the
  local TDX JSON-RPC endpoint.
- Keep `tqcenter` subscription handling inside Python and use callbacks only to
  mark symbols dirty.
- Keep only volatile bridge state in Python; after reconnect or restart,
  NestJS replays the desired subscription set over WebSocket.
- Update Mist backend TDX code to consume normalized HTTP endpoints for
  historical/manual reads and normalized WebSocket bar events for real-time
  minute freshness.
- Add a WinSW deployment path for the new TDX datasource service.

**Non-Goals:**

- Rebuilding TDX GUI login automation. That remains a private operations guard
  concern.
- Bundling proprietary TDX client files, `TPythClient.dll`, or `tqcenter.py`.
- Implementing the QMT provider in this change. The interface must allow it
  later, but the first implementation is TDX.
- Making Python a durable data store for TDX bars or subscription intent.
- Rewriting unrelated East Money, indicator, Chan Theory, or Saya behavior.

## Decisions

### Add `/v1` HTTP contracts and normalized WebSocket events beside legacy routes

The existing `tdx/routes/*` endpoints should remain available while the new
contract is introduced. New synchronous product reads use `/v1/*`; new
real-time behavior uses the normalized WebSocket protocol. Legacy `/api/tdx/*`
and `/ws/quote/*` are compatibility surfaces until the backend migration is
complete.

Alternative considered: rewrite existing routes in place. That would shorten
the code path but makes rollback harder and breaks the current backend before
the new contract is proven.

### Introduce a provider interface instead of expanding `MarketDataAdapter`

Create a smaller datasource provider interface for normalized service use:

```text
get_bars(symbols, period, start_time, end_time, count)
get_snapshots(symbols, fields)
call_formula(name, args, context)
get_sector_members(sector)
sync_subscriptions(symbols)
subscribe(symbols)
unsubscribe(symbols)
collect_recent_bars(symbols, period, count)
health()
```

The current `MarketDataAdapter` can keep supporting legacy routes. The new
provider interface becomes the stable boundary for TDX now and QMT later.

Alternative considered: make the existing adapter base class the universal
contract. The current adapter shape is SDK-oriented and uneven across TDX/QMT,
so using it as the NestJS contract would keep provider details leaking upward.

### Split TDX internals into HTTP client, subscription client, collector, and event bridge

TDX implementation should have four internal components:

- `TdxHttpClient` posts JSON-RPC calls to `TDX_HTTP_URL`, defaulting to
  `http://127.0.0.1:17709/`.
- `TdxSubscriptionClient` owns `tq.initialize`, `subscribe_hq`,
  `unsubscribe_hq`, callback registration, and subscription limits.
- `TdxMinuteCollector` reads dirty symbols, fetches recent bars through
  `TdxHttpClient`, normalizes them, and emits bar events.
- `TdxWsBridge` owns client connection lifecycle, subscription sync commands,
  outbound event queues, and backpressure reporting.

This keeps blocking or thread-sensitive SDK behavior out of request handlers.
Calls into `tqcenter` should be serialized unless Windows live tests prove a
broader concurrency model is safe.

### Normalize with Pydantic models and one response envelope

All `/v1` endpoints return:

```json
{
  "ok": true,
  "requestId": "req_...",
  "provider": "tdx",
  "data": {},
  "meta": {
    "sourceLatencyMs": 32,
    "transport": "http",
    "asOf": "2026-06-26T10:00:03+08:00"
  },
  "error": null
}
```

Symbols use full market suffixes such as `688318.SH`, timestamps use ISO 8601
with `+08:00`, and numeric fields are numbers. Provider-native payloads are
only returned by `/v1/raw/tdx/call` or when an endpoint explicitly requests
`includeRaw`. WebSocket messages use the same normalized data models inside an
event envelope with `type`, `requestId` or `eventId`, `provider`, `data`,
`meta`, and `error`.

### Keep durability in NestJS and MySQL

Do not add a Python-owned durable database for TDX bars or subscription state in
the first implementation. Python may keep in-memory maps for active
subscriptions, last callback time, last emitted bar key, in-flight requests, and
queue depth, but those maps are operational state only.

NestJS owns durable subscription intent and persists normalized bar events to
the existing MySQL `K` entity. The current `K` unique key on
`securityId + source + period + timestamp` provides the idempotency boundary
when reconnects or retries produce duplicate events.

On Python process restart, WebSocket reconnect, or NestJS reconnect, NestJS
sends a full `sync_subscriptions` command. Python reconciles that desired set
against the active `tqcenter` registrations and starts collecting from the
current state.

### Make minute collection callback-driven but boundary-timed

`subscribe_hq` callbacks should only parse the symbol and mark it dirty. The
collector runs at minute boundary + 2 seconds, retries missing/stale symbols at
+8 seconds, and performs reconciliation every 30-60 seconds for subscribed
symbols. Each fetch should request the recent 2-3 bars and upsert by
`symbol + period + barTime + provider` before publishing each new normalized bar
event. NestJS persists each event idempotently and can request historical bars
through `/v1/bars/query` to fill gaps.

This avoids relying on `refresh_kline` for live minute bars, because TDX minute
historical refresh can lag during market hours.

### Move the new service path to WinSW

Use a WinSW service named `mist-tdx-datasource` for the new TDX datasource.
WinSW owns lifecycle, restart policy, and log rolling. Python owns health,
provider status, and collection behavior.

The current Windows API machine defaults can keep port `9001` for compatibility during
migration, but the new service must support explicit `DATASOURCE_HOST` and
`DATASOURCE_PORT` configuration. If ops wants the design-doc default `18709`,
that should be set through environment and the backend `TDX_BASE_URL`.

Alternative considered: keep NSSM. Existing scripts already use NSSM, but the
target design calls for WinSW and the service runner logic becomes simpler when
restart policy lives in the wrapper.

## Resolved Deployment Decisions

- Keep `9001` as the Windows API machine default for the TDX
  datasource. The service remains configurable through `DATASOURCE_HOST`,
  `DATASOURCE_PORT`, and backend `TDX_BASE_URL`; `18709` is not the deployment
  default.
- Keep `mist-tdx-datasource` as the WinSW host service. `MistBackend` now runs
  in Docker as `mist-backend`; do not reinstall it as a Windows service.
- Automated Docker deployment checks datasource health but does not change TDX
  strategy subscriptions. Manual smoke can run later through the datasource
  runtime smoke wrapper on the Windows API machine.

## Risks / Trade-offs

- TDX client or TQ authorization is not running -> `/health` reports
  `tdxHttpReachable=false` or `tqInitialized=false`; WinSW restarts only the
  Python service, while desktop login recovery remains outside this change.
- `subscribe_hq` supports at most 100 symbols -> subscription endpoint rejects
  excess symbols with `TDX_SUBSCRIBE_LIMIT_EXCEEDED`; later work can add
  priority or rotation.
- Callback payloads do not contain full bars -> callbacks only mark dirty
  symbols and collector fetches bars separately.
- WebSocket disconnects can interrupt event delivery -> NestJS resends
  `sync_subscriptions` after reconnect and can reconcile recent bars through
  `/v1/bars/query`.
- Duplicate events can be produced by retries or reconnect catch-up -> NestJS
  persists through the existing `K` idempotency key.
- Outbound event bursts can exceed the NestJS consumer rate -> use a bounded
  queue, expose queue depth in health, and return stable backpressure errors
  instead of letting memory grow unbounded.
- New `/v1` contract can diverge from current NestJS parsers -> write contract
  tests on both Python response models and NestJS adapter mapping.
- WinSW migration conflicts with existing NSSM docs and guard scripts -> keep
  deployment docs and private guard configuration tied to service names and
  health URLs rather than NSSM-specific commands.

## Migration Plan

1. Add `/v1` contract models, envelope helpers, error mapper, and tests in
   `mist-datasource`.
2. Add `TdxHttpClient`, normalized bars/snapshots/sectors/formula endpoints,
   `/v1/raw/tdx/call`, and enriched `/health`.
3. Add WebSocket message models, `TdxSubscriptionClient`, dirty queue,
   `TdxMinuteCollector`, bounded outbound event queue, and subscription sync.
4. Add WinSW XML template plus install, uninstall, status, and smoke-test
   scripts for `mist-tdx-datasource`.
5. Update Mist backend `TdxSource` and related tests to consume `/v1` endpoints
   for historical/manual reads.
6. Update the backend TDX WebSocket consumer to send `sync_subscriptions`,
   ingest normalized bar events, and persist them idempotently instead of
   aggregating raw snapshots in NestJS.
7. Update Windows Docker/host datasource docs and service expectations from
   `MistTDX`/NSSM to the `mist-tdx-datasource` WinSW service.

Rollback strategy: keep the legacy datasource routes available until the backend
adapter is switched and verified. If the new service fails, point `TDX_BASE_URL`
back to the old TDX datasource instance and stop the WinSW service.

## Open Questions

- Which exact TDX JSON-RPC method names should back normalized bars and
  snapshots in the first implementation?
- Should the first normalized WebSocket route reuse `/ws/quote/{client_id}` for
  compatibility, or introduce `/v1/ws/tdx/{client_id}` while keeping the old
  route as a shim?
- Should Python support only one authoritative NestJS WebSocket client at a
  time, or allow multiple clients with one leader for subscription commands?
