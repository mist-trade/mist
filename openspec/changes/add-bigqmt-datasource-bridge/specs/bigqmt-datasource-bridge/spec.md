## ADDED Requirements

### Requirement: QMT service exposes only the native production surface
The QMT datasource service SHALL expose only `/health`, native QMT bars, and
HTTP polling bridge endpoints required by the full-QMT built-in Python script.

#### Scenario: QMT service route table is inspected
- **WHEN** the QMT FastAPI app is inspected
- **THEN** it MUST expose `GET /health`
- **AND** it MUST expose `POST /v1/bars/query`
- **AND** it MUST expose `POST /qmt/bridge/owner`,
  `POST /qmt/bridge/poll`, `POST /qmt/bridge/result`, and
  `GET /qmt/bridge/health`
- **AND** it MUST NOT expose legacy QMT route groups and adapter-backed realtime quote routes, or `/qmt/bridge/ws` routes

### Requirement: QMT bars query uses official snake_case market-data parameters
The QMT bars endpoint SHALL accept QMT native request fields shaped after
`ContextInfo.get_market_data_ex`.

#### Scenario: QMT bars request is accepted
- **WHEN** a caller posts to `:9002/v1/bars/query`
- **THEN** the request body MUST accept `fields`, `stock_list`, `period`,
  `start_time`, `end_time`, `count`, `dividend_type`, `fill_data`, and
  `include_raw`
- **AND** the request body MUST NOT accept TDX-style `symbols`, `startTime`,
  `endTime`, `dividendType`, or `fillData`
- **AND** the HTTP API MUST NOT expose `subscribe`
- **AND** the datasource MUST execute historical semantics equivalent to
  `get_market_data_ex(..., subscribe=False)`

#### Scenario: Unsupported period is requested
- **WHEN** the requested period is not `1d`, `1m`, or `5m`
- **THEN** the datasource MUST return a stable unsupported-period datasource
  error instead of guessing a local file layout

### Requirement: QMT bars response is native marketData
The QMT bars endpoint SHALL return QMT native column-oriented market data
instead of the TDX row contract.

#### Scenario: Local DAT bars are returned
- **WHEN** a configured QMT local DAT read succeeds
- **THEN** the response envelope MUST set `provider` to `qmt`
- **AND** `data.marketData` MUST map stock code to `{field: {stime: value}}`
- **AND** `data.source` MUST identify the source as `local_dat`
- **AND** the response MUST NOT include `data.bars[]` or the TDX bar row model rows

#### Scenario: Raw evidence is requested
- **WHEN** the request sets `include_raw=true`
- **THEN** the response MUST include parse evidence for each symbol with
  `period_code`, `record_size`, `header_size`, `struct_format`,
  `price_scale`, and `source_path`

### Requirement: Local DAT historical bars are read safely
The QMT local DAT reader SHALL support only explicitly configured full-QMT
historical DAT files for bars.

#### Scenario: Daily DAT file is parsed
- **WHEN** the datasource reads a full-QMT daily DAT file
- **THEN** it MUST parse the 8-byte header and 32-byte records
- **AND** it MUST treat even record indexes as valid bars
- **AND** it MUST divide prices by `1000`
- **AND** it MUST keep volume in the native DAT unit
- **AND** it MUST fill missing amount as `0`

#### Scenario: Minute DAT file is parsed
- **WHEN** the datasource reads a full-QMT `1m` or `5m` DAT file
- **THEN** it MUST select only from controlled candidate binary layouts
- **AND** the selected layout MUST pass timestamp, OHLC, volume, amount,
  sorting, and period-alignment validation
- **AND** failed detection MUST return structured details that include
  attempted record size, format, and header size

#### Scenario: Local DAT read is blocked or unstable
- **WHEN** the read occurs after the configured block time or the file changes
  during the stability wait
- **THEN** the datasource MUST NOT parse the file
- **AND** it MUST return a retryable datasource error or a configured bridge
  fallback result

### Requirement: Production bridge uses HTTP polling only
The full-QMT production bridge SHALL use a QMT-initiated stdlib HTTP polling
protocol.

#### Scenario: Bridge script polls for work
- **WHEN** the QMT bridge `run_time` callback fires
- **THEN** it MUST register a single owner, poll the local command gateway,
  execute commands serially, and post results back
- **AND** it MUST NOT require `handlebar` K-line callbacks or `subscribe`
  quote callbacks for command intake

#### Scenario: Bridge script is inspected
- **WHEN** static checks inspect the production QMT bridge script
- **THEN** it MUST NOT import realtime-duplex packages, `requests`, thread/process
  APIs, subprocess APIs, or unverified third-party dependencies
