# backend-datasource-integration Specification

## Purpose
TBD - created by archiving change connect-backend-to-datasource. Update Purpose after archive.
## Requirements
### Requirement: Configured datasource client boundary
The Mist backend SHALL use the configured Python datasource service as the only
product TDX boundary for backend data collection.

#### Scenario: HTTP client uses configured datasource base URL
- **WHEN** the backend starts with `TDX_BASE_URL=http://127.0.0.1:9001`
- **THEN** the TDX HTTP client sends product datasource requests to that base
  URL

#### Scenario: Backend does not call native TDX directly
- **WHEN** the backend collects TDX bars or snapshots
- **THEN** it MUST NOT call TongDaXin native HTTP JSON-RPC, `tqcenter`, or the
  datasource `/v1/raw/tdx/call` debug endpoint

#### Scenario: WebSocket client uses configured client id
- **WHEN** the backend starts with `TDX_WS_CLIENT_ID=mist-backend-tdx`
- **THEN** the TDX WebSocket client connects with that client id and uses it for
  reconnects

### Requirement: Normalized bar query mapping
The backend TDX source SHALL fetch K-line data through the datasource
`POST /v1/bars/query` endpoint and map normalized bars into the existing Mist
`TdxResponse` shape.

#### Scenario: Datasource preserves backend-required market-data parameters
- **WHEN** the backend migrates from legacy `/api/tdx/market-data` to
  `/v1/bars/query`
- **THEN** the datasource contract preserves backend-required meanings for
  stock list, field list, period, start time, end time, and dividend adjustment
  behavior, or the missing behavior is added before migration

#### Scenario: Backend requests normalized bars
- **WHEN** `TdxSource.fetchK` receives a security format code, period, start
  date, and end date
- **THEN** it posts `symbols`, `period`, `startTime`, and `endTime` to
  `/v1/bars/query`

#### Scenario: Successful bars response is mapped
- **WHEN** the datasource returns an envelope with `ok: true` and
  `data.bars[*]`
- **THEN** the backend returns `TdxResponse[]` with `timestamp`, `open`, `high`,
  `low`, `close`, `volume`, `amount`, and optional `forwardFactor`

#### Scenario: Empty bars response is valid
- **WHEN** the datasource returns `ok: true` with an empty `data.bars` array
- **THEN** `TdxSource.fetchK` returns an empty array without throwing

### Requirement: TDX bar field preservation
The backend integration SHALL preserve backend-required TDX bar fields that are
available from the normalized datasource contract without storing them in the
provider-neutral `K` base table.

#### Scenario: Backend requests backend-required bar fields
- **WHEN** the datasource `/v1/bars/query` contract supports field-list and
  dividend-adjustment parameters
- **THEN** the backend requests the OHLCV fields plus backend-required extension
  fields such as `ForwardFactor` and `VolInStock` using the normalized contract

#### Scenario: Structured extension fields are returned
- **WHEN** normalized bars include TDX-specific structured extension fields
- **THEN** the backend maps those fields into the TDX extension shape instead of
  dropping them or replacing them with default zero values

#### Scenario: Field has no structured owner
- **WHEN** a datasource response includes a non-normalized provider field that
  has no corresponding extension or domain table
- **THEN** the backend does not persist that field as opaque raw JSON and records
  the need for a structured owner before product use

### Requirement: Normalized snapshot query mapping

The backend TDX source SHALL fetch snapshots through the datasource
`POST /v1/snapshots/query` endpoint and map normalized snapshots into the
Mist `TdxSnapshot` shape with canonical identity, provider transport identity,
normalized aggregation fields, and raw datasource payload preservation.

#### Scenario: Datasource preserves backend-required snapshot parameters

- **WHEN** the backend migrates from legacy `/api/tdx/market-snapshot` to
  `/v1/snapshots/query`
- **THEN** the datasource contract preserves backend-required meanings for
  symbol and field-list filtering, or the missing behavior is added before
  migration

#### Scenario: Backend requests normalized snapshot

- **WHEN** `TdxSource.fetchSnapshot` receives a TDX symbol
- **THEN** it posts the symbol in `symbols` to `/v1/snapshots/query`

#### Scenario: Successful snapshot response is mapped

- **WHEN** the datasource returns an envelope with `ok: true` and at least one
  normalized snapshot
- **THEN** the backend returns `TdxSnapshot` with `code`, `formatCode`, `now`,
  `open`, `high`, `low`, `lastClose`, `volume`, `amount`, `timestamp`, and
  `raw`
- **AND** the returned `TdxSnapshot` MUST NOT include `stockCode`

### Requirement: Datasource error envelope handling
The backend SHALL treat datasource failure envelopes and invalid envelopes as
upstream datasource failures with stable backend errors.

#### Scenario: Datasource returns failure envelope
- **WHEN** the datasource returns `ok: false` with `error.code` and
  `error.message`
- **THEN** the backend raises an upstream datasource error that includes the
  datasource error code and message

#### Scenario: Datasource returns invalid payload
- **WHEN** the datasource response is missing the envelope or the expected
  `data` field
- **THEN** the backend raises an upstream datasource error instead of saving
  partial data

#### Scenario: Datasource request fails
- **WHEN** the HTTP request to the datasource times out or is refused
- **THEN** the backend raises a retryable upstream datasource failure and logs
  the datasource base URL and operation name

### Requirement: WebSocket subscription resync
The backend TDX WebSocket client SHALL maintain desired subscriptions locally
and resync them after every datasource WebSocket connection.

