# Mist Windows Docker Deployment

This is the production deployment shape for the Windows API machine after
`run-mist-mysql-in-docker`.

## Topology

```text
Windows API machine
  Docker Desktop
    - mysql
    - mist-backend on 0.0.0.0:8001
    - chan-api on 0.0.0.0:8008
    - mist-migrate one-shot migration runner

  Windows host
    - mist-tdx-datasource WinSW service on 127.0.0.1:9001
    - TDX Desktop, SDK files, login state, and strategy cleanup

Mac / LLM machine
  - MIST_API_BASE_URL=http://<windows-lan-ip>:8001
```

## Default Windows Layout

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

`E:\quant\MistDocker\.env` is the Docker environment file. It must contain
`MYSQL_DATA_DIR=E:\quant\MistDocker\mysql-data` for the MySQL bind mount.

`apps/schedule`, `apps/saya`, and `apps/mcp-server` are not part of the default
production Docker stack. `apps/schedule` needs a separate production ownership
decision before it is deployed.

## Runtime Contract

The Docker image contains both application entrypoints:

```text
dist/apps/mist/main.js
dist/apps/chan/main.js
```

The default image command starts `apps/mist`:

```text
node dist/apps/mist/main.js
```

`chan-api` overrides the command in Compose:

```text
node dist/apps/chan/main.js
```

Database migrations are bundled with the Mist image and run explicitly through:

```text
node tools/run-migrations.mjs
```

Production deployments must not rely on TypeORM `synchronize`; `apps/mist`
already disables synchronize when `NODE_ENV=production`.

## Datasource Boundary

The datasource remains outside Docker as the WinSW-managed Windows service
`mist-tdx-datasource`. Containers reach it through:

```text
TDX_BASE_URL=http://host.docker.internal:9001
```

If container-to-host health checks fail, first verify the datasource bind
address and Windows firewall. Do not add a datasource container in this change.

## Deployment Owner

The deployable Compose file, machine-local `.env`, backup, rollback, health
check, diagnostics, and GitHub Actions workflow live in `mist-deploy`.

Normal production deployment is:

```powershell
.\scripts\deploy-docker-appliance.ps1 -ImageTag <tag> -PreviousImageTag <old-tag>
```

The GitHub Actions workflow is:

```text
Deploy Windows Docker Appliance
```

Use a release tag or commit SHA for production. Use `latest` only for an
intentional fast-forward deploy.
