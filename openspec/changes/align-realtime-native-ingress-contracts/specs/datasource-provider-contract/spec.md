## ADDED Requirements

### Requirement: Internal realtime frames preserve provider native data
The datasource SHALL expose provider-native realtime objects only through the authenticated internal realtime WebSocket envelope while normalized public `/v1` HTTP endpoints remain provider-neutral.

#### Scenario: Internal realtime consumer receives a frame
- **WHEN** the authorized backend leader receives a TDX or QMT realtime frame
- **THEN** the frame contains the complete validated provider-native object and a source acquisition profile

#### Scenario: Public normalized endpoint is called
- **WHEN** a product caller uses `/v1/bars/query` or `/v1/snapshots/query`
- **THEN** the existing provider-neutral response contract remains unchanged

### Requirement: Realtime sequence scope is per symbol
Each datasource SHALL assign a sequence that is strictly monotonic for the same `(symbol, streamEpoch)` and SHALL declare `sequenceScope=symbol` in schema v1 frames.

#### Scenario: Multiple symbols share one QMT command result
- **WHEN** QMT emits frames for multiple symbols returned by one `get_full_tick` command
- **THEN** each symbol advances only its own sequence and does not depend on another symbol's sequence
