## ADDED Requirements

### Requirement: Private TDX Guard Repository Boundary

The TDX datasource guard SHALL live in the private `mist-deploy` repository and SHALL NOT be packaged into the public Mist backend Docker image or the reusable datasource adapter package.

#### Scenario: Guard files are private operations assets

- **GIVEN** the Mist Docker image build runs in `mist`
- **WHEN** the image is assembled
- **THEN** `tdx-guard` scripts, AutoHotkey files, local config, logs, state, and
  screenshots are not included in the image
- **AND** `tdx-guard` source files are maintained under `mist-deploy`.

#### Scenario: Datasource adapter remains reusable

- **GIVEN** `mist-datasource` is installed or tested outside the Windows API
  machine
- **WHEN** datasource code is packaged, synced, or imported
- **THEN** it does not require AutoHotkey, scheduled tasks, machine-local guard
  config, or bot notification secrets.

### Requirement: Guard Is Not Part Of Ordinary Docker Stack Deployment

The guard SHALL NOT run during normal Docker deployments of `mysql`, `mist-backend`, and `chan-api`.

#### Scenario: Docker stack deploy runs

- **GIVEN** the `Deploy Windows Mist Stack` workflow is triggered
- **WHEN** `scripts/deploy-docker-appliance.ps1` deploys the requested image
- **THEN** it does not invoke `tdx-guard`
- **AND** it does not click or automate the TDX desktop
- **AND** it does not remove or recreate the `mist-tdx-datasource` WinSW
  service.

### Requirement: Deploy Guard Protects Datasource Update And Restart

Deploy Guard SHALL run only as an optional pre-start or pre-update guard for `mist-tdx-datasource` operations that may touch TDX strategy state.

#### Scenario: Datasource restart triggers strategy cleanup

- **GIVEN** `Manage Windows Datasource` is triggered with deploy guarding enabled
- **AND** the requested action will start or restart `mist-tdx-datasource`
- **WHEN** `scripts/manage-tdx-datasource.ps1` reaches the guarded phase
- **THEN** it invokes `tdx-guard/deploy-guard.ps1`
- **AND** `deploy-guard.ps1` stops `mist-tdx-datasource` if needed
- **AND** `deploy-guard.ps1` triggers the `MistDeployGuard` scheduled task
- **AND** datasource management waits for `tdx-guard/state/deploy-result.json`
  before starting the service.

#### Scenario: Strategy cleanup is uncertain

- **GIVEN** Deploy Guard times out or receives a failed result
- **WHEN** `deploy-guard.ps1` exits
- **THEN** it exits non-zero
- **AND** datasource management stops before restarting `mist-tdx-datasource`
- **AND** a guard event is sent when notification is configured.

#### Scenario: Emergency datasource operation bypasses guard

- **GIVEN** an operator needs to manage the datasource service urgently
- **WHEN** guard is disabled for `Manage Windows Datasource` or the local
  management script
- **THEN** the script can still run `status`, `start`, `restart`, or `stop`
  without invoking AutoHotkey.

### Requirement: Deploy Guard Uses Interactive Desktop Automation

Deploy Guard SHALL use a Windows Scheduled Task running in the logged-in user session for TDX GUI automation.

#### Scenario: Runner requests interactive cleanup

- **GIVEN** a GitHub runner service starts datasource management
- **WHEN** Deploy Guard needs to click TDX
- **THEN** PowerShell triggers the `MistDeployGuard` scheduled task
- **AND** the scheduled task is configured to run only when the desktop user is
  logged on
- **AND** AutoHotkey writes a structured result file for the runner-side script.

### Requirement: Runtime Guard Monitors TDX Session Health

Runtime Guard SHALL run independently from GitHub Actions and SHALL monitor TDX session health on the Windows API machine.

#### Scenario: TDX and datasource are healthy

- **GIVEN** the `MistRuntimeGuard` scheduled task runs
- **WHEN** the `mist-tdx-datasource` service and datasource health checks pass
- **THEN** Runtime Guard records a healthy state
- **AND** it does not restart services or send warning notifications.

#### Scenario: TDX appears logged out

- **GIVEN** datasource health or deep-health checks fail repeatedly
- **WHEN** Runtime Guard determines TDX likely requires login
- **THEN** it records `login_required`
- **AND** it sends a notification event
- **AND** it only triggers GUI login automation when `autoLoginEnabled=true`.

#### Scenario: Runtime recovery is confirmed

- **GIVEN** Runtime Guard attempted recovery or the operator restored TDX login
- **WHEN** datasource health checks pass again
- **THEN** Runtime Guard records `recovered`
- **AND** it may restart `mist-tdx-datasource` if the service is stopped or
  stale
- **AND** restart attempts respect configured cooldown.

### Requirement: HTTP Notification Contract

The Windows API machine SHALL send guard notifications as authenticated HTTP JSON events to a LAN receiver and SHALL NOT depend on QQ, NapCat, or AstrBot internals.

#### Scenario: Guard sends notification

- **GIVEN** `notifyUrl` and `notifyToken` are configured
- **WHEN** Deploy Guard or Runtime Guard needs operator attention
- **THEN** it POSTs a JSON event to `notifyUrl`
- **AND** it includes an `Authorization: Bearer <token>` header
- **AND** the payload includes `source`, `component`, `scope`, `level`, `type`,
  `title`, `message`, `time`, and optional `details`.

#### Scenario: Notification receiver is unavailable

- **GIVEN** a guard failure occurred
- **AND** the configured notification receiver is unavailable
- **WHEN** notification delivery fails
- **THEN** the guard logs the notification error
- **AND** it preserves the original guard exit status.

### Requirement: Machine-Local State Is Not Committed

The guard SHALL commit examples and reusable scripts but SHALL keep machine state, secrets, screenshots, and logs local to the Windows API machine.

#### Scenario: Local guard state is generated

- **GIVEN** Deploy Guard or Runtime Guard runs
- **WHEN** it writes result files, logs, screenshots, or local config
- **THEN** those files are written under `tdx-guard/state`,
  `tdx-guard/logs`, `tdx-guard/screenshots`, or `tdx-guard/config.json`
- **AND** repository ignore rules prevent committing them.
