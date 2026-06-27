# Capability: Windows API appliance

## ADDED Requirements

### Requirement: The Windows API machine shall host the complete Mist API path

The deployment SHALL place MySQL, `mist-datasource`, and `MistBackend` on the
Windows machine that has market-data authorization.

#### Scenario: Mac calls Mist over LAN

- GIVEN the Windows API machine is installed and running
- AND the Mac is on the same LAN
- WHEN `MIST_API_BASE_URL` is set to `http://192.168.31.x:8001`
- THEN `mist-skills` SHALL call `MistBackend` over HTTP
- AND no datasource SDK SHALL be required on the Mac

### Requirement: Redis shall be optional for the first appliance release

The first appliance release SHALL NOT require Redis to install or run the
supported query API path.

#### Scenario: Redis is not installed

- GIVEN MySQL, datasource services, and `MistBackend` are installed
- AND Redis is not installed
- WHEN the operator runs the first appliance health check
- THEN Redis absence SHALL NOT fail the health check

### Requirement: The appliance package shall not bundle proprietary datasource SDKs

The release artifact SHALL NOT include TDX or QMT proprietary SDK files.

#### Scenario: TDX SDK is already installed

- GIVEN the operator has TDX SDK installed at `D:/tdx/PYPlugins`
- AND `TDX_SDK_PATH` points to `D:/tdx/PYPlugins/user`
- WHEN the datasource preflight runs
- THEN it SHALL verify `tqcenter.py`
- AND it SHALL verify `TPythClient.dll` in the parent directory
- AND it SHALL use the existing SDK in place

#### Scenario: TDX SDK path is moved incorrectly

- GIVEN `TDX_SDK_PATH` points to a directory containing `tqcenter.py`
- AND the parent directory does not contain `TPythClient.dll`
- WHEN the datasource preflight runs
- THEN installation SHALL fail with a clear SDK layout error

### Requirement: The package shall be a Windows zip artifact

The first production deployment package SHALL be a Windows zip artifact, not a
single-file exe.

#### Scenario: GitHub Actions builds a release package

- GIVEN the Windows appliance workflow runs successfully
- WHEN packaging completes
- THEN it SHALL upload `mist-api-appliance-win-x64.zip`
- AND it SHALL include a manifest with source commits and runtime versions

### Requirement: Services shall be installed with stable working directories

The installer SHALL register Windows services with working directories that let
each app read its local `.env` file.

#### Scenario: MistBackend starts as a Windows service

- GIVEN the backend package has a configured `.env`
- WHEN `MistBackend` starts through legacy service wrapper
- THEN its working directory SHALL be the backend package directory
- AND the backend SHALL read the package-local `.env`

### Requirement: Datasource services shall default to localhost binding

The datasource services SHALL bind to localhost by default because only
`MistBackend` needs to call them.

#### Scenario: TDX datasource starts

- GIVEN `MistTDX` is installed
- WHEN the service starts
- THEN it SHALL listen on `127.0.0.1:9001` by default
- AND it SHALL NOT need to be reachable from the Mac

### Requirement: Datasource service registration shall be idempotent

The datasource installer SHALL reconcile `MistTDX` and `MistQMT` legacy service wrapper services
to the desired appliance configuration each time the service step runs.

#### Scenario: Existing datasource service is updated

- GIVEN `MistTDX` already exists as a Mist datasource service
- AND the operator extracted a newer appliance package
- WHEN the datasource service installation step runs
- THEN the installer SHALL update the service working directory, command,
  service parameters, log paths, start mode, and restart policy
- AND it SHALL NOT require the operator to remove and recreate the service by
  hand

#### Scenario: Existing unrelated service is not overwritten

- GIVEN a Windows service named `MistTDX` exists
- AND its configuration does not point at a Mist datasource installation
- WHEN the datasource service installation step runs
- THEN installation SHALL fail with a clear service ownership message
- AND it SHALL NOT overwrite the unrelated service configuration

### Requirement: Datasource services shall prevent unbounded crash loops

Datasource services SHALL avoid rapid or unbounded restart loops when SDK
initialization, environment configuration, or port binding repeatedly fails.

#### Scenario: Transient datasource crash is retried with delay

- GIVEN `MistTDX` exits unexpectedly once
- WHEN legacy service wrapper handles the exit
- THEN the service SHALL restart only after a configured delay
- AND the restart SHALL NOT happen in a tight immediate loop

#### Scenario: Repeated datasource crashes stop the service

- GIVEN `MistTDX` crashes repeatedly within the configured crash window
- WHEN the datasource service runner reaches the maximum crash count
- THEN it SHALL exit with a sentinel code
- AND legacy service wrapper SHALL stop retrying that service
- AND the logs SHALL explain that crash-loop protection stopped the service

### Requirement: MistBackend shall be LAN reachable

`MistBackend` SHALL be reachable from the Mac or LLM machine over the LAN.

#### Scenario: Remote health check

- GIVEN Windows firewall allows LAN access to port `8001`
- WHEN the Mac calls `http://192.168.31.x:8001/app/hello`
- THEN the request SHALL succeed

### Requirement: Database initialization shall be explicit

The installer SHALL provide an explicit database initialization or import path.

#### Scenario: Production database is empty

- GIVEN `NODE_ENV=production`
- AND the target MySQL database has not been initialized
- WHEN the operator runs installation
- THEN the installer SHALL require schema initialization or dump import
- AND it SHALL NOT silently start the backend against an empty database
