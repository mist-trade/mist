## MODIFIED Requirements

### Requirement: AstrBot shall use mist-skills as the Mist integration layer
The system SHALL integrate the deployed NapCat-AstrBot runtime and supported
agent-facing tool use with Mist through `mist-skills`, not through MCP Server or
Saya.

#### Scenario: User requests market analysis from QQ
- **GIVEN** a QQ user sends a supported market-analysis request
- **AND** AstrBot has loaded the relevant `mist-skills` Skill
- **WHEN** AstrBot executes the Skill script
- **THEN** the script SHALL call the Mist REST API
- **AND** AstrBot SHALL return the result through NapCat

#### Scenario: Agent tool integration is inspected
- **WHEN** a user inspects the supported agent-facing Mist tool path
- **THEN** documentation SHALL point to `mist-skills`
- **AND** the repository SHALL NOT advertise `apps/mcp-server` or `mist-mcp`
  as a supported runtime
