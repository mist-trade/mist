# Run Mist and MySQL in Docker Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Implement the `run-mist-mysql-in-docker` OpenSpec change: on the Windows API machine, Docker Desktop runs MySQL, `apps/mist`, and `apps/chan`; the Windows-only TDX datasource remains the WinSW-managed host service.

**Architecture:** The `mist` repository owns the Docker image runtime contract, production app commands, `chan` health endpoint, and migrations bundled with the image. The `mist-deploy` repository owns the Windows operator workflow: Compose files under the Docker root, machine-local `.env`, MySQL backup/restore, image update, migration execution, health checks, rollback, and diagnostics. Containers reach the host datasource through `TDX_BASE_URL=http://host.docker.internal:9001`; no datasource container is introduced.

**Tech Stack:** NestJS 10, Node.js 24 Alpine, pnpm, Docker Desktop / Docker Compose, MySQL 8.4, PowerShell 5.1, GitHub Actions, GHCR, WinSW, OpenSpec.

---

## Current Findings

- `mist/Dockerfile` builds TypeScript and exposes `8001`, `8008`, and `8009`, but has no production default `CMD`.
- `mist/docker-compose.yml` is not the desired production stack: it starts `mist` plus `mcp-server`, uses a development MCP command, and has no MySQL container.
- `apps/mist` already exposes `GET /app/hello`; `apps/chan` currently has no explicit health endpoint.
- `deploy/windows/database/migrations` already contains idempotent SQL migrations and a PowerShell runner for the old appliance path.
- `mist-deploy` is still centered on a Windows appliance zip, WinSW `MistBackend`, and portable MySQL.
- `apps/schedule` remains excluded from this change until its production data-collection ownership is decided.

## Locked Defaults For First Implementation

- Docker root: `E:\quant\MistDocker`
- Datasource root: `F:\quant\MistAPI\datasource`
- Backend port: `8001`
- Chan port: `8008`
- Datasource URL inside containers: `http://host.docker.internal:9001`
- MySQL persistence: bind mount `MYSQL_DATA_DIR=E:\quant\MistDocker\mysql-data`
- MySQL backups and diagnostics: files under `E:\quant\MistDocker\backups` and `E:\quant\MistDocker\diagnostics`

## Repository Boundaries

- `mist`: image/runtime/app contract.
- `mist-deploy`: Windows production orchestration.
- `mist-datasource`: no first-pass code change. Only verify that the existing WinSW service can bind in a way Docker containers can reach.

## Phase 1: Runtime Contract And Chan Health

- [ ] Add a failing test for the `chan` health endpoint.
  - Repository: `mist`
  - Files:
    - Create `apps/chan/src/health.controller.spec.ts`
    - Create or modify `apps/chan/src/health.controller.ts`
    - Modify `apps/chan/src/chan-app.module.ts`
  - Test command:
    ```bash
    pnpm test -- apps/chan/src/health.controller.spec.ts
    ```
  - Expected first result: test fails because the controller does not exist.

- [ ] Implement `GET /app/hello` for `apps/chan`.
  - Use a tiny controller returning a stable string or object; do not require database or datasource connectivity.
  - Keep the route aligned with `apps/mist` so health scripts can probe both services consistently.
  - Verification:
    ```bash
    pnpm test -- apps/chan/src/health.controller.spec.ts
    pnpm run build
    ```
  - Expected result: test and build pass.

- [ ] Commit checkpoint after Phase 1.
  - Suggested message:
    ```bash
    git add apps/chan/src
    git commit -m "feat(chan): add production health endpoint"
    ```

## Phase 2: Mist Docker Image Runtime Contract

- [ ] Add script-level checks for the production image contract.
  - Repository: `mist`
  - Files:
    - Create `tools/test-docker-runtime.sh`
  - Checks:
    - `Dockerfile` has a production default `CMD` for `apps/mist`.
    - Docker image can run `apps/chan` through `node dist/apps/chan/main.js`.
    - Final image includes `dist/apps/mist/main.js` and `dist/apps/chan/main.js`.
  - Test command:
    ```bash
    bash tools/test-docker-runtime.sh
    ```
  - Expected first result: fail on missing default `CMD`.

