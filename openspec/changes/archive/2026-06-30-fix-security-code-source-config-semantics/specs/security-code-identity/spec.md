## ADDED Requirements

### Requirement: Canonical Security Code Identity
The system SHALL store and look up `Security.code` as a provider-neutral canonical code. Canonical codes MUST remove common provider market decorations from supported stock symbols, including dotted suffix form such as `600519.SH` and market-prefix form such as `SH600519`.

#### Scenario: Initialize security with provider-formatted code
- **WHEN** a caller initializes a security with code `600519.SH`
- **THEN** the persisted `Security.code` is `600519`
- **AND** future lookups by `600519`, `600519.SH`, or `SH600519` resolve to the same security row

#### Scenario: Lookup security with provider-formatted code
- **WHEN** a caller requests security `SH600519`
- **THEN** the backend queries `securities.code` using canonical code `600519`

### Requirement: Provider Format Code Boundary
The system SHALL use `SecuritySourceConfig.formatCode` only as the provider-specific transport code for external data-source calls. Internal aggregation, persistence, lookup, and subscription tracking MUST use canonical `Security.code` or `Security.id`.

#### Scenario: TDX streaming uses separate identity and transport codes
- **WHEN** a security has `code=600519` and TDX `formatCode=600519.SH`
- **THEN** the backend tracks the subscription internally by `600519`
- **AND** sends `600519.SH` to the TDX datasource for subscribe/unsubscribe calls

#### Scenario: Completed K-line persistence uses security identity
- **WHEN** a completed TDX streaming candle is emitted for provider symbol `600519.SH`
- **THEN** the backend resolves canonical code `600519`
- **AND** persists the K-line using the matched `Security.id`

### Requirement: Idempotent Source Configuration
The system SHALL make source configuration writes idempotent for a given security and source. Repeated add/update operations for the same `(security_id, source)` MUST update the existing row instead of creating duplicates.

#### Scenario: Repeated TDX source setup
- **WHEN** the same TDX source config is submitted repeatedly for security `600519`
- **THEN** the `security_source_configs` table contains one TDX row for that security
- **AND** the row reflects the latest `formatCode`, `priority`, and `enabled` values

#### Scenario: Duplicate source config cleanup
- **WHEN** existing exact duplicate rows are found for the same `(security_id, source, formatCode, priority, enabled)`
- **THEN** cleanup keeps one row and removes the redundant duplicates
- **AND** non-identical duplicates are reported for manual resolution instead of being deleted automatically
