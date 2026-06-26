# Spec: TDX datasource Windows service

## ADDED Requirements

### Requirement: WinSW service wrapper
The TDX datasource SHALL provide a WinSW service definition for running the
Python datasource as a Windows service.

#### Scenario: Service is installed
- **WHEN** the operator installs the TDX datasource service
- **THEN** Windows registers a WinSW-managed service named
  `mist-tdx-datasource` with the configured working directory, Python
  executable, module arguments, restart policy, and log rolling settings

#### Scenario: Service restarts after failure
- **WHEN** the Python datasource process exits unexpectedly
- **THEN** WinSW applies the configured restart delays and records stdout and
  stderr logs without requiring Python to supervise itself

### Requirement: Service configuration
The TDX datasource SHALL read service configuration from environment variables
or an environment file owned by the datasource package.

#### Scenario: Configuration is loaded
- **WHEN** the service starts
- **THEN** it reads `TDX_HTTP_URL`, `TDX_PATH`, `DATASOURCE_HOST`,
  `DATASOURCE_PORT`, `TDX_MINUTE_PERIOD`,
  `TDX_COLLECT_DELAY_SECONDS`, `TDX_RETRY_DELAY_SECONDS`,
  `TDX_RECONCILE_INTERVAL_SECONDS`, `TDX_MAX_SUBSCRIPTIONS`, and
  `TDX_WS_QUEUE_MAX_SIZE`

#### Scenario: Proprietary SDK files are external
- **WHEN** the service is packaged or installed
- **THEN** the package references TDX client and SDK paths by configuration and
  MUST NOT bundle proprietary TongDaXin binaries or SDK files

### Requirement: Service lifecycle scripts
The datasource SHALL provide idempotent scripts to install, update, start, stop,
query, and uninstall the WinSW service.

#### Scenario: Re-running install
- **WHEN** the operator runs the install script for an already installed
  `mist-tdx-datasource` service
- **THEN** the script updates the managed service definition without creating a
  duplicate service

#### Scenario: Uninstalling service
- **WHEN** the operator runs the uninstall script
- **THEN** the script stops and removes only the managed
  `mist-tdx-datasource` service and does not remove unrelated Windows services

### Requirement: Legacy NSSM migration
The Windows deployment path SHALL define how to migrate from the legacy NSSM
`MistTDX` service to the WinSW `mist-tdx-datasource` service.

#### Scenario: Legacy service exists
- **WHEN** installation detects a legacy NSSM-managed `MistTDX` service on the
  same datasource port
- **THEN** the migration instructions require stopping or disabling the legacy
  service before starting `mist-tdx-datasource`

#### Scenario: Backend base URL changes
- **WHEN** the new service uses a different host or port from the legacy
  service
- **THEN** the Windows deployment docs instruct the operator to update the Mist
  backend `TDX_BASE_URL`

### Requirement: Health and smoke verification
The Windows service package SHALL include a smoke test that verifies the
datasource service, TDX reachability, WebSocket bridge state, and core
normalized APIs.

#### Scenario: Health smoke test
- **WHEN** the service is started on the Windows API machine
- **THEN** the smoke test calls `/health` and verifies service status,
  `tdxHttpReachable`, `tqInitialized`, `eventQueueDepth`, and collector state

#### Scenario: Normalized API smoke test
- **WHEN** TDX is running and authorized
- **THEN** the smoke test can call `/v1/raw/tdx/call`, `/v1/bars/query`, and
  open the normalized WebSocket bridge for `sync_subscriptions` with a
  configured test symbol

#### Scenario: Restart recovery smoke test
- **WHEN** the `mist-tdx-datasource` service is restarted
- **THEN** the smoke test verifies NestJS or the smoke client can reconnect,
  send `sync_subscriptions`, and observe `/health` reporting the collector
  state after startup

### Requirement: Logging
The WinSW service SHALL write datasource stdout and stderr logs with bounded
retention.

#### Scenario: Log files roll by size
- **WHEN** datasource logs reach the configured size threshold
- **THEN** WinSW rolls log files and keeps no more than the configured number of
  retained files

### Requirement: Windows appliance documentation
The Mist Windows deployment documentation SHALL describe the new TDX datasource
service name, port, health URL, install flow, uninstall flow, logs, and
rollback path.

#### Scenario: Operator reads deployment docs
- **WHEN** an operator follows the Windows datasource deployment documentation
- **THEN** the docs identify `mist-tdx-datasource` as the WinSW service and show
  how to install it, verify it, inspect logs, update `TDX_BASE_URL`, and roll
  back to the legacy service during migration

### Requirement: Guard integration boundary
The Windows service migration SHALL keep TDX desktop login and strategy cleanup
outside the public datasource service while exposing enough health state for a
private guard to act.

#### Scenario: TDX login is lost
- **WHEN** the TDX terminal is closed, logged out, or missing authorization
- **THEN** the datasource health response reports the failure state and the
  service does not attempt GUI login automation itself

#### Scenario: Private guard controls service
- **WHEN** a private operations guard needs to restart or inspect the datasource
  service
- **THEN** it can use the configured service name and health URL without
  relying on NSSM-specific commands
