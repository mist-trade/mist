# Tasks: Refactor TDX Python datasource

Abandoned note (2026-07-04): this change is archived as superseded and
intentionally incomplete. Do not treat the unchecked items below as an active
backlog. Later, narrower work covered the normalized `/v1` provider routes,
WinSW operations, backend datasource consumption, and production baseline
verification. The remaining minute-bar bridge rewrite diverges from the current
accepted shape: normalized `bar` events are supported as the preferred protocol,
while legacy `quote` snapshots remain an accepted fallback. Future real-time
bar promotion should start as a new narrow change, for example
`promote-tdx-bar-events`.

Status note (2026-06-29): the current Windows API deployment baseline is Docker
for MySQL, `mist-backend`, and `chan-api`, plus host WinSW
`mist-tdx-datasource`. This is not yet full live market-data smoke for raw
calls, normalized bars, or WebSocket bar delivery.

## 1. Confirm Integration Boundaries

- [x] 1.1 Confirm whether the migrated TDX datasource default port is `9001` or
      `18709`, and document the chosen migration default.
- [ ] 1.2 Inventory Mist backend calls to `/api/tdx/*` and `/ws/quote/*`.
- [ ] 1.3 Inventory `mist-datasource` TDX routes, adapter methods, tests, and
      Windows deployment scripts that will be touched.
- [ ] 1.4 Inventory current WebSocket protocol handling, connection lifecycle,
      and backpressure behavior in `mist-datasource` and NestJS.

## 2. Add Normalized Contract Layer

- [ ] 2.1 Add Pydantic models for response envelopes, metadata, errors, bars,
      snapshots, WebSocket messages, provider status, and raw-call requests.
- [ ] 2.2 Add symbol normalization helpers for TDX codes and Mist full market
      suffixes.
- [ ] 2.3 Add Beijing-time serialization helpers that output ISO 8601 with
      `+08:00`.
- [ ] 2.4 Add numeric coercion helpers for provider fields that may arrive as
      strings or native numeric values.
- [ ] 2.5 Add unit tests for envelope, error, symbol, time, and numeric
      normalization.

## 3. Add Provider Interface And TDX HTTP Client

- [ ] 3.1 Add the normalized datasource provider interface for bars, snapshots,
      formulas, sectors, subscription sync, recent-bar collection, and health.
- [ ] 3.2 Implement `TdxHttpClient` for POST calls to `TDX_HTTP_URL`.
- [ ] 3.3 Implement TDX provider methods for bars, snapshots, formulas, sectors,
      raw calls, and health using `TdxHttpClient`.
- [ ] 3.4 Add request coalescing or rate limiting for identical in-flight TDX
      HTTP calls.
- [ ] 3.5 Map known TDX, WebSocket, and queue exceptions to stable datasource
      error codes.
- [ ] 3.6 Add provider and HTTP-client unit tests with mocked TDX responses.

## 4. Add WebSocket Bridge Protocol And State

- [ ] 4.1 Extend WebSocket message models for `hello`, `ready`,
      `sync_subscriptions`, `subscribe`, `unsubscribe`, `subscribed`,
      `unsubscribed`, `bar`, `snapshot`, `health`, `pong`, and `error`.
- [ ] 4.2 Add in-memory bridge state for connected NestJS clients, active
      subscriptions, last callback time, last emitted bar keys, and queue depth.
- [ ] 4.3 Add bounded outbound event queue handling and stable backpressure
      error reporting.
- [ ] 4.4 Add subscription reconciliation logic that compares NestJS desired
      symbols against active `tqcenter` registrations.
- [ ] 4.5 Add unit tests for message validation, subscription reconciliation,
      queue overflow behavior, and reconnect resync.

## 5. Add Subscription Client And Minute Collector

- [ ] 5.1 Implement `TdxSubscriptionClient` for `tq.initialize`,
      `subscribe_hq`, `unsubscribe_hq`, callback handling, and serialized SDK
      access.
- [ ] 5.2 Ensure subscription callbacks only mark dirty symbols and return
      quickly.
- [ ] 5.3 Enforce `TDX_MAX_SUBSCRIPTIONS` and return
      `TDX_SUBSCRIBE_LIMIT_EXCEEDED` when exceeded.
- [ ] 5.4 Implement dirty-symbol queue deduplication.
- [ ] 5.5 Implement `TdxMinuteCollector` for boundary collection, retry
      collection, and reconciliation scans.