- [ ] Update `Dockerfile` to support production `mist`, `chan`, and migration commands.
  - Repository: `mist`
  - Files:
    - Modify `Dockerfile`
    - Modify `package.json`
    - Possibly modify `docker-entrypoint.sh` if command logging needs to avoid misleading "Mist Backend" output for `chan` and migration runs.
  - Required behavior:
    - Default command starts `apps/mist`:
      ```dockerfile
      CMD ["node", "dist/apps/mist/main.js"]
      ```
    - `chan-api` can override the command:
      ```yaml
      command: ["node", "dist/apps/chan/main.js"]
      ```
    - Migration service can override the command:
      ```yaml
      command: ["node", "tools/run-migrations.mjs"]
      ```
    - Do not use `pnpm run start:dev:*` anywhere in the production path.
  - Verification:
    ```bash
    pnpm run build
    bash tools/test-docker-runtime.sh
    docker build -t mist:docker-runtime-test .
    docker run --rm --entrypoint sh mist:docker-runtime-test -c "test -f dist/apps/mist/main.js && test -f dist/apps/chan/main.js"
    ```
  - Expected result: all commands exit `0`.

- [ ] Commit checkpoint after Phase 2.
  - Suggested message:
    ```bash
    git add Dockerfile docker-entrypoint.sh package.json tools/test-docker-runtime.sh
    git commit -m "feat(docker): define production runtime commands"
    ```

## Phase 3: Migration Runner Bundled With Mist Release

- [ ] Add a failing migration-runner test that uses a stub MySQL adapter.
  - Repository: `mist`
  - Files:
    - Create `tools/run-migrations.mjs`
    - Create `tools/test-run-migrations.mjs`
  - Test command:
    ```bash
    node tools/test-run-migrations.mjs
    ```
  - Expected first result: fail until the runner can discover SQL files, create `schema_migrations`, skip applied files, and record new versions.

- [ ] Implement `tools/run-migrations.mjs`.
  - Inputs:
    - `mysql_server_host`
    - `mysql_server_port`
    - `mysql_server_username`
    - `mysql_server_password`
    - `mysql_server_database`
    - Optional `MIGRATION_DIR`, defaulting to `deploy/windows/database/migrations`
  - Behavior:
    - Validate database and migration identifiers.
    - Create `schema_migrations`.
    - Sort `*.sql` files by name.
    - Skip already-applied migration versions.
    - Apply one migration at a time using `mysql2/promise`.
    - Insert the version only after the SQL succeeds.
    - Fail with a clear message and non-zero exit code.
  - Verification:
    ```bash
    node tools/test-run-migrations.mjs
    pnpm run build
    docker build -t mist:migration-runner-test .
    docker run --rm --entrypoint sh mist:migration-runner-test -c "test -f tools/run-migrations.mjs && test -f deploy/windows/database/migrations/001_init_core_tables.sql"
    bash tools/test-docker-runtime.sh
    ```

- [ ] Add an npm script for operator and Compose use.
  - Repository: `mist`
  - File:
    - Modify `package.json`
  - Script:
    ```json
    "db:migrate": "node tools/run-migrations.mjs"
    ```
  - Verification:
    ```bash
    pnpm run db:migrate
    ```
  - Expected result without MySQL: command fails clearly on connection, not on missing files or module load.

- [ ] Commit checkpoint after Phase 3.
  - Suggested message:
    ```bash
    git add package.json tools/run-migrations.mjs tools/test-run-migrations.mjs Dockerfile
    git commit -m "feat(database): bundle docker migration runner"
    ```

## Phase 4: Production Docker Compose Assets

