## MODIFIED Requirements

### Requirement: Snapshot raw preservation boundary
The backend SHALL preserve the validated provider-native object carried by an accepted formal realtime frame, SHALL convert it through a source-specific adapter into the shared canonical ingress shape, and MUST keep this change memory-only without K-line or business persistence.

#### Scenario: Official snapshot fields are preserved
- **WHEN** a TDX or QMT quote includes provider-specific price, order-book, volume, amount, time, or extension fields
- **THEN** those fields remain present under the canonical snapshot's `native` object
- **AND** datasource code MUST NOT force the two providers into one native shape

#### Scenario: Realtime snapshot reaches common ingress
- **WHEN** an accepted formal TDX or QMT frame reaches the backend
- **THEN** the appropriate source adapter produces the common canonical shape
- **AND** it MUST NOT invoke Redis, candle aggregation, database persistence, scanner, signal, alert, notification, or trading code

#### Scenario: Realtime snapshot remains memory-only
- **WHEN** an accepted TDX or QMT realtime snapshot reaches the backend
- **THEN** it may update bounded diagnostic state and callbacks
- **AND** it MUST NOT invoke candle aggregation or database persistence

## ADDED Requirements

### Requirement: Formal realtime clients share one product ingress
The backend SHALL keep source-specific WebSocket clients and transport stores while routing every accepted frame through one `RealtimeSnapshotIngressService`.

#### Scenario: Transport frame is rejected
- **WHEN** contract, authorization, epoch or sequence validation rejects a frame
- **THEN** common ingress is not invoked and a stable source-labelled drop reason is recorded

#### Scenario: Transport frame is accepted
- **WHEN** source fencing accepts a frame
- **THEN** exactly one source adapter and the common ingress are invoked with the same validated native object
