## ADDED Requirements

### Requirement: Private TDX Guard Repository Boundary

The TDX desktop guard SHALL live in the private `mist-deploy` repository and SHALL NOT be packaged into the public Windows API appliance artifact.

#### Scenario: Guard files are private operations assets

- **GIVEN** the Windows appliance build runs in `mist`
- **WHEN** the appliance zip is assembled
- **THEN** `tdx-guard` scripts, AutoHotkey files, local config, logs, state, and
  screenshots are not included in the appliance zip.
- **AND** `tdx-guard` source files are maintained under `mist-deploy`.

### Requirement: Deploy Guard Uses Interactive Desktop Automation

Deploy Guard SHALL use a Windows Scheduled Task running in the logged-in user session for TDX GUI automation.

#### Scenario: Deployment triggers strategy cleanup

- **GIVEN** `scripts/deploy-appliance.ps1` has stopped `MistTDX`
- **WHEN** TDX deploy guarding is enabled
- **THEN** the deployment invokes `tdx-guard/deploy-guard.ps1`
- **AND** `deploy-guard.ps1` triggers the `MistDeployGuard` scheduled task
- **AND** deployment waits for `tdx-guard/state/deploy-result.json`.

#### Scenario: Strategy cleanup is uncertain

- **GIVEN** Deploy Guard times out or receives a failed result
- **WHEN** `deploy-guard.ps1` exits
- **THEN** it exits non-zero
- **AND** appliance deployment stops before reinstalling datasource services
- **AND** a guard event is sent when notification is configured.

### Requirement: Runtime Guard Monitors TDX Session Health

Runtime Guard SHALL run independently from GitHub Actions and SHALL monitor TDX session health on the Windows API machine.

#### Scenario: TDX health is healthy

- **GIVEN** the `MistRuntimeGuard` scheduled task runs
- **WHEN** `MistTDX` service and TDX health checks pass
- **THEN** Runtime Guard records a healthy state
- **AND** it does not restart services or send warning notifications.

#### Scenario: TDX appears logged out

- **GIVEN** `MistTDX` health or deep-health checks fail repeatedly
- **WHEN** Runtime Guard determines TDX likely requires login
- **THEN** it records `login_required`
- **AND** it sends a notification event
- **AND** it only triggers GUI login automation when `autoLoginEnabled=true`.

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