- [ ] Add tests for the Docker appliance Compose template and env contract.
  - Repository: `mist-deploy`
  - Files:
    - Create `scripts/test-docker-compose-config.ps1`
    - Create `docker/compose.yaml`
    - Create `docker/.env.example`
  - Assertions:
    - Services include `mysql`, `mist-migrate`, `mist-backend`, and `chan-api`.
    - No `schedule`, `saya`, `mcp-server`, or datasource service is present.
    - `mist-backend` publishes `8001`.
    - `chan-api` publishes `8008`.
    - Both app services set `TDX_BASE_URL=http://host.docker.internal:9001`.
    - `mysql` uses `MYSQL_DATA_DIR` as a bind mount for `/var/lib/mysql`.
  - Test command on Windows:
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\test-docker-compose-config.ps1
    ```
  - Expected first result: fail until files exist.

- [ ] Implement `mist-deploy/docker/compose.yaml`.
  - Services:
    - `mysql`
    - `mist-migrate`
    - `mist-backend`
    - `chan-api`
  - Required details:
    - `mysql:8.4`
    - `restart: unless-stopped` for long-running services.
    - `depends_on` with MySQL health for app and migration services.
    - `mist-migrate` is one-shot and not part of normal steady-state health.
    - Use `MIST_IMAGE` and `MIST_IMAGE_TAG` from `.env`.
    - Set `mysql_server_host=mysql`.
    - Set `DEFAULT_DATA_SOURCE=tdx` for `mist-backend`.
    - Set `TDX_BASE_URL=http://host.docker.internal:9001`.
    - Publish `8001:8001` and `8008:8008`.
  - Verification:
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\test-docker-compose-config.ps1
    docker compose --env-file .\docker\.env.example -f .\docker\compose.yaml config
    ```

- [ ] Implement `mist-deploy/docker/.env.example`.
  - Required variables:
    - `MIST_IMAGE=ghcr.io/mist-trade/mist`
    - `MIST_IMAGE_TAG=latest`
    - `MYSQL_ROOT_PASSWORD=change-me-root`
    - `MYSQL_DATABASE=mist`
    - `MYSQL_USER=mist`
    - `MYSQL_PASSWORD=change-me-app`
    - `MYSQL_DATA_DIR=E:\quant\MistDocker\mysql-data`
    - `MIST_BACKEND_PORT=8001`
    - `CHAN_API_PORT=8008`
    - `TDX_BASE_URL=http://host.docker.internal:9001`
    - `DEFAULT_DATA_SOURCE=tdx`
  - Do not put machine secrets in Git.

- [ ] Commit checkpoint after Phase 4.
  - Suggested message:
    ```bash
    git add docker/compose.yaml docker/.env.example scripts/test-docker-compose-config.ps1
    git commit -m "feat(deploy): add docker appliance compose stack"
    ```

## Phase 5: Docker Deployment Script, Backup, Migration, Rollback