- [ ] 5.6 Publish normalized `bar` events to the WebSocket bridge and keep
      in-memory duplicate suppression by `symbol`, `period`, `barTime`, and
      `provider`.
- [ ] 5.7 Add tests for callback handling, dirty queue deduplication,
      subscription limits, collector retry, WebSocket event emission, and
      reconnect resync.

## 6. Add `/v1` FastAPI Routes

- [ ] 6.1 Add `GET /providers`.
- [ ] 6.2 Add `POST /v1/bars/query`.
- [ ] 6.3 Add `POST /v1/snapshots/query`.
- [ ] 6.4 Add `POST /v1/formulas/call`.
- [ ] 6.5 Add `POST /v1/sectors/query`.
- [ ] 6.6 Add `POST /v1/raw/tdx/call`.
- [ ] 6.7 Add or extend the TDX WebSocket route for normalized bridge messages.
- [ ] 6.8 Implement WebSocket `sync_subscriptions`, `subscribe`, and
      `unsubscribe` command handling.
- [ ] 6.9 Implement WebSocket `bar`, `snapshot`, `health`, and `error` event
      emission.
- [ ] 6.10 Extend `GET /health` with TDX HTTP, tqcenter, WebSocket connection,
       subscription, collector, and queue fields.
- [ ] 6.11 Add integration tests for successful responses and error envelopes
       for each new HTTP route and WebSocket command.

## 7. Migrate Mist Backend TDX Consumer

- [ ] 7.1 Update `TdxSource.fetchK` to call `/v1/bars/query` and map normalized
      bars into existing `TdxResponse` and `K` persistence flow.
- [ ] 7.2 Update `TdxSource.fetchSnapshot` to call `/v1/snapshots/query`.
- [ ] 7.3 Update TDX types to reflect normalized symbols, timestamps, and
      numeric fields.
- [ ] 7.4 Update configuration validation and examples for the chosen
      datasource base URL.
- [ ] 7.5 Update backend TDX WebSocket handling to send `sync_subscriptions`
      on connect/reconnect and consume normalized `bar` events.
- [ ] 7.6 Persist normalized `bar` events through the existing K-line save path
      and rely on the existing uniqueness boundary for idempotency.
- [ ] 7.7 Remove or disable backend reliance on TDX WebSocket snapshot candle
      aggregation for minute freshness.
- [ ] 7.8 Update collector strategy tests and source service tests for the new
      normalized HTTP and WebSocket contracts.

## 8. Add WinSW Windows Service Path

- [x] 8.1 Add a WinSW XML template for `mist-tdx-datasource`.
- [ ] 8.2 Add remaining status/start/stop convenience scripts for the WinSW
      service; install, uninstall, and smoke-test scripts already exist.
- [ ] 8.3 Add environment template entries for `TDX_HTTP_URL`, `TDX_PATH`,
      `DATASOURCE_HOST`, `DATASOURCE_PORT`,
      `TDX_MINUTE_PERIOD`, collection delays, reconciliation interval, and max
      subscriptions, plus `TDX_WS_QUEUE_MAX_SIZE`.
- [x] 8.4 Ensure deployment packaging references external TDX client and SDK
      paths without bundling proprietary files.
- [x] 8.5 Add migration documentation from legacy NSSM `MistTDX` to WinSW
      `mist-tdx-datasource`.
- [x] 8.6 Update Windows host datasource docs for service name, health URL, logs,
      backend `TDX_BASE_URL`, rollback, and troubleshooting.
- [ ] 8.7 Extend Windows smoke-test coverage beyond health/service checks to raw
      call, normalized bars, WebSocket subscription sync, bar event delivery,
      and restart recovery.

## 9. Verify

- [ ] 9.1 Run `uv run pytest -m "not live"` in `mist-datasource`.
- [ ] 9.2 Run `uv run ruff check .` in `mist-datasource`.
- [ ] 9.3 Run `uv run pyright src tdx qmt` in `mist-datasource`.
- [ ] 9.4 Run targeted Mist backend tests for `apps/mist/src/sources/tdx` and
      collector strategies.
- [ ] 9.5 Run backend lint or the smallest available project-level validation
      command that covers the TDX consumer changes.
- [ ] 9.6 Run Windows live smoke verification against a logged-in TongDaXin
      terminal.
