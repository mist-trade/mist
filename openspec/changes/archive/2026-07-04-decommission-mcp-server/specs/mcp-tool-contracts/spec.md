## REMOVED Requirements

### Requirement: MCP tools normalize unknown errors

**Reason**: The MCP server runtime is deleted and no longer exposes callable MCP
tools.

**Migration**: Use `mist-skills` scripts and shared helpers for supported
agent-facing market analysis.

#### Scenario: MCP runtime is inspected

- **WHEN** the active backend repository is inspected
- **THEN** there SHALL be no `apps/mcp-server` runtime that needs MCP tool error
  normalization

### Requirement: Unimplemented MCP tools are not exposed as normal tools

**Reason**: The MCP server runtime is deleted, so placeholder MCP tools cannot
be registered.

**Migration**: Unsupported skills behavior SHALL be handled in `mist-skills`
scripts and tests.

#### Scenario: MCP providers are inspected

- **WHEN** the active backend repository is inspected
- **THEN** there SHALL be no MCP provider list that can expose placeholder tools

### Requirement: MCP base response types avoid broad any metadata

**Reason**: The MCP base service is deleted with the MCP runtime.

**Migration**: Type hygiene for active tool integrations SHALL be enforced in
`mist-skills` and active backend REST code instead.

#### Scenario: MCP base service is inspected

- **WHEN** the active backend repository is inspected
- **THEN** there SHALL be no `BaseMcpToolService` metadata boundary to maintain
