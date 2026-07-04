## REMOVED Requirements

### Requirement: MCP and backend style cleanup remains scoped

**Reason**: The selected MCP service files and `BaseMcpToolService` are deleted
as part of MCP server decommissioning, so MCP style cleanup is no longer an
active review requirement.

**Migration**: Backend style cleanup remains covered by active backend specs and
tests that do not depend on MCP service files.

#### Scenario: MCP cleanup contract is inspected

- **WHEN** `node tools/test-ci-contracts.mjs` runs
- **THEN** it SHALL NOT inspect deleted MCP service files for style cleanup
