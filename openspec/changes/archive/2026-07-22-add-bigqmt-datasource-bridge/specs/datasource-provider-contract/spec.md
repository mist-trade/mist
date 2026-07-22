## ADDED Requirements

### Requirement: TDX and QMT datasource contracts are separate
The datasource layer SHALL expose TDX and QMT through separate service
contracts rather than a shared `provider` selector in the TDX service.

#### Scenario: TDX v1 request models are inspected
- **WHEN** TDX v1 schemas are generated
- **THEN** request models MUST NOT include a `provider` field
- **AND** requests containing `provider` MUST be rejected as invalid input

#### Scenario: TDX provider metadata is requested
- **WHEN** a caller requests TDX `/providers`
- **THEN** the response MUST describe TDX only
- **AND** it MUST NOT advertise QMT capabilities from the TDX service

### Requirement: QMT bars keep native market-data shape
The QMT service SHALL return QMT historical bars in QMT native column shape.

#### Scenario: QMT historical bars are requested
- **WHEN** a caller requests QMT `:9002/v1/bars/query`
- **THEN** the response MUST return `data.marketData`
- **AND** it MUST NOT convert rows into the TDX `data.bars[]` contract
- **AND** it MUST NOT expose QMT bars through a TDX provider selector

#### Scenario: Cross-provider consumers need a common row shape
- **WHEN** Mist backend, charts, or strategy code needs to compare TDX and QMT
  historical bars
- **THEN** that caller or a backend-level adapter MUST perform the row shaping
- **AND** the QMT datasource MUST keep provider-native details behind its own
  QMT contract

### Requirement: QMT account and trading APIs remain outside market datasource
The QMT market datasource SHALL exclude account, position, order, deal, cancel,
and placement APIs.

#### Scenario: QMT account or trading method is requested
- **WHEN** a QMT market datasource route or bridge command attempts to expose
  account, position, order, deal, cancel, or placement behavior
- **THEN** static guardrails or runtime validation MUST reject it

### Requirement: Legacy QMT adapter surfaces are removed
The datasource SHALL remove legacy QMT adapter and mock surfaces from the
production code path.

#### Scenario: Repository guardrails inspect QMT production code
- **WHEN** guardrails scan production paths
- **THEN** they MUST fail on legacy QMT adapter factories, mock adapter classes,
  legacy QMT route groups, and bridge realtime-duplex endpoints
