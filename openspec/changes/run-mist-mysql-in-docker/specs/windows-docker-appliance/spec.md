## ADDED Requirements

### Requirement: Docker compose runs production Mist services
The system SHALL provide a production Docker Compose deployment for the Windows
API machine that runs MySQL, `apps/mist`, and `apps/chan`.

#### Scenario: Production compose starts required services
- **WHEN** the operator starts the production Docker Compose stack on the Windows API machine
- **THEN** the stack starts MySQL, `mist-backend`, and `chan-api`
- **AND** `mist-backend` exposes port `8001`
- **AND** `chan-api` exposes port `8008`

#### Scenario: Schedule is excluded from default production compose
- **WHEN** the operator starts the default production Docker Compose stack
- **THEN** `apps/schedule` is not started by default
- **AND** no schedule container performs cron-based data collection

### Requirement: Datasource remains a Windows host service
The system SHALL keep the TDX datasource adapter outside Docker as the
WinSW-managed `mist-tdx-datasource` Windows service.

#### Scenario: Containers use host datasource URL
- **WHEN** `mist-backend` or `chan-api` starts in Docker
- **THEN** the service is configured with `TDX_BASE_URL=http://host.docker.internal:9001`
- **AND** the service does not call TDX native HTTP or SDKs directly

#### Scenario: Datasource service is not replaced by Docker
- **WHEN** the Docker deployment is installed or upgraded
- **THEN** the deployment does not install a datasource container
- **AND** the deployment does not remove or replace the `mist-tdx-datasource` WinSW service

### Requirement: Docker and datasource roots are independently configurable
The system SHALL allow Docker deployment state and datasource service state to
live under separate root directories.

#### Scenario: Docker root and datasource root use different drives
- **WHEN** the operator configures Docker root as `E:\quant\MistDocker`
- **AND** the operator configures datasource root as `F:\quant\MistAPI\datasource`
- **THEN** deployment scripts use the Docker root for Compose files, Docker
  environment, MySQL data, backups, and diagnostics
- **AND** deployment scripts use the datasource root for datasource `.env`,
  WinSW service files, and datasource logs

### Requirement: MySQL state is persistent and backed up explicitly
The system SHALL persist MySQL data across container restarts and provide an
explicit backup path before upgrades that may change the database schema.

#### Scenario: MySQL data survives container recreation
- **WHEN** the MySQL container is recreated during a normal Mist deployment with
  `MYSQL_DATA_DIR=E:\quant\MistDocker\mysql-data`
- **THEN** existing MySQL data remains available after the new container starts

#### Scenario: Deployment creates pre-upgrade database backup
- **WHEN** a deployment includes database migrations
- **THEN** the deployment creates or requires a MySQL backup before applying the migrations
- **AND** the backup location is recorded in the deployment output

### Requirement: Database migrations follow the Mist release
The system SHALL run Mist database migrations as an explicit deployment step
before updated Mist application containers are considered healthy.

#### Scenario: Deployment applies migrations before health check
- **WHEN** the deployment updates the Mist image tag
- **THEN** the deployment runs the configured migration step against the MySQL container
- **AND** the deployment runs backend health checks only after migrations succeed

#### Scenario: Failed migration blocks application rollout
- **WHEN** the migration step fails
- **THEN** the deployment does not report the Mist Docker stack as healthy
- **AND** the deployment prints the migration log location

### Requirement: Hybrid health checks cover Docker and WinSW components
The system SHALL verify both Docker-managed services and the host-managed
datasource service during deployment and operator health checks.

#### Scenario: Health check validates full hybrid stack
- **WHEN** the operator runs the production health check
- **THEN** it checks Docker Compose service status for MySQL, `mist-backend`,
  and `chan-api`
- **AND** it checks `mist-backend` HTTP health on port `8001`
- **AND** it checks `chan-api` HTTP availability on port `8008`
- **AND** it checks the datasource health endpoint through the same URL used by
  the containers

### Requirement: Diagnostics collect Docker and datasource logs together
The system SHALL provide a single diagnostics collection command that captures
the relevant Docker and WinSW state into a timestamped diagnostics directory.

#### Scenario: Operator collects diagnostics
- **WHEN** the operator runs the diagnostics collection command
- **THEN** the command writes Docker Compose status, Docker logs for MySQL,
  `mist-backend`, and `chan-api`, datasource WinSW service status, datasource
  logs, health-check output, and deployment metadata into one timestamped
  directory

#### Scenario: Deployment saves diagnostic snapshot
- **WHEN** a deployment completes or fails
- **THEN** the deployment saves a short diagnostic snapshot that includes recent
  Docker logs and datasource service state
