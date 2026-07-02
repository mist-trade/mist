## ADDED Requirements

### Requirement: Selected backend runtime P2 findings are explicit

This remediation batch SHALL select CODE_REVIEW H3 and CODE_SMELL_REVIEW D1.7,
R1.7, R1.9, P1.4, T1.1, T1.3, M1.1, B1.5, U1.2, U1.4, and O1.6 for
implementation in the `mist` backend.

#### Scenario: Batch evidence is audited

- **WHEN** the change is ready for archive
- **THEN** its evidence MUST map every selected review ID to changed files and
  verification commands
- **AND** the implementation MUST NOT claim unrelated P2 findings are complete

### Requirement: Backend source typing and period mapping are explicit

Backend collection and indicator paths SHALL use explicit source and period
types instead of `any` or double period casts.

#### Scenario: Source map typing is checked

- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it MUST fail if `CollectorService` declares
  `ISourceFetcher<any>`

#### Scenario: Indicator query period is preserved

- **WHEN** `IndicatorService.findKData` queries K rows
- **THEN** it MUST pass the `Period` enum value directly to TypeORM without
  converting through `String(...) as unknown as Period`

#### Scenario: TDX bar periods use the shared mapper

- **WHEN** TDX WebSocket bar messages arrive with source-specific period tokens
- **THEN** the service MUST map them through shared `PeriodMappingService`
  behavior rather than a local duplicate table

### Requirement: TDX WebSocket timing is centralized

TDX WebSocket reconnect and heartbeat timing values SHALL be named constants
with ConfigService overrides.

#### Scenario: Timing config is absent

- **WHEN** no timing config is provided
- **THEN** reconnect delay MUST default to 5000 ms
- **AND** heartbeat interval MUST default to 30000 ms

#### Scenario: Timing config is provided

- **WHEN** `TDX_WS_RECONNECT_DELAY_MS` and `TDX_WS_HEARTBEAT_INTERVAL_MS` are
  configured
- **THEN** TDX WebSocket scheduling MUST use the configured values

### Requirement: Backend query and save paths avoid duplicated builders

Selected backend query and WebSocket persistence paths SHALL route through
small local helpers instead of duplicating the same query/save chain.

#### Scenario: MCP K-line queries are built

- **WHEN** daily, intraday, or latest K-line MCP methods query K rows
- **THEN** they MUST use a shared helper for common security/source/period
  filtering, ordering, limit, and optional date conditions

#### Scenario: Latest data is returned

- **WHEN** `getLatestData` fetches daily and intraday rows
- **THEN** each returned period key MUST be assigned from its own structured
  period result instead of relying on array index positions

#### Scenario: WebSocket KData is saved

- **WHEN** TDX realtime bars or completed candles are persisted
- **THEN** both paths MUST use a shared save helper that normalizes security,
  constructs KData, saves through `CollectorService`, and logs the result

### Requirement: Chan and EF invariants are explicit

Selected Chan merge and EF extension invariants SHALL fail clearly and keep
nullable semantics aligned with database metadata.

#### Scenario: Chan merge input is incomplete

- **WHEN** Bi merge helpers receive values without required start/end Fenxing
- **THEN** they MUST throw a clear invariant error instead of dereferencing a
  non-null assertion

#### Scenario: Chan analysis runs once

- **WHEN** MCP `analyze_chan_theory` runs
- **THEN** it MUST reuse one Chan analysis result for Bi and Fenxing output
  rather than invoking separate merge-dependent service calls

#### Scenario: EF extension metadata is inspected

- **WHEN** extension schema tests run
- **THEN** nullable `KExtensionEf` fields MUST use `null` TypeScript defaults
  instead of `0` or `0n` defaults that imply non-null values
