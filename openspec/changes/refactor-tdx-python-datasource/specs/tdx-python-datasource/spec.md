# Spec: TDX Python datasource

## ADDED Requirements

### Requirement: Normalized response envelope
The datasource SHALL wrap every `/v1` API response in a stable envelope with
`ok`, `requestId`, `provider`, `data`, `meta`, and `error` fields.

#### Scenario: Successful response uses envelope
- **WHEN** NestJS calls a successful `/v1` datasource endpoint
- **THEN** the response includes `ok: true`, provider `tdx`, normalized `data`,
  request metadata, and `error: null`

#### Scenario: Provider failure uses envelope
- **WHEN** the TDX provider cannot satisfy a request
- **THEN** the response includes `ok: false`, `data: null`, provider `tdx`, and
  an error object with a stable code, message, retryable flag, and details

### Requirement: Python-only TDX boundary
NestJS SHALL consume TDX data only through the Python datasource `/v1` API and
MUST NOT call TongDaXin native HTTP JSON-RPC, `tqcenter`, or provider-native
TDX SDK shapes directly.

#### Scenario: Backend queries TDX bars
- **WHEN** the Mist backend needs TDX K-line data
- **THEN** it calls the Python datasource normalized bar API instead of
  TongDaXin native HTTP JSON-RPC or `tqcenter`

#### Scenario: Raw endpoint is used for diagnostics
- **WHEN** an operator or developer needs an unsupported TDX function for
  debugging
- **THEN** `/v1/raw/tdx/call` can proxy the provider call without becoming the
  primary product integration path

### Requirement: Versioned datasource API
The datasource SHALL expose versioned endpoints for health, providers, bars,
snapshots, formulas, sectors, raw TDX calls, and a normalized WebSocket bridge
for real-time subscription commands and events.

#### Scenario: API surface is available
- **WHEN** the TDX datasource starts
- **THEN** it exposes `GET /health`, `GET /providers`,
  `POST /v1/bars/query`, `POST /v1/snapshots/query`,
  `POST /v1/formulas/call`, `POST /v1/sectors/query`,
  `POST /v1/raw/tdx/call`, and a WebSocket route for normalized TDX bridge
  messages

### Requirement: Provider interface
The datasource SHALL route normalized operations through a provider interface
with methods for bars, snapshots, formulas, sectors, subscription sync,
subscription changes, recent-bar collection, and health.

#### Scenario: TDX provider handles normalized request
- **WHEN** `/v1/bars/query` receives a valid request for provider `tdx`
- **THEN** the service invokes the TDX provider through the provider interface
  and normalizes the provider result before responding

#### Scenario: Future QMT provider is added
- **WHEN** a QMT provider is later implemented behind the same interface
- **THEN** the NestJS-facing `/v1` request and response contracts do not change

### Requirement: TDX native HTTP client
The TDX provider SHALL use a dedicated HTTP client for general TongDaXin
JSON-RPC calls to the configured local TDX endpoint.

#### Scenario: General TDX call
- **WHEN** the datasource needs historical bars, snapshots, sectors, formulas,
  or another synchronous TDX function
- **THEN** it sends a JSON-RPC POST to `TDX_HTTP_URL`, defaulting to
  `http://127.0.0.1:17709/`, and maps the response into the normalized schema

#### Scenario: TDX HTTP endpoint is unavailable
- **WHEN** the configured TDX HTTP endpoint cannot be reached
- **THEN** the datasource returns error code `TDX_HTTP_UNAVAILABLE` and reports
  `tdxHttpReachable: false` in health state

### Requirement: Symbol, time, and numeric normalization
The datasource SHALL normalize provider outputs so symbols use market suffixes,
timestamps use ISO 8601 with `+08:00`, and numeric fields are JSON numbers.

#### Scenario: Minute bar normalization
- **WHEN** TDX returns native K-line data for a stock
- **THEN** the datasource returns bars with `symbol`, `period`, `barTime`,
  `open`, `high`, `low`, `close`, `volume`, `amount`, `provider`, and
  `receivedAt`

#### Scenario: Snapshot normalization
- **WHEN** TDX returns a native market snapshot
- **THEN** the datasource returns snapshots with `symbol`, `last`, `open`,
  `high`, `low`, `volume`, `amount`, `provider`, and `asOf`

### Requirement: Subscription callbacks mark dirty symbols
The datasource SHALL use `tqcenter.subscribe_hq` callbacks only to detect updated
symbols and MUST NOT perform blocking data fetches inside the callback.

