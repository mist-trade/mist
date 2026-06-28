## Why

The current Windows API appliance packages `MistBackend` and portable MySQL as
Windows-managed runtime components, which makes every frequent Mist backend
iteration heavier than necessary. The intended production split is now clearer:
`mist` and MySQL should run under Docker Desktop on the Windows API machine,
while the low-churn Windows-only datasource bridge remains a WinSW service on
the host.

## What Changes

- Add a production Docker Compose deployment path for `apps/mist`, `apps/chan`,
  and MySQL on the Windows API machine.
- Keep `mist-tdx-datasource` deployed on the Windows host through WinSW, with
  TDX Desktop, SDK paths, login state, and strategy cleanup outside Docker.
- Configure containerized Mist services to reach the host datasource through
  `TDX_BASE_URL=http://host.docker.internal:9001`.
- Replace the first-choice production path for `MistBackend` and MySQL from
  appliance-local WinSW/portable runtime management to Docker image and Compose
  management.
- Do not deploy `apps/schedule` in the first Docker production compose because
  its current behavior is still under review and appears tied to EastMoney
  polling.
- Add deployment diagnostics that collect Docker service state, Docker logs,
  datasource WinSW state/logs, and health-check output in one place.
- Keep rollback based on Docker image tags for Mist services and explicit MySQL
  backups for database state.

## Capabilities

### New Capabilities

- `windows-docker-appliance`: Defines the hybrid Windows production deployment
  where Docker Desktop runs `mist`, `chan`, and MySQL, while WinSW keeps running
  the host-only datasource adapter.

### Modified Capabilities

- None. The datasource contract remains the existing normalized backend-to-
  datasource boundary; this change modifies production deployment shape rather
  than product API behavior.

## Impact

- `mist` Dockerfile, production Compose configuration, image entrypoints, and
  release workflow assumptions.
- `mist-deploy` deployment scripts and documentation, moving from downloading a
  Windows appliance zip to managing Docker Compose state plus the existing
  datasource WinSW service.
- MySQL persistence, migration, backup, restore, and health-check operations.
- Operational logging and diagnostics across Docker services and WinSW-managed
  datasource logs.
