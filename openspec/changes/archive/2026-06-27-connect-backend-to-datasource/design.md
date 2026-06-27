## Context

The current Mist backend already has a TDX client boundary and the core HTTP
path now uses the normalized Python datasource `/v1` envelope for bars and
snapshots.

Current HTTP path:

```text
CollectorService
  -> TdxSource.fetchK()
      -> TDX_BASE_URL
      -> POST /v1/bars/query
      -> datasource envelope data.bars[]
      -> TdxResponse[]
      -> TdxSource.saveK()
      -> MySQL K + KExtensionTdx

TdxSource.fetchSnapshot()
  -> POST /v1/snapshots/query
  -> datasource envelope data.snapshots[]
```

Current WebSocket path:

```text
TdxWebSocketService
  -> TDX_BASE_URL converted to ws:// or wss://
  -> /ws/quote/{TDX_WS_CLIENT_ID}
  -> sends { type: "sync_subscriptions", stocks: [...] } on socket open
  -> handles normalized { type: "bar" } events
  -> keeps { type: "quote" } through KCandleAggregator as compatibility fallback
  -> WebSocketCollectionStrategy saves normalized bars or completed candles
```

The Python datasource now exposes normalized endpoints such as
`POST /v1/bars/query`, `POST /v1/snapshots/query`, `GET /providers`, and
`GET /health`, plus normalized reference, finance/report, formula, security,
calendar, price-volume, sector, and instrument endpoint families. Its WebSocket
route is still `/ws/quote/{client_id}`, but it now sends `ready`, accepts
`sync_subscriptions`, and can broadcast normalized `bar` events while retaining
legacy `quote` compatibility.

The current remaining gap is field preservation. Datasource `TdxBarQueryRequest`
has `provider`, `symbols`, `period`, `startTime`, `endTime`, `count`, and
`includeRaw`, but does not yet expose `fields`, `dividendType`, or `fillData`.
The datasource TDX provider still calls `get_market_data` with a fixed
`Open/High/Low/Close/Volume/Amount` field list, so `ForwardFactor`,
`VolInStock`, and dividend-adjustment semantics are not yet preserved through
`/v1/bars/query`.

This change should live under `mist/openspec/changes/connect-backend-to-datasource`
because the OpenSpec state for backend work is inside the `mist` project, not
the repository-root `openspec/` directory.

## Goals / Non-Goals

**Goals:**

- Preserve and verify the backend TDX HTTP client consumption of the Python
  datasource normalized `/v1` envelope for bars and snapshots.
- Keep `TDX_BASE_URL` as the single backend configuration knob for the
  datasource HTTP base URL, with `TDX_WS_CLIENT_ID` identifying the backend
  WebSocket client.
- Extend the bar contract and backend mapping so backend-required TDX market-data
  fields are preserved instead of silently dropped.
- Make WebSocket connect, ready, and reconnect paths send a full
  `sync_subscriptions` command before relying on real-time events.
- Prefer normalized `bar` events for minute freshness and keep `quote` snapshot
  handling only as a compatibility fallback while the datasource migration is
  in progress.
- Add focused tests that prove request shape, response mapping, error envelope
  handling, WebSocket command flow, and deployment health checks.
- Update Windows deployment checks so they verify the same datasource URL the
  backend is configured to use.

**Non-Goals:**

- Implementing additional datasource `/v1` endpoint families beyond the
  provider-neutral surface already exposed by `mist-datasource`.
- Replacing backend MySQL persistence or the existing `K`/`KExtensionTdx`
  entity model.
- Making NestJS call TongDaXin native HTTP JSON-RPC, `tqcenter`, or
  `/v1/raw/tdx/call` for product collection.
- Finishing the entire datasource WinSW migration; this change only wires the
  backend and verifies deployment compatibility.
- Implementing QMT backend consumption beyond keeping request/provider types
  compatible with the provider-neutral datasource boundary.

## Decisions

### Keep `/v1` POST endpoints as the backend product-read boundary

`TdxSource.fetchK` now calls `POST /v1/bars/query`, and
`TdxSource.fetchSnapshot` now calls `POST /v1/snapshots/query`. The remaining
migration risk is no longer the endpoint path itself; it is whether the
normalized datasource contract preserves the backend-required market-data
semantics previously available through legacy `/api/tdx/*` routes.