- [ ] Add failing tests for deploy script helpers.
  - Repository: `mist-deploy`
  - Files:
    - Create `scripts/deploy-docker-appliance.ps1`
    - Create `scripts/test-deploy-docker-appliance.ps1`
  - Test coverage:
    - Default `DockerRoot` is `E:\quant\MistDocker`.
    - Default `DatasourceRoot` is `F:\quant\MistAPI\datasource`.
    - Script preserves existing `.env`.
    - Script creates `mysql-data`, `backups`, and `diagnostics` under `DockerRoot`.
    - Script never installs or deletes `mist-tdx-datasource`.
    - Script can update `MIST_IMAGE_TAG` in the Docker `.env` file.
    - Script has a rollback path that restores the previous image tag.
  - Test command:
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\test-deploy-docker-appliance.ps1
    ```

- [ ] Implement `scripts/deploy-docker-appliance.ps1`.
  - Parameters:
    - `DockerRoot = "E:\quant\MistDocker"`
    - `DatasourceRoot = "F:\quant\MistAPI\datasource"`
    - `Image = "ghcr.io/mist-trade/mist"`
    - `ImageTag = "latest"`
    - `PreviousImageTag = ""`
    - `SkipPull`
    - `SkipMigration`
    - `SkipBackup`
    - `SkipHealthCheck`
    - `LoadOnly`
  - Flow:
    1. Assert Docker CLI and Docker Compose are usable.
    2. Create Docker root, MySQL data root, backup root, diagnostics root.
    3. Copy `docker/compose.yaml` to `DockerRoot\compose.yaml`.
    4. Copy `docker/.env.example` to `DockerRoot\.env` only when `.env` does not exist.
    5. Update image variables and `MYSQL_DATA_DIR` in `.env` from parameters without overwriting secrets.
    6. Start MySQL only:
       ```powershell
       docker compose --env-file .env -f compose.yaml up -d mysql
       ```
    7. Wait for MySQL health.
    8. Create a pre-migration backup unless `-SkipBackup`.
    9. Run migrations unless `-SkipMigration`:
       ```powershell
       docker compose --env-file .env -f compose.yaml run --rm mist-migrate
       ```
    10. Start app services:
       ```powershell
       docker compose --env-file .env -f compose.yaml up -d mist-backend chan-api
       ```
    11. Run health checks unless `-SkipHealthCheck`.
    12. Always save a short diagnostics snapshot on success or failure.
  - Important constraint:
    - Do not remove or replace `mist-tdx-datasource`; only read its status in health and diagnostics.

- [ ] Implement Docker MySQL backup helper behavior.
  - Repository: `mist-deploy`
  - Could live inside `deploy-docker-appliance.ps1` first; extract later only if it becomes bulky.
  - Output path:
    ```text
    E:\quant\MistDocker\backups\mist-YYYYMMDD-HHmmss.sql
    ```
  - Use `docker compose exec -T mysql mysqldump` against the app database.
  - Record the backup path in deployment output.
  - Failed backup blocks migration unless `-SkipBackup` was explicitly set.

- [ ] Implement rollback by image tag.
  - Repository: `mist-deploy`
  - Behavior:
    - If deployment fails after `.env` image tag update and `PreviousImageTag` is provided, restore `MIST_IMAGE_TAG`.
    - Run:
      ```powershell
      docker compose --env-file .env -f compose.yaml up -d mist-backend chan-api
      ```
    - Do not automatically roll back database state. Print backup path and manual restore instructions.

- [ ] Verification:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\test-deploy-docker-appliance.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\deploy-docker-appliance.ps1 -LoadOnly
  ```

- [ ] Commit checkpoint after Phase 5.
  - Suggested message:
    ```bash
    git add scripts/deploy-docker-appliance.ps1 scripts/test-deploy-docker-appliance.ps1
    git commit -m "feat(deploy): orchestrate docker appliance rollout"
    ```

## Phase 6: Hybrid Health Checks

- [ ] Add failing tests for health-check script behavior.
  - Repository: `mist-deploy`
  - Files:
    - Create `scripts/health-check-docker-appliance.ps1`
    - Create `scripts/test-health-check-docker-appliance.ps1`
  - Assertions:
    - Checks Docker availability.
    - Checks `docker compose ps` for `mysql`, `mist-backend`, and `chan-api`.
    - Checks `http://127.0.0.1:8001/app/hello`.
    - Checks `http://127.0.0.1:8008/app/hello`.
    - Checks datasource via configured `TDX_BASE_URL`.
    - Reads Docker root and datasource root independently.
  - Test command:
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\test-health-check-docker-appliance.ps1
    ```

- [ ] Implement `scripts/health-check-docker-appliance.ps1`.
  - Parameters:
    - `DockerRoot = "E:\quant\MistDocker"`
    - `DatasourceRoot = "F:\quant\MistAPI\datasource"`
    - `BackendHost = "127.0.0.1"`
    - `BackendPort = 8001`
    - `ChanHost = "127.0.0.1"`
    - `ChanPort = 8008`
    - `DatasourceUrl = ""`
    - `SkipDatasource`
  - Behavior:
    - Resolve `DatasourceUrl` from `.env` when not provided.
    - Use `Invoke-WebRequest` or `Invoke-RestMethod` with short timeout.
    - Fail non-zero on missing unhealthy required services.
    - Print operator-ready endpoint summary, including Mac-side URL guidance:
      ```text
      MIST_API_BASE_URL=http://<windows-lan-ip>:8001
      ```

- [ ] Verification on a machine with Docker:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\health-check-docker-appliance.ps1 -SkipDatasource
  ```

- [ ] Commit checkpoint after Phase 6.
  - Suggested message:
    ```bash
    git add scripts/health-check-docker-appliance.ps1 scripts/test-health-check-docker-appliance.ps1
    git commit -m "feat(deploy): add hybrid docker health checks"
    ```

