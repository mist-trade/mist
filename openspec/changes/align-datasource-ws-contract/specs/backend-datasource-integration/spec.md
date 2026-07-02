## ADDED Requirements

### Requirement: Datasource WebSocket outbound messages use one envelope

The datasource service SHALL emit WebSocket server messages through a single
`WSMessage` envelope with `type`, `provider`, `timestamp`, and `data`.

#### Scenario: Ping receives timestamped pong

- **WHEN** a WebSocket client sends `{"type": "ping"}` to either TDX or QMT
- **THEN** the datasource responds with a `WSMessage` whose `type` is `pong`
- **AND** the response includes `provider`, `timestamp`, and `data`

#### Scenario: Subscription acknowledgement is data based

- **WHEN** a client changes subscriptions through `sync_subscriptions`,
  `subscribe`, or `unsubscribe`
- **THEN** the datasource acknowledgement message MUST put `accepted`,
  `rejected`, and `active` under `data`
- **AND** it MUST NOT require clients to read provider-specific top-level
  acknowledgement fields

#### Scenario: Datasource error message is machine readable

- **WHEN** the datasource sends a WebSocket error
- **THEN** the error message MUST put `code`, `message`, `retryable`, and
  `details` under `data`
- **AND** TDX and QMT MUST use the same structure for those fields

### Requirement: Datasource snapshot quote events are serialized centrally

The datasource service SHALL publish TDX snapshot quote events through a shared
serializer instead of hand-mapping snapshot field names at each publisher.

#### Scenario: Collector publishes snapshot quote

- **WHEN** the TDX snapshot collector publishes a quote event
- **THEN** the message MUST be a `WSMessage` with `type: "quote"` and
  `provider: "tdx"`
- **AND** its `data` MUST include the subscribed symbol and a `snapshot`
  payload

#### Scenario: Snapshot serializer avoids duplicate aliases

- **WHEN** a normalized `TdxSnapshot` is serialized for WebSocket quote output
- **THEN** the snapshot payload MUST use one canonical key per value
- **AND** it MUST NOT emit duplicate aliases such as both `Now` and `Last` for
  the same price or both `High` and `Max` for the same high value

### Requirement: Datasource old routes are migration-only

The datasource product contract SHALL prefer normalized `/v1` routes, while old
TDX/QMT routes remain explicit migration or compatibility surfaces.

#### Scenario: Product callers use normalized routes

- **WHEN** backend or product-facing callers need bars, snapshots, references,
  finance, formula, or sector data
- **THEN** they MUST use normalized `/v1` routes or the WebSocket contract
  defined in this capability
- **AND** they MUST NOT add new product use of old bare-dict routes

#### Scenario: Old route boundary is documented or marked

- **WHEN** an old datasource route remains exposed
- **THEN** its migration status MUST be documented or exposed through
  deprecation metadata
- **AND** tests or static checks MUST prove the migration boundary is present

### Requirement: Provider-facing contracts stay narrow and typed

The datasource SHALL use typed models or narrow provider-facing protocols for
the normalized routes it actually exposes, instead of adding a broad adapter
ABC that tries to cover every provider method.

#### Scenario: Normalized route depends on supported provider capability

- **WHEN** a normalized route or WebSocket publisher calls provider code
- **THEN** the callable contract MUST be limited to the route's required
  operation and typed payload shape
- **AND** unsupported provider methods MUST remain explicit capability
  failures

#### Scenario: No broad adapter ABC is introduced

- **WHEN** this change aligns WebSocket and route contracts
- **THEN** it MUST NOT add a large placeholder adapter interface for unused
  provider operations
- **AND** tests MUST cover the concrete normalized contract being consumed

## MODIFIED Requirements

### Requirement: Normalized WebSocket event handling

The backend SHALL consume datasource WebSocket events from the canonical
`WSMessage` envelope, prioritize message-specific payloads under `data`, and
aggregate K-line candles from normalized snapshot fields while preserving
temporary legacy fallbacks during migration.

#### Scenario: Normalized bar event arrives

- **WHEN** the backend receives a datasource WebSocket message with
  `type: "bar"` and normalized bar data
- **THEN** it converts the event into the existing candle callback shape and
  persists it through the current K-line save path

#### Scenario: Quote event arrives

- **WHEN** the backend receives a datasource WebSocket message with
  `type: "quote"` and snapshot data under `data`
- **THEN** it parses the snapshot into `code`, `formatCode`, normalized
  aggregation fields, and `raw`
- **AND** it routes only the normalized fields through K-line aggregation
- **AND** the parsed snapshot MUST NOT include `stockCode`

#### Scenario: WebSocket error event arrives

- **WHEN** the datasource sends a WebSocket `error` event
- **THEN** the backend logs the datasource error code, message, retryable flag,
  and details from the canonical `data` payload
- **AND** it does not drop the desired subscription set

#### Scenario: WebSocket subscription acknowledgement arrives

- **WHEN** the datasource sends a `subscribed` or `unsubscribed` event
- **THEN** the backend reads accepted, rejected, and active symbols from the
  canonical `data` payload
- **AND** it may read the prior top-level shape only as a migration fallback

#### Scenario: WebSocket pong event arrives

- **WHEN** the datasource sends a `pong` event with timestamp and provider
- **THEN** the backend treats it as a heartbeat response without requiring
  provider-specific fields

### Requirement: Interface test coverage

The backend datasource integration SHALL include automated tests for request
shape, response mapping, error handling, WebSocket protocol behavior,
deployment script URL resolution, and datasource WebSocket envelope behavior.

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

#### Scenario: Datasource tests cover canonical WebSocket envelopes

- **WHEN** datasource tests run for WS protocol and quote routes
- **THEN** they verify pong timestamps, canonical error payloads, data-based
  subscription acknowledgements, and centrally serialized TDX snapshot quotes

#### Scenario: Old route tests cover migration boundary

- **WHEN** datasource route contract tests run
- **THEN** they verify old route migration metadata or documentation exists
- **AND** they verify normalized `/v1` routes remain the product-facing path
