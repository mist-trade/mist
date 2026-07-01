## MODIFIED Requirements

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

## ADDED Requirements

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