## Phase 7: Diagnostics And Logs

- [ ] Add failing tests for diagnostics collection.
  - Repository: `mist-deploy`
  - Files:
    - Create `scripts/collect-docker-appliance-diagnostics.ps1`
    - Create `scripts/test-docker-appliance-diagnostics.ps1`
  - Assertions:
    - Creates timestamped directory under `E:\quant\MistDocker\diagnostics`.
    - Writes Docker version/info when available.
    - Writes Compose service status.
    - Writes recent logs for `mysql`, `mist-backend`, and `chan-api`.
    - Writes `mist-tdx-datasource` service status.
    - Copies recent datasource logs from `DatasourceRoot\logs`.
    - Writes health-check output.
    - Writes deployment metadata such as image tag, compose file path, and backup path when provided.

- [ ] Implement `scripts/collect-docker-appliance-diagnostics.ps1`.
  - Parameters:
    - `DockerRoot`
    - `DatasourceRoot`
    - `Tail = 300`
    - `DeploymentStatus = ""`
    - `BackupPath = ""`
  - Output examples:
    ```text
    diagnostics\20260628-153012\docker-version.txt
    diagnostics\20260628-153012\compose-ps.txt
    diagnostics\20260628-153012\logs-mysql.txt
    diagnostics\20260628-153012\logs-mist-backend.txt
    diagnostics\20260628-153012\logs-chan-api.txt
    diagnostics\20260628-153012\datasource-service.txt
    diagnostics\20260628-153012\datasource-logs\
    diagnostics\20260628-153012\health-check.txt
    diagnostics\20260628-153012\metadata.json
    ```

- [ ] Wire diagnostics into `deploy-docker-appliance.ps1`.
  - On success: collect a short snapshot.
  - On failure: collect a snapshot before throwing final error.
  - Do not hide the original deployment error.

- [ ] Verification:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\test-docker-appliance-diagnostics.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\collect-docker-appliance-diagnostics.ps1 -DockerRoot E:\quant\MistDocker -DatasourceRoot F:\quant\MistAPI\datasource
  ```

- [ ] Commit checkpoint after Phase 7.
  - Suggested message:
    ```bash
    git add scripts/collect-docker-appliance-diagnostics.ps1 scripts/test-docker-appliance-diagnostics.ps1 scripts/deploy-docker-appliance.ps1
    git commit -m "feat(deploy): collect hybrid appliance diagnostics"
    ```

## Phase 8: GitHub Actions Workflow

- [ ] Add or replace tests for the Docker deployment workflow.
  - Repository: `mist-deploy`
  - Files:
    - Modify or create `scripts/test-workflow-config.ps1`
    - Create `.github/workflows/deploy-windows-docker-appliance.yml`
  - Required assertions:
    - Workflow runs on `[self-hosted, windows, mist-api]`.
    - Inputs include `image_repository`, `image_tag`, `previous_image_tag`, `docker_root`, `datasource_root`, `skip_migration`, `skip_backup`, and `skip_health_check`.
    - Workflow does not download a Windows appliance zip.
    - Workflow invokes `scripts\deploy-docker-appliance.ps1`.
    - Workflow uses Windows PowerShell (`shell: powershell`) for Windows runner compatibility.

- [ ] Implement `.github/workflows/deploy-windows-docker-appliance.yml`.
  - Keep the old appliance workflow only if needed for emergency legacy rollback; make the new Docker workflow the documented production path.
  - Workflow steps:
    1. Checkout `mist-deploy`.
    2. Log selected image tag and roots.
    3. Invoke `deploy-docker-appliance.ps1`.
  - Do not require a build artifact run id; deployment consumes GHCR image tags.

- [ ] Verification:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\test-workflow-config.ps1
  ```

- [ ] Commit checkpoint after Phase 8.
  - Suggested message:
    ```bash
    git add .github/workflows/deploy-windows-docker-appliance.yml scripts/test-workflow-config.ps1
    git commit -m "feat(ci): deploy docker appliance from image tags"
    ```

## Phase 9: Documentation And Operator Runbook

