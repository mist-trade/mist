## MODIFIED Requirements

### Requirement: Docker compose runs production Mist services
The system SHALL provide a production Docker Compose deployment for the Windows
API machine that runs MySQL, `apps/mist`, `apps/chan`, `mist-fe`, and the nginx
web gateway.

#### Scenario: Production compose starts required services
- **WHEN** the operator starts the production Docker Compose stack on the Windows API machine
- **THEN** the stack starts MySQL, `mist-backend`, `chan-api`, `mist-fe`, and
  `web-gateway`
- **AND** `mist-backend` exposes port `8001`
- **AND** `chan-api` exposes port `8008`
- **AND** `web-gateway` exposes the configured browser entrypoint port

#### Scenario: Schedule is excluded from default production compose
- **WHEN** the operator starts the default production Docker Compose stack
- **THEN** `apps/schedule` is not started by default
- **AND** no schedule container performs cron-based data collection

### Requirement: Hybrid health checks cover Docker and WinSW components
The system SHALL verify Docker-managed services, the nginx web gateway, and the
host-managed datasource service during deployment and operator health checks.

#### Scenario: Health check validates full hybrid stack
- **WHEN** the operator runs the production health check
- **THEN** it checks Docker Compose service status for MySQL, `mist-backend`,
  `chan-api`, `mist-fe`, and `web-gateway`
- **AND** it checks `mist-backend` HTTP health on port `8001`
- **AND** it checks `chan-api` HTTP availability on port `8008`
- **AND** it checks the nginx gateway frontend path
- **AND** it checks the nginx gateway `/api/mist/app/hello` and
  `/api/chan/app/hello` proxy paths
- **AND** it checks the datasource health endpoint through the same URL used by
  the containers

## ADDED Requirements

### Requirement: Windows nginx proxies to frontend service
The Windows Docker deployment SHALL keep nginx on the Windows API machine while
proxying the frontend path to the local `mist-fe` service.

#### Scenario: Operator routes browser traffic through nginx
- **WHEN** the operator starts the Windows Docker stack
- **THEN** nginx SHALL proxy `/` to `mist-fe:3000`
- **AND** nginx SHALL proxy `/api/mist/*` to `mist-backend:8001`
- **AND** nginx SHALL proxy `/api/chan/*` to `chan-api:8008`
- **AND** nginx SHALL NOT proxy browser traffic to the datasource port `9001`

#### Scenario: Operator deploys frontend image tag
- **WHEN** the operator runs `Deploy Windows Mist Stack` with a frontend image
  repository and frontend image tag
- **THEN** the workflow SHALL pass that value to the deployment script
- **AND** the deployment script SHALL write `MIST_FE_IMAGE` and
  `MIST_FE_IMAGE_TAG` into `E:\quant\MistDocker\.env`

#### Scenario: Operator rolls back frontend image tag
- **WHEN** the deployment fails and `previous_frontend_image_tag` is provided
- **THEN** rollback SHALL restore `MIST_FE_IMAGE_TAG` before restarting app
  services
- **AND** rollback SHALL keep the frontend tag unchanged when no previous
  frontend image tag is provided
