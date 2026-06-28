## 1. Confirm Runtime Contract

- [ ] 1.1 Confirm MySQL persistence defaults to the `E:\quant\MistDocker\mysql-data` bind mount.
- [ ] 1.2 Confirm default Docker root path, datasource root path, MySQL data path, backup path, and diagnostics path.
- [ ] 1.3 Confirm whether `chan-api` should be exposed on LAN port `8008` or host-local only in the first deployment.
- [ ] 1.4 Define the first production health endpoint for `chan-api`.

## 2. Prepare Mist Docker Runtime

- [ ] 2.1 Update the Mist Docker image so it has a production default command for `apps/mist`.
- [ ] 2.2 Add a supported container command for `apps/chan`.
- [ ] 2.3 Remove development commands from the production Compose path.
- [ ] 2.4 Verify the Docker image includes compiled outputs for both `dist/apps/mist/main.js` and `dist/apps/chan/main.js`.
- [ ] 2.5 Add focused tests or script checks that validate production Docker entrypoints.

## 3. Add Production Docker Compose Stack

- [ ] 3.1 Add a production Compose file for `mysql`, `mist-backend`, and `chan-api`.
- [ ] 3.2 Add a Docker environment template with image tag, MySQL credentials, ports, `DEFAULT_DATA_SOURCE=tdx`, and `TDX_BASE_URL=http://host.docker.internal:9001`.
- [ ] 3.3 Configure MySQL persistence with `MYSQL_DATA_DIR=E:\quant\MistDocker\mysql-data`.
- [ ] 3.4 Add container restart policies suitable for the Windows API machine.
- [ ] 3.5 Add a container-side datasource reachability probe for `host.docker.internal:9001`.

## 4. Add Database Migration And Backup Flow

- [ ] 4.1 Decide the migration runner shape: one-shot Compose service or deployment script applying bundled SQL.
- [ ] 4.2 Package Mist database migrations with the Mist release path used by Docker deployment.
- [ ] 4.3 Add a migration command that runs against the MySQL container and records applied migrations.
- [ ] 4.4 Add a pre-migration backup command using `mysqldump` to the configured backup path.
- [ ] 4.5 Ensure deployment fails fast and prints migration logs when migrations fail.
- [ ] 4.6 Add restore documentation and a manual restore script for MySQL backups.

## 5. Refactor mist-deploy For Hybrid Docker Deployment

- [ ] 5.1 Add `DockerRoot` and `DatasourceRoot` configuration to the deploy workflow and scripts.
- [ ] 5.2 Change the deploy flow from appliance zip extraction to Docker Compose pull/up orchestration.
- [ ] 5.3 Preserve machine-local Docker `.env`, datasource `.env`, MySQL data, backups, and diagnostics.
- [ ] 5.4 Keep datasource WinSW installation and update logic separate from normal Mist image deployments.
- [ ] 5.5 Add explicit rollback support by restoring the previous Mist image tag and restarting Compose services.
- [ ] 5.6 Update workflow tests for the new Docker deploy inputs and removed appliance zip assumptions.

## 6. Add Hybrid Health Checks

- [ ] 6.1 Add health checks for Docker Desktop availability and Docker Compose service status.
- [ ] 6.2 Add MySQL container connectivity and schema initialization checks.
- [ ] 6.3 Add `mist-backend` HTTP health checks on port `8001`.
- [ ] 6.4 Add `chan-api` HTTP health checks on port `8008` or the selected exposure mode.
- [ ] 6.5 Add datasource health checks using the same URL configured for containerized Mist services.
- [ ] 6.6 Add Mac-side smoke guidance for `MIST_API_BASE_URL=http://<windows-lan-ip>:8001`.

## 7. Add Diagnostics And Log Collection

- [ ] 7.1 Add a diagnostics command that writes timestamped output under the Docker diagnostics path.
- [ ] 7.2 Collect `docker compose ps` and recent Docker logs for MySQL, `mist-backend`, and `chan-api`.
- [ ] 7.3 Collect datasource WinSW service status and recent datasource logs from `DatasourceRoot`.
- [ ] 7.4 Collect health-check output and deployment metadata.
- [ ] 7.5 Save a short diagnostic snapshot after every deployment success or failure.

## 8. Documentation And Verification

- [ ] 8.1 Document the hybrid topology and explain why datasource remains WinSW-managed.
- [ ] 8.2 Document first-time setup for Docker Desktop, Docker root, datasource root, and local `.env` files.
- [ ] 8.3 Document normal upgrade, rollback, backup, restore, and diagnostics procedures.
- [ ] 8.4 Run OpenSpec validation for `run-mist-mysql-in-docker`.
- [ ] 8.5 Run local script/parser tests for changed deployment scripts.
- [ ] 8.6 Build and push a Mist Docker image containing `apps/mist` and `apps/chan`.
- [ ] 8.7 Deploy on the Windows API machine with datasource WinSW already running.
- [ ] 8.8 Verify container-to-host datasource connectivity from the Mist containers.
- [ ] 8.9 Verify Mac can reach `http://<windows-lan-ip>:8001` and `http://<windows-lan-ip>:8008` when enabled.