- [ ] Update `mist` Docker documentation.
  - Repository: `mist`
  - Files:
    - Modify `README.md`
    - Add or modify `deploy/docker/README-Windows-Docker.md` if a focused doc is clearer than expanding the main README.
  - Must document:
    - Docker production stack is `mysql`, `mist-backend`, `chan-api`.
    - `schedule`, `saya`, and `mcp-server` are not deployed by default.
    - Datasource remains WinSW on the Windows host.
    - Containers use `TDX_BASE_URL=http://host.docker.internal:9001`.
    - MySQL migrations are explicit and production does not use TypeORM `synchronize`.

- [ ] Update `mist-deploy` runbook.
  - Repository: `mist-deploy`
  - Files:
    - Modify `README.md`
  - Must include:
    - First-time setup:
      ```powershell
      New-Item -ItemType Directory -Force E:\quant\MistDocker
      Copy-Item .\docker\.env.example E:\quant\MistDocker\.env
      notepad E:\quant\MistDocker\.env
      ```
    - Normal upgrade:
      ```powershell
      .\scripts\deploy-docker-appliance.ps1 -ImageTag <tag> -PreviousImageTag <old-tag>
      ```
    - Automated GitHub Actions deployment:
      ```text
      1. In the `mist` repository, confirm the target Docker image exists:
         - master image: ghcr.io/mist-trade/mist:<git-sha>
         - release image: ghcr.io/mist-trade/mist:<version-or-tag>
         Use a release tag or commit SHA for production; use `latest` only for an intentional fast-forward deploy.

      2. On the Windows API machine, confirm prerequisites before triggering deployment:
         - Docker Desktop is running.
         - The self-hosted runner is online with labels: self-hosted, windows, mist-api.
         - `mist-tdx-datasource` WinSW service is running.
         - `E:\quant\MistDocker\.env` exists and contains machine-local MySQL secrets.
         - `E:\quant\MistDocker\mysql-data` is the intended MySQL bind directory.
         - `F:\quant\MistAPI\datasource` contains datasource `.env`, service files, and logs.
         - If the GHCR package is private, the deploy workflow has a read token secret such as `GHCR_READ_TOKEN`.

      3. In the `mist-deploy` repository, open GitHub Actions and run:
         Workflow: `Deploy Windows Docker Appliance`

      4. Fill workflow inputs:
         - `image_repository`: `ghcr.io/mist-trade/mist`
         - `image_tag`: target image tag, for example `<git-sha>` or `v1.2.3`
         - `previous_image_tag`: the currently healthy tag, used for app rollback
         - `docker_root`: `E:\quant\MistDocker`
         - `datasource_root`: `F:\quant\MistAPI\datasource`
         - `skip_migration`: `false` for normal production deploys
         - `skip_backup`: `false` for normal production deploys
         - `skip_health_check`: `false` for normal production deploys

      5. The workflow performs these actions on the Windows runner:
         - checkout `mist-deploy`
         - authenticate to GHCR when a read token is configured
         - call `scripts\deploy-docker-appliance.ps1`
         - copy or reconcile `E:\quant\MistDocker\compose.yaml`
         - preserve `E:\quant\MistDocker\.env`
         - write `MYSQL_DATA_DIR=E:\quant\MistDocker\mysql-data`
         - pull the requested Mist image
         - start or verify Docker MySQL
         - write a pre-migration backup under `E:\quant\MistDocker\backups`
         - run `mist-migrate`
         - start `mist-backend` and `chan-api`
         - run hybrid health checks
         - save diagnostics under `E:\quant\MistDocker\diagnostics`

      6. Treat the deployment as successful only when:
         - GitHub Actions job is green.
         - workflow output prints the MySQL backup path.
         - workflow output prints the diagnostics snapshot path.
         - `mist-backend` health succeeds on `http://127.0.0.1:8001/app/hello`.
         - `chan-api` health succeeds on `http://127.0.0.1:8008/app/hello`.
         - datasource health succeeds through `http://host.docker.internal:9001/health` from the container side.

      7. If deployment fails:
         - Open the diagnostics snapshot path printed by the workflow.
         - Check `health-check.txt`, `compose-ps.txt`, and recent service logs first.
         - If `previous_image_tag` was provided, app containers are rolled back to that tag when possible.
         - Database migrations are not automatically rolled back; use the printed backup path for a manual restore decision.
         - Do not reinstall or remove `mist-tdx-datasource` as part of Docker app rollback.
      ```
    - Health:
      ```powershell
      .\scripts\health-check-docker-appliance.ps1
      ```
    - Diagnostics:
      ```powershell
      .\scripts\collect-docker-appliance-diagnostics.ps1
      ```
    - Rollback and database restore limits.
    - Mac-side smoke:
      ```bash
      curl http://<windows-lan-ip>:8001/app/hello
      curl http://<windows-lan-ip>:8008/app/hello
      ```

- [ ] Update OpenSpec task checkboxes only after implementation is actually complete.
  - Repository: `mist`
  - File:
    - `openspec/changes/run-mist-mysql-in-docker/tasks.md`
  - Do not mark tasks complete during planning.

- [ ] Verification:
  ```bash
  openspec validate run-mist-mysql-in-docker --strict
  ```
  Expected output:
  ```text
  Change 'run-mist-mysql-in-docker' is valid
  ```

- [ ] Commit checkpoint after Phase 9.
  - Suggested message:
    ```bash
    git add README.md deploy/docker docs/superpowers/plans/2026-06-28-run-mist-mysql-in-docker.md openspec/changes/run-mist-mysql-in-docker/tasks.md
    git commit -m "docs: document docker windows appliance deployment"
    ```

## Phase 10: End-To-End Verification

- [ ] Local `mist` verification.
  ```bash
  pnpm test -- apps/chan/src/health.controller.spec.ts
  node tools/test-run-migrations.mjs
  bash tools/test-docker-runtime.sh
  pnpm run build
  docker build -t mist:e2e-docker-appliance .
  ```

- [ ] Local or Windows `mist-deploy` verification.
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\test-docker-compose-config.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\test-deploy-docker-appliance.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\test-health-check-docker-appliance.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\test-docker-appliance-diagnostics.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\test-workflow-config.ps1
  ```

