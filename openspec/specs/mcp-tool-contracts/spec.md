# mcp-tool-contracts Specification

## Purpose
TBD - created by archiving change fix-mcp-skills-contracts. Update Purpose after archive.
## Requirements
### Requirement: MCP tools normalize unknown errors

The MCP server SHALL convert any caught unknown value into a safe error message
before logging or returning an MCP tool error response.

#### Scenario: Tool throws non-Error value

- **WHEN** an MCP tool throws a string, object, null, or undefined value
- **THEN** the base tool wrapper MUST return a failed response with a readable
  message
- **AND** it MUST NOT throw a secondary `Cannot read properties` error

#### Scenario: Tool throws McpError

- **WHEN** an MCP tool throws `McpError`
- **THEN** the failed response MUST preserve the structured MCP error code and
  recovery suggestions

### Requirement: Unimplemented MCP tools are not exposed as normal tools

The MCP server SHALL NOT expose placeholder tools as normal callable MCP tools.

#### Scenario: Segment algorithm is not implemented

- **WHEN** the Segment algorithm is still unavailable
- **THEN** `create_segment` and `create_segment_channel` MUST either be absent
  from the registered MCP provider set
- **OR** they MUST return a structured `not_implemented` MCP error

#### Scenario: MCP module provider list is inspected

- **WHEN** tests inspect the MCP server module provider list
- **THEN** unimplemented Segment placeholder services MUST NOT be registered as
  ordinary providers

### Requirement: MCP base response types avoid broad any metadata

The MCP base service SHALL use `Record<string, unknown>` for metadata-like
payloads unless a narrower type is available.

#### Scenario: Success response includes metadata

- **WHEN** a tool returns success metadata
- **THEN** the base response helper MUST accept unknown-valued metadata without
  using `Record<string, any>`

#### Scenario: Error response includes next tool params

- **WHEN** an MCP recovery suggestion includes next-tool params
- **THEN** those params MUST use unknown-valued records instead of broad `any`
  records

