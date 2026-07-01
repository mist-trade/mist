## MODIFIED Requirements

### Requirement: Provider Format Code Boundary

The system SHALL use `SecuritySourceConfig.formatCode` only as the provider-specific transport code for external data-source calls. Internal aggregation, persistence, lookup, and subscription tracking MUST use canonical `Security.code` or `Security.id`.

#### Scenario: TDX streaming uses separate identity and transport codes

- **WHEN** a security has `code=600519` and TDX `formatCode=600519.SH`
- **THEN** the backend tracks the subscription internally by `600519`
- **AND** sends `600519.SH` to the TDX datasource for subscribe/unsubscribe calls

#### Scenario: Streaming snapshot model uses code and formatCode

- **WHEN** the backend parses a TDX snapshot for provider symbol `600519.SH`
- **THEN** the resulting snapshot uses `code=600519`
- **AND** uses `formatCode=600519.SH`
- **AND** does not expose `stockCode`

#### Scenario: Completed K-line persistence uses security identity

- **WHEN** a completed TDX streaming candle is emitted for provider symbol `600519.SH`
- **THEN** the backend resolves canonical code `600519`
- **AND** persists the K-line using the matched `Security.id`