#### Scenario: Subscription callback arrives
- **WHEN** TDX calls the subscription callback with a payload such as
  `{"Code":"688318.SH","ErrorId":"0"}`
- **THEN** the callback marks the symbol dirty and returns quickly

#### Scenario: Subscription limit exceeded
- **WHEN** a subscription request would exceed the configured maximum of 100 TDX
  symbols
- **THEN** the datasource rejects the request with error code
  `TDX_SUBSCRIBE_LIMIT_EXCEEDED`

### Requirement: Minute-bar collector
The datasource SHALL maintain fresh minute bars through a collector that reads
dirty symbols, fetches recent bars, and publishes normalized bar events to
connected NestJS clients over WebSocket.

#### Scenario: Minute boundary collection
- **WHEN** subscribed symbols are dirty at minute boundary plus the configured
  collection delay
- **THEN** the collector fetches the recent 2-3 bars for those symbols and
  emits one normalized `bar` event per new `symbol`, `period`, `barTime`, and
  `provider` key

#### Scenario: Retry stale symbols
- **WHEN** a dirty symbol does not produce a fresh bar during the first
  collection attempt
- **THEN** the collector retries at the configured retry delay and records stale
  state when the retry still fails

#### Scenario: Reconciliation scan
- **WHEN** the reconciliation interval elapses
- **THEN** the collector checks subscribed symbols for missing or stale latest
  bars and schedules refresh work as needed

### Requirement: WebSocket bridge and subscription resync
The datasource SHALL keep TDX subscription runtime state in the Python process
and SHALL rely on NestJS to own durable subscription intent, K-line persistence,
and reconnect resync.

#### Scenario: WebSocket connection is initialized
- **WHEN** NestJS connects to the normalized TDX WebSocket bridge
- **THEN** the datasource sends a `ready` message with provider, health, and
  protocol metadata

#### Scenario: NestJS syncs desired subscriptions
- **WHEN** NestJS sends `sync_subscriptions` with the desired TDX symbol set
- **THEN** the datasource reconciles active `tqcenter` subscriptions to that
  set and replies with the accepted and rejected symbols

#### Scenario: Service restart or reconnect restores runtime subscriptions
- **WHEN** the datasource service or WebSocket connection restarts
- **THEN** NestJS reconnects and sends a full `sync_subscriptions` message
  before relying on new real-time bar events

#### Scenario: Duplicate bar event arrives
- **WHEN** reconnect catch-up or retry logic emits a bar that NestJS has already
  persisted
- **THEN** NestJS handles the event idempotently using the existing Mist `K`
  uniqueness boundary for security, source, period, and timestamp

### Requirement: Health reporting
The datasource SHALL expose health state for Python service status, TDX HTTP,
`tqcenter`, WebSocket bridge status, subscriptions, collector freshness, and
event queue pressure.

#### Scenario: Health check includes TDX fields
- **WHEN** `GET /health` is called
- **THEN** the response includes `tdxHttpReachable`, `tqInitialized`,
  `wsConnected`, `subscribedCount`, `lastCallbackAt`, `lastMinuteBarAt`,
  `eventQueueDepth`, `eventQueueCapacity`, and `collectorState`

### Requirement: Stable error codes
The datasource SHALL map expected provider, WebSocket, and queue failures to
stable error codes.

#### Scenario: Known provider error
- **WHEN** TDX subscription initialization fails
- **THEN** the datasource returns error code `TDX_TQCENTER_INIT_FAILED` instead
  of an unstructured exception string

#### Scenario: WebSocket backpressure
- **WHEN** the outbound event queue cannot accept more events
- **THEN** the datasource records the drop or pause state, reports queue
  pressure in health, and returns or emits error code
  `DATASOURCE_WS_BACKPRESSURE`

### Requirement: NestJS TDX adapter migration
The Mist backend SHALL use the normalized Python datasource API for TDX source
fetching and MUST NOT depend on the legacy TDX WebSocket snapshot aggregation
for minute-bar freshness after migration.

#### Scenario: Manual K-line collection
- **WHEN** `TdxSource.fetchK` collects TDX K-line data
- **THEN** it maps `/v1/bars/query` normalized bars into existing Mist `K`
  entities without parsing provider-native field maps

#### Scenario: Real-time minute freshness
- **WHEN** the backend needs the latest subscribed minute bar
- **THEN** it consumes normalized Python WebSocket `bar` events and persists
  them through the existing Mist K-line persistence flow instead of aggregating
  raw TDX WebSocket snapshots in NestJS
