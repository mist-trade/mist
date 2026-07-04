# mist-production-baseline Specification

## Purpose
TBD - created by archiving change verify-mist-production-baseline. Update Purpose after archive.
## Requirements
### Requirement: Baseline records immutable production inputs
The production baseline SHALL record immutable inputs for every repository,
image, workflow, and runtime root used by the deployment.

#### Scenario: Backend and frontend image refs are recorded
- **WHEN** the baseline evidence is written
- **THEN** it MUST record the `mist` commit SHA and backend image tag
- **AND** it MUST record the `mist-fe` commit SHA and frontend image tag
- **AND** it MUST state whether either image tag was `latest`

#### Scenario: Datasource and deploy refs are recorded
- **WHEN** the baseline evidence is written
- **THEN** it MUST record the `mist-datasource` commit SHA or deployed ref
- **AND** it MUST record the `mist-deploy` commit SHA used for workflows and
  scripts
- **AND** it MUST record `docker_root` and `datasource_root`

#### Scenario: Monitoring ref is included when monitored baseline is in scope
- **WHEN** the baseline includes monitoring deployment evidence
- **THEN** it MUST record the `mist-monitoring` commit SHA
- **AND** it MUST record the Windows exporter endpoint and Mac watchdog endpoint

### Requirement: Deployment evidence proves the hybrid stack was deployed
The production baseline SHALL include evidence from the Windows deployment path
that starts the Docker stack while preserving the host datasource service.

#### Scenario: Deploy workflow evidence is captured
- **WHEN** `Deploy Windows Mist Stack` is used for the baseline
- **THEN** the evidence MUST record the GitHub Actions workflow run identifier
- **AND** it MUST record the workflow inputs for backend image, frontend image,
  previous image tags when provided, Docker root, datasource root, migration,
  backup, and health-check flags

#### Scenario: Deploy output includes backup and diagnostics paths
- **WHEN** deployment completes
- **THEN** the evidence MUST record the MySQL backup path printed by the deploy
- **AND** it MUST record the diagnostics path printed by the deploy

#### Scenario: Datasource service is not replaced by app deploy
- **WHEN** deployment evidence is reviewed
- **THEN** it MUST show that the Docker app deploy did not reinstall, remove, or
  replace the host `mist-tdx-datasource` WinSW service

### Requirement: Health evidence covers host, containers, gateway, and datasource
The production baseline SHALL include hybrid health evidence for Docker
services, HTTP endpoints, gateway routing, and container-to-host datasource
reachability.

#### Scenario: Docker and app health checks pass
- **WHEN** the health check is captured
- **THEN** it MUST show MySQL, `mist-backend`, `chan-api`, `mist-fe`, and
  `web-gateway` running under Docker Compose
- **AND** it MUST show backend health on `http://127.0.0.1:8001/app/hello`
- **AND** it MUST show Chan API health on `http://127.0.0.1:8008/app/hello`

#### Scenario: Gateway health checks pass
- **WHEN** gateway health evidence is captured on the Windows API machine
- **THEN** it MUST show the gateway frontend path responding
- **AND** it MUST show `/api/mist/app/hello` responding through the gateway
- **AND** it MUST show `/api/chan/app/hello` responding through the gateway

#### Scenario: Datasource health is checked from host and container
- **WHEN** datasource health evidence is captured
- **THEN** it MUST show host-side datasource health
- **AND** it MUST show the backend container can reach
  `http://host.docker.internal:9001/health`

### Requirement: Datasource runtime smoke proves business datasource paths
The production baseline SHALL include datasource runtime smoke evidence from
the deployed datasource scripts.

#### Scenario: Default runtime smoke is captured
- **WHEN** the default datasource runtime smoke runs
- **THEN** the evidence MUST show health, provider manifest, normalized bars,
  snapshots, sectors, calendar or security paths, and WebSocket ping/pong
  checks

#### Scenario: Optional datasource smoke modes are captured when used
- **WHEN** reference, finance/report, formula, or live quote smoke switches are
  used
- **THEN** the evidence MUST record the exact switches
- **AND** it MUST record whether the smoke was state-changing

#### Scenario: Live quote smoke is explicit
- **WHEN** `-RequireLiveQuote` is used
- **THEN** the evidence MUST record whether
  `-AllowWebSocketSubscriptionChange` was used
- **AND** it MUST record that the operator accepted subscription ownership risk
  for that smoke run

### Requirement: Backup restore rehearsal proves database recoverability
The production baseline SHALL include a MySQL restore rehearsal against a
non-production temporary database container.

#### Scenario: Restore rehearsal uses the deploy backup
- **WHEN** the restore rehearsal runs
- **THEN** it MUST use the MySQL backup path recorded from the deployment
- **AND** it MUST NOT import into the production MySQL container

#### Scenario: Restore rehearsal validates schema state
- **WHEN** the restore rehearsal completes
- **THEN** the evidence MUST show the temporary database imported successfully
- **AND** it MUST show `schema_migrations` validation or an equivalent schema
  validation result

### Requirement: Mac-side probes prove LAN and browser entrypoint reachability
The production baseline SHALL include Mac-side probes for the browser gateway
and proxied API paths.

#### Scenario: Mac probes raw Windows host or configured DNS
- **WHEN** Mac-side smoke is captured
- **THEN** it MUST record the Windows LAN IP or hostname used
- **AND** it MUST record whether `/etc/hosts` or LAN DNS was required

#### Scenario: Mac probes gateway paths
- **WHEN** Mac-side smoke is captured
- **THEN** it MUST show the frontend gateway path responding
- **AND** it MUST show `/api/mist/app/hello` responding
- **AND** it MUST show `/api/chan/app/hello` responding

### Requirement: Baseline evidence is redacted and reviewable
The production baseline SHALL be recorded in a reviewable evidence document
without secrets.

#### Scenario: Evidence document is created
- **WHEN** the baseline verification work is complete
- **THEN** a Markdown evidence document MUST exist under the change evidence
  directory or another explicitly named docs path
- **AND** it MUST summarize refs, commands, workflow runs, backup path,
  diagnostics path, smoke results, Mac probes, blockers, and residual risks

#### Scenario: Secrets are redacted
- **WHEN** evidence is committed or shared
- **THEN** it MUST NOT include passwords, tokens, cookies, private `.env`
  values, or raw logs containing secrets

### Requirement: Baseline completion is blocked by missing critical evidence
The production baseline SHALL remain incomplete when required evidence is
missing or failed.

#### Scenario: Critical check fails
- **WHEN** deployment, health, datasource smoke, restore rehearsal, or Mac-side
  gateway probe fails
- **THEN** the evidence MUST record the failure
- **AND** the baseline MUST NOT be marked known-good

#### Scenario: Check is intentionally deferred
- **WHEN** a required check cannot be performed in the current session
- **THEN** the evidence MUST record the blocker
- **AND** it MUST identify the exact command or workflow needed to finish the
  check later
