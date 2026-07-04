## MODIFIED Requirements

### Requirement: Local compose uses compiled production commands

The local backend Docker Compose file SHALL run supported production backend
services from the built image and SHALL NOT define an MCP server service.

#### Scenario: Local compose services are inspected

- **WHEN** the local Docker Compose file is inspected
- **THEN** it SHALL define the supported backend service entries only
- **AND** it SHALL NOT define an `mcp-server` service
- **AND** it SHALL NOT publish port `8009`
- **AND** it SHALL NOT run `dist/apps/mcp-server/main.js`

#### Scenario: Backend Docker build is inspected

- **WHEN** the backend package scripts are inspected
- **THEN** `build:docker` SHALL build the supported backend applications
- **AND** it SHALL NOT compile `mcp-server`
- **AND** it SHALL NOT reference `start:dev:mcp-server`
