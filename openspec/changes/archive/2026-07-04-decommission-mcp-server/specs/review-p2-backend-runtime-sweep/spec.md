## MODIFIED Requirements

### Requirement: Backend query and save paths avoid duplicated builders

Selected backend query and WebSocket persistence paths SHALL route through
small local helpers instead of duplicating the same query/save chain. MCP query
builder cleanup is retired because the MCP server app is deleted.

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
nullable semantics aligned with database metadata. MCP-specific Chan analysis
cleanup is retired because the MCP server app is deleted.

#### Scenario: Chan merge input is incomplete

- **WHEN** Bi merge helpers receive values without required start/end Fenxing
- **THEN** they MUST throw a clear invariant error instead of dereferencing a
  non-null assertion

#### Scenario: EF extension metadata is inspected

- **WHEN** extension schema tests run
- **THEN** nullable `KExtensionEf` fields MUST use `null` TypeScript defaults
  instead of `0` or `0n` defaults that imply non-null values