The next contract gate is bars field parity. The datasource contract should
preserve the meaning of stock list, requested field list, period, start/end
filters, count, fill behavior, and dividend adjustment behavior where those
parameters are product requirements. If `/v1/bars/query` does not expose an
equivalent parameter, the datasource contract should be extended before backend
field-persistence changes instead of silently dropping the behavior.

Snapshot symbol and field-list semantics are already represented by
`/v1/snapshots/query` via `symbols` and `fields`.

The backend should parse the datasource envelope:

```json
{
  "ok": true,
  "requestId": "req-...",
  "provider": "tdx",
  "data": {
    "bars": [
      {
        "symbol": "600519.SH",
        "period": "1m",
        "barTime": "2026-04-06T09:31:00+08:00",
        "open": 1.0,
        "high": 2.0,
        "low": 0.5,
        "close": 1.5,
        "volume": 1000,
        "amount": 1500,
        "provider": "tdx",
        "receivedAt": "2026-04-06T09:31:02+08:00"
      }
    ]
  },
  "meta": { "transport": "http", "asOf": "2026-04-06T09:31:03+08:00" },
  "error": null
}
```

Alternative considered: keep legacy `/api/tdx/market-data` for fields missing
from `/v1`. That would re-couple the backend to provider-shaped field maps. The
better path is to keep product reads on `/v1`, make `/v1` parameter-compatible
for backend product needs, and retire legacy helpers as normalized replacements
become available.

The datasource history shows why this gate matters. The `/v1` gateway was
introduced in a single change and then corrected by follow-up fixes for real TDX
HTTP details, including dotted TDX HTTP symbols and `Value` wrapper parsing.
That means the backend should treat `/v1` as the intended boundary, but still
verify field and parameter parity before declaring the integration complete.

### Introduce typed envelope parsing inside the TDX client boundary

Envelope and normalized payload types should live beside the existing TDX
client types under `apps/mist/src/sources/tdx`. The parsing should be private
to `TdxSource` or a small local helper, so collector code still receives the
existing `TdxResponse[]` and `TdxSnapshot` shapes.

Alternative considered: expose datasource envelope types through collector
interfaces. That would push transport details past the source boundary and
increase churn in code that only needs K-line data.

### Preserve existing persistence behavior

`TdxSource.saveK` should continue to persist stable OHLCV data into `K` and
structured TDX-specific fields into `KExtensionTdx` through the existing
transaction. Normalized bars do not currently guarantee dividend-factor fields,
so `forwardFactor` remains optional and must not block collection when absent.

For preserving as many provider fields as possible, avoid bloating the `K` base
table and avoid storing opaque raw JSON payloads in the product persistence
path. The preferred shape is:

```text
K: stable provider-neutral time series fields
KExtensionTdx: structured TDX K-line fields that the application understands
domain tables: structured non-K-line fields such as dividend factors,
               finance/report, security info, and other reference data
```

Only fields with clear meaning should be persisted. If the datasource returns
provider fields that do not yet have an owning entity/table, this change should
either add the appropriate structured column/table or leave the field
unpersisted until a domain model exists. It should not persist the entire raw
provider payload as a shortcut.

Alternative considered: add a new persistence path for normalized bars. The
current source-fetcher interface is already sufficient, and new persistence
would duplicate idempotency logic.

### Treat WebSocket `bar` as primary and `quote` as compatibility

On open or after a datasource `ready` message, the backend should send
`sync_subscriptions` with all locally tracked symbols. Subsequent
`subscribe`/`unsubscribe` calls update local desired state and send commands
only when the socket is open.

Incoming normalized `bar` messages should be converted into `TdxRealtimeBar`
events and persisted by `WebSocketCollectionStrategy` through the current
`CollectorService.saveRawKData` path. Incoming `quote` messages can still flow
through `KCandleAggregator` as a fallback, because the datasource currently
broadcasts both `bar` and legacy `quote` for compatibility.

Alternative considered: remove the aggregator immediately. Keeping it during
the transition gives rollback safety while tests prove normalized bars are
persisted correctly.

### Make deployment checks follow backend configuration

`deploy/windows/health-check.ps1` should read `TDX_BASE_URL` from
`deploy/windows/backend/.env` or `backend.env.example` defaults and test that
URL rather than hardcoding only `http://127.0.0.1:9001`. The check should probe:

- datasource `/health`
- datasource `/providers`
- a normalized API request that can run against the configured environment
- backend `/app/hello`
- a backend endpoint that exercises database connectivity

Alternative considered: keep datasource smoke verification in the datasource
repo only. That misses the exact failure mode this change targets: backend and
datasource can each start, but the configured connection between them is wrong.

### Split verification into unit, local integration, and Windows smoke

Unit tests should mock Axios and WebSocket to prove request and message shapes.
Local integration tests should run backend client code against a fake or mock
datasource process without needing a real TDX terminal. Windows smoke tests
should run after the real datasource service is started and TDX is logged in.

Alternative considered: rely only on live Windows smoke tests. Live tests are
necessary but slow and environment-sensitive; the contract should fail quickly
on macOS or CI when mapping code regresses.

## Risks / Trade-offs

- Normalized bars do not include every legacy field, especially dividend/factor
  fields -> keep `forwardFactor` optional and switch `fetchDividFactors` to the
  normalized dividend-factors endpoint before retiring the legacy helper.
- Datasource still uses `/ws/quote/{client_id}` for the normalized bridge ->
  keep the URL path stable for now, but make the backend message handling
  protocol-aware.
- Both `bar` and `quote` can represent the same market movement -> suppress
  duplicate persistence at the existing `K` uniqueness boundary and prefer
  direct `bar` callbacks for new minute freshness.
- The backend can connect before datasource provider initialization completes
  -> parse `/health` and WebSocket `error` messages into retryable failures,
  then rely on reconnect and `sync_subscriptions`.
- Windows operators can configure a different datasource port -> health checks
  must resolve the configured URL from env rather than assume `9001`.

## Migration Plan

1. Record the current baseline: backend HTTP bars/snapshots already use `/v1`,
   backend WebSocket already sends `sync_subscriptions` on socket open, and the
   raw TDX debug endpoint is guarded out of production source code.
2. Close the bars field-preservation gap in the datasource contract before
   expanding backend persistence: add/confirm `fields`, `dividendType`,
   `fillData`, and structured extension fields.
3. Decide the owning structured storage for each non-normalized field:
   `KExtensionTdx` for TDX K-line extensions and separate domain tables for
   non-K-line reference, finance/report, security, or corporate-action data.
4. Update backend TDX types and `TdxSource.fetchK` mapping to consume structured
   extension fields returned by `/v1/bars/query`.
5. Update `TdxSource.saveK` so it writes every available structured TDX
   extension field instead of defaulting unknown fields to zero.
6. Retire or normalize legacy `fetchDividFactors` by switching it to
   `/v1/reference/dividend-factors/query` or documenting why the legacy route
   remains.
7. Harden WebSocket edge cases that are not yet fully covered: `ready`,
   reconnect resync, `subscribed`, `unsubscribed`, datasource `error`, and
   optional structured extension fields on normalized `bar` events.
8. Update `deploy/windows/health-check.ps1` and its script tests so datasource
   probes use the backend-configured `TDX_BASE_URL` instead of a hardcoded URL.
9. Run targeted backend tests, datasource non-live tests, and
   `openspec validate connect-backend-to-datasource --strict`.
10. On Windows, start MySQL, backend, datasource, and logged-in TDX, then run the
    appliance health check plus a normalized API probe and record the output.

Rollback strategy: keep the legacy datasource routes available and keep
`TDX_BASE_URL` configurable. If extended field preservation fails in production,
point backend at the last verified datasource instance, disable or revert only
the new field-persistence changes, and keep the guarded `/v1` product boundary
intact unless a separate rollback review approves otherwise.

## Open Questions

- Should backend keep the existing `/ws/quote/{client_id}` path name until the
  datasource introduces a dedicated `/v1/ws/tdx/{client_id}` route?
- Which structured table should own each non-normalized datasource field that is
  not a TDX K-line extension?
- Should `fetchDividFactors` move directly to
  `/v1/reference/dividend-factors/query`, or should that be left to a separate
  corporate-action persistence change?
- Should Windows health checks make the normalized bars probe optional when TDX
  is not logged in, or should that failure be treated as a hard deployment
  failure for this appliance?