#### Scenario: Datasource sends ready
- **WHEN** the backend receives a WebSocket `ready` message from the datasource
- **THEN** it sends `sync_subscriptions` with the full locally desired symbol
  set before relying on new bar events

#### Scenario: Backend subscribes after connection
- **WHEN** backend collection subscribes a security while the WebSocket is open
- **THEN** the client records the symbol locally and sends
  `sync_subscriptions` with the full desired symbol set

#### Scenario: WebSocket reconnects
- **WHEN** the WebSocket reconnects after disconnect
- **THEN** the client sends `sync_subscriptions` with all locally desired
  symbols again

### Requirement: Normalized WebSocket event handling

The backend SHALL consume datasource `quote` events as snapshot-only streaming
events and aggregate K-line candles from normalized snapshot fields while
preserving provider raw snapshot fields outside the completed K-line payload.

#### Scenario: Normalized bar event arrives

- **WHEN** the backend receives a datasource WebSocket message with
  `type: "bar"` and normalized bar data
- **THEN** it converts the event into the existing candle callback shape and
  persists it through the current K-line save path

#### Scenario: Quote event arrives

- **WHEN** the backend receives a datasource WebSocket message with
  `type: "quote"` and snapshot data
- **THEN** it parses the snapshot into `code`, `formatCode`, normalized
  aggregation fields, and `raw`
- **AND** it routes only the normalized fields through K-line aggregation
- **AND** the parsed snapshot MUST NOT include `stockCode`

#### Scenario: WebSocket error event arrives

- **WHEN** the datasource sends a WebSocket `error` event
- **THEN** the backend logs the datasource error code, message, retryable flag,
  and details without dropping the desired subscription set

### Requirement: Deployment health verifies backend-datasource connection
The Windows Docker deployment health check SHALL verify the datasource URL used
by backend containers from both the Windows host and the backend container.

#### Scenario: Health check probes the container datasource URL
- **WHEN** the Windows Docker health check runs
- **THEN** it verifies datasource health from the host
- **AND** it verifies datasource health from the `mist-backend` container
  through `http://host.docker.internal:9001/health`

#### Scenario: Datasource health is checked
- **WHEN** the health check probes the configured datasource
- **THEN** it verifies `GET /health` and reports whether the datasource service
  is reachable

#### Scenario: Backend health remains checked
- **WHEN** the deployment health check runs
- **THEN** it still verifies backend health endpoints after datasource probes

### Requirement: Interface test coverage
The backend datasource integration SHALL include automated tests for request
shape, response mapping, error handling, WebSocket protocol behavior, and
deployment script URL resolution.

#### Scenario: HTTP unit tests cover normalized contracts
- **WHEN** backend unit tests run for `TdxSource`
- **THEN** they verify `/v1/bars/query`, `/v1/snapshots/query`, successful
  envelope mapping, failure envelope handling, and invalid payload handling

#### Scenario: WebSocket unit tests cover datasource protocol
- **WHEN** backend unit tests run for `TdxWebSocketService`
- **THEN** they verify `ready`, `sync_subscriptions`, `subscribe`,
  `unsubscribe`, `bar`, `quote`, `pong`, and `error` message behavior

#### Scenario: Deployment script tests cover configured URL
- **WHEN** deployment script tests run
- **THEN** they verify the Windows Docker health check covers both host
  datasource health and container-to-host datasource health

### Requirement: Integration documentation
The project SHALL document how the backend client connects to the datasource
and how to verify that connection locally and on Windows.

#### Scenario: Developer reads backend datasource docs
- **WHEN** a developer needs to understand the backend datasource connection
- **THEN** the docs identify `TdxSource`, `TdxWebSocketService`,
  `TDX_BASE_URL`, `TDX_WS_CLIENT_ID`, `/v1/bars/query`,
  `/v1/snapshots/query`, `/ws/quote/{client_id}`, and the relevant test
  commands

#### Scenario: Operator follows Windows verification docs
- **WHEN** an operator deploys backend and datasource on Windows
- **THEN** the docs show the startup order, health checks, normalized API probe,
  expected success output, and rollback path

### Requirement: Snapshot raw preservation boundary

The backend SHALL preserve the full provider snapshot payload available on a
TDX quote event for real-time pass-through or future in-memory calculation, but
MUST NOT aggregate or persist raw snapshot fields as K-line data.

#### Scenario: Official snapshot fields are preserved

- **WHEN** a TDX quote snapshot includes provider fields such as `NowVol`,
  `Inside`, `Outside`, `Buyp`, `Buyv`, `Sellp`, `Sellv`, `Average`, `Zangsu`,
  or `ZAFPre3`
- **THEN** those fields remain present under `TdxSnapshot.raw`

#### Scenario: K aggregation ignores raw fields

- **WHEN** a TDX snapshot contains both normalized fields and additional raw
  provider fields
- **THEN** `KCandleAggregator` computes candles from `code`, `timestamp`,
  `now`, `volume`, and `amount`
- **AND** it does not copy `raw` into completed candles

#### Scenario: Completed streaming K persistence is raw-free

- **WHEN** a completed candle produced from snapshot aggregation is persisted
- **THEN** the K save path writes `timestamp`, `open`, `high`, `low`, `close`,
  `volume`, `amount`, and `period`
- **AND** it does not write raw snapshot fields or opaque snapshot JSON to K
  extension tables
