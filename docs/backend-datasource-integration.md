# Backend Datasource Integration

The Mist backend consumes the Python datasource service through a normalized
contract. Product collection code uses `TdxSource` for HTTP polling and
`TdxWebSocketService` for streaming. It should not call native TDX JSON-RPC,
`tqcenter`, or `/v1/raw/tdx/call`.

## Configuration

`TDX_BASE_URL` points at the Python datasource HTTP base URL, usually
`http://127.0.0.1:9001` on the Windows API machine. `TDX_WS_CLIENT_ID` identifies
the backend WebSocket client when connecting to `/ws/quote/{client_id}`.

## HTTP Path

`TdxSource.fetchK` posts to `/v1/bars/query` with the security symbol, mapped
period, time range, backend-required fields, `dividendType`, and `fillData`.
Normalized bars are mapped into Mist K-line rows. TDX-specific K-line fields
such as `forwardFactor` and `volInStock` are carried in `TdxResponse.extensions`
and persisted through `KExtensionTdx`.

`TdxSource.fetchSnapshot` posts to `/v1/snapshots/query` and maps normalized
snapshot fields into the existing backend snapshot shape.

## Streaming Path

`TdxWebSocketService` connects to `/ws/quote/{client_id}`. On socket open,
datasource `ready`, and reconnect, it sends `sync_subscriptions` with the full
desired symbol set. Normalized `bar` events are preferred; legacy `quote` events
remain a compatibility fallback.

## Verification

Run focused backend tests with Watchman disabled:

```bash
env JEST_HASTE_MAP_FORCE_NODE_FS=1 pnpm exec jest apps/mist/src/sources/tdx/tdx-source.service.spec.ts apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts apps/mist/src/sources/tdx/tdx-raw-endpoint.guard.spec.ts --runInBand --watchman=false
```

On Windows, run the deployment-side hybrid health check from `mist-deploy`:

```powershell
.\scripts\health-check-docker-appliance.ps1
```

That check verifies Docker `mysql`, `mist-backend`, and `chan-api`, then probes
the host datasource and the container-to-host datasource path.
