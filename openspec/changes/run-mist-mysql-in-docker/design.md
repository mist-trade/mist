## Context

The Windows API machine is expected to run continuously with Docker Desktop
available. The datasource layer is low churn and tied to Windows desktop state:
TDX Desktop, local SDK DLLs, login/session state, and strategy cleanup. The Mist
backend changes more frequently and is already published as a Docker image, so
the production deployment should move the high-churn backend services and MySQL
state into Docker while keeping the host-only datasource service on WinSW.

The target machine may store Docker deployment files on a different drive from
the datasource installation. The initial default layout is:

```text
E:\quant\MistDocker
    compose.yaml
    .env
    mysql-data\
    backups\
    diagnostics\

F:\quant\MistAPI\datasource
    .env
    logs\
    services\mist-tdx-datasource\
```

## Goals / Non-Goals

**Goals:**

- Run `apps/mist`, `apps/chan`, and MySQL through Docker Compose on the Windows
  API machine.
- Keep `mist-tdx-datasource` as a WinSW-managed Windows host service.
- Reuse the Mist Docker image publishing path for frequent backend releases.
- Keep the datasource deployment stable and independent from Mist backend image
  updates.
- Provide a deploy workflow that can pull images, run migrations, start
  containers, check datasource/backend/chan health, and collect diagnostics.
- Support independent Docker and datasource roots, such as Docker state on `E:`
  and datasource state on `F:`.

**Non-Goals:**

- Containerizing TDX Desktop, TDX SDK files, QMT, or `mist-datasource` in the
  first version.
- Deploying `apps/schedule` in the default production Compose stack.
- Deploying `apps/saya` or `apps/mcp-server` in the first Docker production
  stack.
- Introducing a centralized logging platform such as Loki, ELK, or Grafana in
  the first version.
- Replacing the normalized backend-to-datasource contract.

## Decisions

### Use a hybrid Docker plus WinSW topology

Docker Compose owns `mysql`, `mist-backend`, and `chan-api`. WinSW owns
`mist-tdx-datasource`. This keeps the high-churn backend easy to update through
image tags while leaving the Windows-specific datasource close to its desktop
and SDK dependencies.

Alternative considered: containerize everything. That would make the deployment
surface look uniform, but it would force TDX Desktop and local SDK behavior into
a container boundary that is not appropriate for the current provider.

### Do not deploy `apps/schedule` by default

The first Compose stack includes `apps/mist` and `apps/chan` only. The current
schedule app has cron jobs tied to direct `EastMoneyCollectionStrategy` usage,
while the production data path is moving toward TDX via the datasource service.
Deploying it before its production role is decided risks duplicated or
misaligned collection behavior.

Alternative considered: include schedule as a disabled Compose profile. That is
reasonable later, but the first production stack should not imply a supported
schedule role before the collection ownership is settled.

### Use `host.docker.internal` for datasource access

Containerized Mist services use:

```text
TDX_BASE_URL=http://host.docker.internal:9001
```

The datasource service remains configured and tested from the Windows host. The
implementation must verify that the Docker containers can reach the datasource
health endpoint. If binding to `127.0.0.1` is insufficient for Docker Desktop,
the datasource host binding and Windows firewall rules must be adjusted without
exposing the service outside the machine unnecessarily.

### Put migrations under the Mist release path

Database migrations should follow the Mist image/release that needs them.
Deployment should run an explicit migration step, such as a one-shot
`mist-migrate` Compose service or a deployment script that applies the bundled
SQL migrations against the MySQL container. Production must not rely on TypeORM
`synchronize`.

Alternative considered: keep migrations only in `mist-deploy`. That creates
drift risk because Mist code and database changes would need to be synchronized
across repositories manually.

### Persist MySQL through an explicit host bind directory

MySQL data is stored in `E:\quant\MistDocker\mysql-data` by default through
the Compose `MYSQL_DATA_DIR` bind mount. This keeps the Docker deployment
layout visible to the Windows operator and places data, backups, diagnostics,
Compose, and `.env` under the same `E:\quant\MistDocker` root.

Alternative considered: Docker named volume. That is a reasonable default for
opaque Docker-managed storage, but this deployment favors simple Windows-side
inspection and backup handoff.

### Keep logs native but collect diagnostics through one command

Docker services continue writing to stdout/stderr and WinSW continues writing
datasource logs to files. Instead of forcing all logs into one sink in the first
version, `mist-deploy` should provide a diagnostics command that collects Docker
state/logs, datasource service state/logs, health-check output, and deployment
metadata into a timestamped directory.

Alternative considered: add a centralized logging stack. That is too heavy for
the first hybrid deployment and can be added later if service count or retention
needs grow.

## Risks / Trade-offs

- Docker Desktop startup or WSL2 state blocks backend startup -> deployment
  health checks must include Docker service status and `docker compose ps`.
- Containers cannot reach the host datasource through `host.docker.internal` ->
  add a container-side datasource health probe and document the required
  datasource bind/firewall adjustment.
- MySQL data is now visible under the Docker root, but manual file-level edits
  are still unsafe while MySQL is running -> provide explicit backup and restore
  commands using `mysqldump` and keep backup files under the Docker root.
- Logs are split between Docker and WinSW -> provide `collect-logs.ps1` or an
  equivalent diagnostics command that captures both sides.
- Schedule app behavior remains undecided -> exclude it from the default stack
  until its data-source ownership is specified.

## Migration Plan

1. Add a production Dockerfile/CMD and Compose stack for `mist-backend`,
   `chan-api`, and MySQL.
2. Add environment templates for the Docker stack, including MySQL credentials,
   `MYSQL_DATA_DIR=E:\quant\MistDocker\mysql-data`,
   `TDX_BASE_URL=http://host.docker.internal:9001`, image tag, and exposed
   ports.
3. Add a migration runner path that applies Mist database migrations to the
   MySQL container before backend services are started or upgraded.
4. Update `mist-deploy` to manage Docker root and datasource root separately.
5. Update deployment flow to pull the requested Mist image tag, start MySQL,
   run migrations, start `mist-backend` and `chan-api`, then run health checks.
6. Add diagnostics collection for Docker services and the WinSW datasource.
7. Validate on the Windows API machine with Docker Desktop running, datasource
   WinSW running, and Mac-side checks against ports `8001` and `8008`.

Rollback:

- Roll back `mist-backend` and `chan-api` by restoring the previous image tag in
  the Compose environment and running `docker compose up -d`.
- Roll back database state only from an explicit backup; migrations that are not
  reversible must require a pre-upgrade backup.
- Leave the datasource WinSW service untouched unless datasource-specific
  deployment changed.

## Open Questions

- Should `chan-api` be exposed on LAN port `8008` immediately, or only on the
  Windows host until a concrete external consumer needs it?
- What exact health endpoint should `chan-api` expose if `/app/hello` remains
  specific to `apps/mist`?
