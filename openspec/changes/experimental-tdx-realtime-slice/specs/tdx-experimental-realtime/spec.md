## ADDED Requirements

### Requirement: Experimental TDX realtime is mode-gated and side-effect-free
The TDX realtime pathway SHALL be controlled by a single mutual-exclusive
mode and MUST NOT produce K-line persistence, scanner signals, or business
side effects in any mode.

#### Scenario: Mode is set to legacy (default)
- **WHEN** `TDX_REALTIME_MODE=legacy` (or unset)
- **THEN** the legacy realtime path (`adapter_legacy` + `tdx_legacy`) runs
  unchanged
- **AND** no experimental gateway, experimental WS, or experimental Mist
  consumer is instantiated
- **AND** legacy realtime behavior is preserved

#### Scenario: Mode is set to builtin_experimental
- **WHEN** `TDX_REALTIME_MODE=builtin_experimental`
- **THEN** only the experimental gateway + experimental WS + experimental
  Mist consumer are wired
- **AND** the legacy realtime providers (`TdxWebSocketService`,
  `KCandleAggregator`, `WebSocketCollectionStrategy`) MUST NOT be resolvable
  in the DI container
- **AND** legacy streaming routes MUST NOT exist

#### Scenario: Mode is set to off
- **WHEN** `TDX_REALTIME_MODE=off`
- **THEN** neither legacy nor experimental realtime modules are imported
- **AND** only historical collection runs

#### Scenario: Mode mismatch between datasource and Mist
- **WHEN** the datasource mode and Mist mode are both valid but inconsistent
- **THEN** realtime readiness MUST be false
- **AND** no subscriptions are established and no data is accepted
- **AND** the processes remain running for diagnostic purposes

#### Scenario: Unknown or conflicting mode value
- **WHEN** `TDX_REALTIME_MODE` is not one of `legacy`, `builtin_experimental`,
  `off`
- **THEN** the process MUST fail to bootstrap

#### Scenario: Sampled K never writes the k table
- **WHEN** the experimental path is active in any mode
- **THEN** the experimental Mist module MUST NOT call `saveRawKData`,
  `KCandleAggregator.process`, or any scanner/signal/alert entry point
- **AND** the `k`, `k_extension_*`, `strategy_signal`, and
  `strategy_alert_event` tables MUST NOT receive writes from the experimental
  path

### Requirement: Schedule app never imports realtime modules
The schedule application SHALL only import `HistoricalCollectorModule` and
MUST NOT instantiate any realtime WebSocket client or expose realtime routes.

#### Scenario: Schedule module graph is inspected
- **WHEN** the schedule app DI container is constructed
- **THEN** it MUST NOT contain `ExperimentalTdxRealtimeClient`,
  `TdxWebSocketService`, or any realtime controller
- **AND** it MUST NOT open any realtime WebSocket connection

### Requirement: Experimental decoder validates strictly without silent fills
The datasource experimental decoder SHALL validate native snapshots strictly
and MUST NOT fill missing prices with 0 or missing times with the current
clock.

#### Scenario: Native snapshot has all fields
- **WHEN** the decoder receives a native dict with valid `Now`/`Max`/`Min`/
  `Open`/`LastClose`/`Volume`/`Amount`
- **THEN** it emits a typed snapshot with `last` finite and all price fields
  present

#### Scenario: Native snapshot is missing non-last prices
- **WHEN** the decoder receives a native dict missing `Max` or `Min`
- **THEN** the typed snapshot `high`/`low` fields MUST be `null`
- **AND** `quality.partialPrices` MUST be `true`
- **AND** the snapshot MUST NOT be rejected (only `last` is required)

#### Scenario: Native snapshot is missing last price
- **WHEN** the decoder receives a native dict missing `Now` (or `last`)
- **THEN** the snapshot MUST be rejected
- **AND** it MUST NOT be filled with 0

#### Scenario: Native snapshot has non-finite last
- **WHEN** the decoder receives a `last` value that is NaN, Infinity,
  -Infinity, or a boolean
- **THEN** the snapshot MUST be rejected

#### Scenario: Native time is missing
- **WHEN** the native dict has no trustworthy `asof`
- **THEN** `eventTime` MUST be `null`
- **AND** `quality.nativeTimeUnavailable` MUST be `true`
- **AND** the current clock MUST NOT be used as a substitute

