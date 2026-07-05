## ADDED Requirements

### Requirement: Backend uses separate TDX and QMT datasource services
The Mist backend SHALL treat TDX and QMT as separate datasource services.

#### Scenario: Backend requests TDX data
- **WHEN** backend collection or analysis code needs TDX data
- **THEN** it MUST call the TDX datasource on `:9001`
- **AND** it MAY use TDX `/v1` routes or the TDX quote WebSocket according to
  the existing TDX contract

#### Scenario: Backend requests QMT historical bars
- **WHEN** backend collection or analysis code needs QMT historical bars
- **THEN** it MUST call QMT `:9002/v1/bars/query`
- **AND** it MUST send QMT snake_case request fields
- **AND** it MUST handle QMT native `data.marketData`

### Requirement: Backend does not call QMT bridge internals as product API
The QMT HTTP polling bridge SHALL remain an internal runtime channel between
the datasource and the full-QMT built-in Python script.

#### Scenario: Product code needs QMT data
- **WHEN** backend product code needs QMT data
- **THEN** it MUST use QMT product routes such as `:9002/v1/bars/query`
- **AND** it MUST NOT call `/qmt/bridge/owner`, `/qmt/bridge/poll`,
  `/qmt/bridge/result`, or `/qmt/bridge/health` as market-data APIs

### Requirement: Account and trading operations stay outside backend market flow
The backend SHALL NOT route QMT account, position, order, deal, cancel, or
placement operations through the market datasource.

#### Scenario: Backend feature needs QMT trading behavior
- **WHEN** a backend feature needs QMT account or trading behavior
- **THEN** a separate trading/account service design MUST be created before
  implementation