- [ ] Windows API machine smoke.
  - Preconditions:
    - Docker Desktop running.
    - `mist-tdx-datasource` WinSW service running.
    - `E:\quant\MistDocker\.env` configured.
    - `E:\quant\MistDocker\mysql-data` available for the MySQL bind mount.
    - Datasource health reachable from the host.
  - Commands:
    ```powershell
    .\scripts\deploy-docker-appliance.ps1 -ImageTag <tag> -PreviousImageTag <old-tag>
    .\scripts\health-check-docker-appliance.ps1
    docker compose --env-file E:\quant\MistDocker\.env -f E:\quant\MistDocker\compose.yaml exec mist-backend curl -fsS http://host.docker.internal:9001/health
    ```
  - Expected result:
    - MySQL healthy.
    - Migrations succeed.
    - `mist-backend` healthy on `8001`.
    - `chan-api` healthy on `8008`.
    - Container-to-host datasource health succeeds.

- [ ] Mac-side smoke.
  ```bash
  curl http://<windows-lan-ip>:8001/app/hello
  curl http://<windows-lan-ip>:8008/app/hello
  ```

- [ ] OpenSpec verification.
  ```bash
  openspec validate run-mist-mysql-in-docker --strict
  ```

## Known Risks And Handling

- If `host.docker.internal:9001` is not reachable from containers, first check datasource bind address and Windows firewall. Keep datasource local to the Windows API machine; do not expose it broadly on LAN without a concrete need.
- Do not edit files under `E:\quant\MistDocker\mysql-data` while the MySQL container is running; use `mysqldump` backups and diagnostics for operational changes.
- If migration fails, deployment must stop before reporting app health. Operators should use the pre-migration backup and diagnostics snapshot to decide whether to restore.
- If `chan-api` later should become host-local only, change only the Compose port binding and health script input; keep the container service and health endpoint unchanged.
- Do not add `apps/schedule` to Compose until there is a separate OpenSpec change defining its production data-source ownership.