#### Scenario: Conflicting native aliases
- **WHEN** the native dict contains both `Now` and `Last` for the same value
- **THEN** the strict decoder MUST reject (it MUST NOT silently pick the first
  by dict order)

### Requirement: Gateway owns authoritative outbound sequence
The experimental gateway SHALL assign the authoritative outbound sequence and
MUST reject duplicate or out-of-order frames before any publish await.

#### Scenario: Terminal submits a producerSequence
- **WHEN** the terminal POSTs a snapshot with a `producerSequence` for HTTP
  retry idempotency
- **THEN** the gateway validates lease, epoch, converged symbol membership, and
  monotonicity
- **AND** only after atomic acceptance does it assign the authoritative
  outbound `sequence`
- **AND** the sequence check and retention MUST occur before any
  `await publisher`

#### Scenario: Duplicate or out-of-order sequence
- **WHEN** the gateway detects a sequence that is not strictly greater than the
  last published for the same `(instrumentKey, streamEpoch)`
- **THEN** the frame is dropped and NOT broadcast

### Requirement: Four-state subscription convergence with epoch fencing
The gateway SHALL maintain desired, attempted, converged, and observedNative
subscription states, and convergence MUST require native-set agreement under a
stable owner epoch.

#### Scenario: Partial subscription failure
- **WHEN** a reconcile attempt has any rejected symbols
- **THEN** `convergedRevision` MUST NOT advance
- **AND** `attemptedRevision` records the attempt with classified retry/backoff

#### Scenario: Owner generation changes
- **WHEN** a new terminal owner registers (new generation)
- **THEN** the gateway generates a new `streamEpoch`
- **AND** broadcasts `stream_started` to already-connected clients
- **AND** late-connecting clients recover the epoch via `ready`

#### Scenario: Late-connecting client
- **WHEN** a client connects after an owner generation change
- **THEN** it receives `ready` carrying `currentStreamEpoch`
- **AND** a snapshot alone MUST NOT implicitly switch the client's epoch

### Requirement: Allowlist is case-sensitive exact and fail-closed
The experimental identity resolver SHALL match allowlist entries
case-sensitively and MUST reject any ambiguity or miss.

#### Scenario: Allowlist entry matches exactly one security
- **WHEN** the resolver looks up `source=tdx + formatCode + enabled=true +
  status=ACTIVE`
- **THEN** it MUST use `BINARY formatCode = :value` or a post-query
  case-sensitive `===` filter
- **AND** exactly one record MUST match

#### Scenario: Zero or multiple matches
- **WHEN** an allowlist entry matches zero or more than one record
- **THEN** the entire experimental runtime MUST fail closed (refuse to start)

#### Scenario: Empty formatCode
- **WHEN** a source config has `formatCode=''`
- **THEN** it MUST be rejected (not a bug, expected fail-closed behavior)

#### Scenario: Bare-code fallback
- **WHEN** no exact match is found
- **THEN** the resolver MUST NOT fall back to `normalizeSecurityCode` or any
  bare-code guess

### Requirement: Terminal script is a versioned deliverable
The terminal bridge script SHALL carry build identity and operational
documentation.

#### Scenario: Owner registration carries build identity
- **WHEN** the terminal registers with the gateway
- **THEN** it carries `bridgeBuildId`, `bridgeArtifactSha256`,
  `acquisitionProfile`, `schemaVersion`, `draftRevision`
- **AND** the gateway reports `bridgeBuildId` in health

#### Scenario: Callback only marks dirty
- **WHEN** the `subscribe_hq` callback fires
- **THEN** it acquires a `threading.Lock`, adds the code to a bounded
  coalescing set, and returns immediately
- **AND** it MUST NOT call any SDK data method or HTTP inside the callback

### Requirement: Contract tuple is exact-match, no degradation
The Mist experimental client SHALL accept exactly one contract tuple and MUST
NOT degrade or convert on mismatch.

#### Scenario: Contract tuple matches
- **WHEN** `payloadType`/`schemaVersion`/`draftRevision`/`acquisitionProfile`
  match the build's accepted tuple
- **THEN** the client enters subscription state

#### Scenario: Contract tuple mismatches
- **WHEN** any field does not exactly match
- **THEN** the client MUST NOT enter subscription state
- **AND** it records a stable error and metric
- **AND** it does NOT attempt conversion or multi-revision coexistence
