# Mist Production Baseline Evidence - 2026-07-01

Status: known-good for the verified production baseline from the Mac
verification host. `<gateway-hostname>` resolves to `<windows-lan-ip>` through
Mac-local host resolution; no LAN-wide DNS record is configured.

This ledger started as a non-mutating verification pass from the Mac workspace.
After operator approval, `Deploy Windows Mist Stack` was dispatched through the
`mist-deploy` self-hosted Windows runner. MySQL restore rehearsal, Mac-side
gateway probes, canonical hostname verification, and TDX runtime smoke were
added after the gateway lifecycle fix. No datasource restart or TDX recovery was
triggered during this pass.

## Baseline Context

| Field | Value |
| --- | --- |
| Baseline timestamp | 2026-07-01 20:38:01 CST +0800 |
| Operator | <operator> |
| Verification host | Mac workspace `<mac-workspace-root>` |
| Windows API machine identity | GitHub runner `<windows-runner-name>`, machine `<windows-machine-name>` |
| Windows LAN IP | `<windows-lan-ip>` candidate from existing deployment baseline |
| Gateway hostname | `<gateway-hostname>` |
| Docker root | `<docker-root>` expected from deploy baseline |
| Datasource root | Not verified in this pass; host-side WinSW datasource expected |
| Monitoring scope | Optional; local `127.0.0.1:8787/metrics` probe failed |

## Repository Refs

| Repository | Branch/status | Commit |
| --- | --- | --- |
| `mist` | `master...origin/master`; untracked OpenSpec changes | `32364ecad2199a8ea011c5423541692834fab710` |
| `mist-fe` | `master...origin/master` | `23b483388a9f40d9ad9b22529729e1f75f369726` |
| `mist-datasource` | `work/align-tdx-qmt-datasource-contracts...origin/work/align-tdx-qmt-datasource-contracts [gone]` | `e9b129ac1610b5a1a91a877d115b5d2137fc6428` |
| `mist-deploy` | `master...origin/master` | `ead2099c92dc84116095a0ebd164c0dd872bbf5e` |
| `mist-monitoring` | `master...origin/master` | `459170e401650d99a7a1c5376e503421ac74caec` |
| `mist-skills` | `master...origin/master` | `4777f43b0b425ca313d738a4a58158c45b662b1f` |

Remotes:

- `mist`: `https://github.com/mist-trade/mist.git`
- `mist-fe`: `https://github.com/mist-trade/mist-fe.git`
- `mist-datasource`: `https://github.com/mist-trade/mist-datasource.git`
- `mist-deploy`: `https://github.com/mist-trade/mist-deploy.git`
- `mist-monitoring`: `https://github.com/mist-trade/mist-monitoring.git`
- `mist-skills`: `https://github.com/mist-trade/mist-skills.git`

## Intended Runtime Inputs

Pinned images selected for this baseline:

| Component | Image |
| --- | --- |
| Backend | `ghcr.io/mist-trade/mist:32364ecad2199a8ea011c5423541692834fab710` |
| Frontend | `ghcr.io/mist-trade/mist-fe:23b483388a9f40d9ad9b22529729e1f75f369726` |

`mist-deploy/docker/.env.example` currently documents these runtime defaults:

| Setting | Value |
| --- | --- |
| `MIST_IMAGE` | `ghcr.io/mist-trade/mist` |
| `MIST_IMAGE_TAG` | `latest` |
| `MIST_FE_IMAGE` | `ghcr.io/mist-trade/mist-fe` |
| `MIST_FE_IMAGE_TAG` | `latest` |
| `WEB_GATEWAY_IMAGE` | `docker.m.daocloud.io/library/nginx:1.27-alpine` |
| `MYSQL_DATA_DIR` | `<docker-root>\mysql-data` |
| `MIST_BACKEND_PORT` | `8001` |
| `CHAN_API_PORT` | `8008` |
| `WEB_GATEWAY_PORT` | `80` |
| `NEXT_PUBLIC_MIST_API_BASE_PATH` | `/api/mist` |
| `NEXT_PUBLIC_CHAN_API_BASE_PATH` | `/api/chan` |
| `DEFAULT_DATA_SOURCE` | `tdx` |
| `TDX_BASE_URL` | `http://host.docker.internal:9001` |
| `TZ` | `Asia/Shanghai` |

The compose topology in `mist-deploy/docker/compose.yaml` includes `mysql`,
`mist-migrate`, `mist-backend`, `chan-api`, `mist-fe`, and `web-gateway`.

Rollback image tags were not selected in this pass.

Draft `Deploy Windows Mist Stack` workflow inputs for a later dispatch:

| Input | Value |
| --- | --- |
| Backend image tag | `32364ecad2199a8ea011c5423541692834fab710` |
| Frontend image tag | `23b483388a9f40d9ad9b22529729e1f75f369726` |
| Previous backend tag | Not provided |
| Previous frontend tag | Not provided |
| Datasource handling | Do not reinstall, remove, or replace `mist-tdx-datasource` during app deployment |

## Image Availability Check

The image manifest checks were attempted with `docker manifest inspect`.
Sandboxed network resolution failed first, then the commands were rerun with
network approval. The registry was reachable, but current Docker credentials did
not have read access to the private GHCR manifests.

| Image | Result |
| --- | --- |
| `ghcr.io/mist-trade/mist:32364ecad2199a8ea011c5423541692834fab710` | Local Mac check returned `unauthorized`; runner pull succeeded in run `28519192627` |
| `ghcr.io/mist-trade/mist-fe:23b483388a9f40d9ad9b22529729e1f75f369726` | Local Mac check returned `unauthorized`; runner pull succeeded in run `28519192627` |

Conclusion: the selected backend and frontend image tags exist and are readable
from the authenticated `mist-deploy` GitHub Actions runner. The Mac-local Docker
credentials still lack GHCR package read access.

## Runner Deployment Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

### Attempt 1: malformed Windows path inputs

| Field | Value |
| --- | --- |
| Run | `28519061612` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28519061612` |
| Final status | Failed |
| Job | `84538151814` |
| Root cause | Mac shell dispatch passed Windows paths without preserving backslashes, so `<docker-root>` became `E:quantMistDocker` |
| Diagnostics path | `E:quantMistDocker\diagnostics\<timestamp>` |

This attempt is not treated as production runtime evidence because the dispatch
inputs were malformed before the workflow reached the intended Docker root.

### Attempt 2: corrected Windows path inputs

| Field | Value |
| --- | --- |
| Run | `28519192627` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28519192627` |
| Job | `84538602706` |
| Final status | Failed |
| `mist-deploy` ref | `ead2099c92dc84116095a0ebd164c0dd872bbf5e` |
| Backend image | `ghcr.io/mist-trade/mist:32364ecad2199a8ea011c5423541692834fab710` |
| Frontend image | `ghcr.io/mist-trade/mist-fe:23b483388a9f40d9ad9b22529729e1f75f369726` |
| Web gateway image | `docker.m.daocloud.io/library/nginx:1.27-alpine` |
| Docker root | `<docker-root>` |
| Datasource root | `<datasource-root>` |
| Previous backend/frontend tags | Not provided; rollback skipped |
| `skip_pull` | `false` |
| `skip_backup` | `false` |
| `skip_migration` | `false` |
| `skip_health_check` | `false` |

Runner evidence from run `28519192627`:

- GHCR login completed.
- Backend, frontend, and gateway images pulled successfully.
- `DockerRoot=<docker-root>` and
  `DatasourceRoot=<datasource-root>` were accepted by the script.
- MySQL was running and healthy.
- Pre-migration backup was created:
  `<docker-root>\backups\mist-<timestamp>.sql`.
- Backup retention cleanup removed `0` items.
- Database migrations ran; migrations `001_init_core_tables.sql`,
  `002_add_tdx_vol_in_stock.sql`, and `003_security_code_identity.sql` were
  already applied.
- `mist-backend` and `chan-api` were recreated; `mist-fe` and `web-gateway`
  were running.
- Containers reached healthy state for `mist-fe`, `mist-backend`, and
  `mist-chan-api`.
- Health check confirmed Docker services running: `mysql`, `mist-backend`,
  `chan-api`, `mist-fe`, and `web-gateway`.
- Windows-local direct health checks passed:
  - `http://127.0.0.1:8001/app/hello`
  - `http://127.0.0.1:8008/app/hello`
  - `http://127.0.0.1:80/`
- Workflow failed during gateway health:
  `http://127.0.0.1:80/api/mist/app/hello` returned HTTP `502`.
- Diagnostics were captured at:
  `<docker-root>\diagnostics\<timestamp>`.

Suspected root cause for the gateway HTTP `502`:

- The deploy log shows `mist-backend` and `chan-api` were recreated, while
  `mist-web-gateway` remained `Running`.
- `scripts/deploy-docker-appliance.ps1` starts app services with
  `docker compose up -d mist-backend chan-api mist-fe web-gateway`, which does
  not force a restart of an unchanged, already-running `web-gateway` container.
- `mist-deploy/docker/nginx/nginx.conf` proxies `/api/mist/` to
  `http://mist-backend:8001/`; if nginx resolved the old backend container IP
  before backend recreation, the gateway can return `502` even while direct
  backend health on `127.0.0.1:8001` is healthy.
- The next fix should explicitly recreate or restart `web-gateway` after
  backend and Chan containers are recreated, then rerun this baseline workflow.

502 log availability:

- GitHub Actions run `28519192627` uploaded no artifacts.
- The deploy stdout shows the health-check failure, but not nginx access/error
  logs.
- `scripts/collect-docker-appliance-diagnostics.ps1` currently collects Docker
  logs for `mysql`, `mist-backend`, and `chan-api`; it does not collect
  `web-gateway` or `mist-fe` logs.
- The diagnostics directory on the Windows host is
  `<docker-root>\diagnostics\<timestamp>`, but it is not retrievable
  from GitHub without an artifact upload or direct Windows host access.

### Diagnostics artifact follow-up

A dedicated `mist-deploy` change was created and pushed to collect gateway logs
and upload diagnostics artifacts:

| Field | Value |
| --- | --- |
| Change | `capture-gateway-diagnostics` |
| Branch | `work/capture-gateway-diagnostics` |
| Commit | `71503f4244e8b026d40a6f84d9c49ceb6178c62b` |
| Runner run | `28527417201` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28527417201` |
| Status | Failed before deployment |

Run `28527417201` did not reach checkout, GHCR login, deploy, diagnostics
collection, or artifact upload. It failed during `Set up job` while downloading
`docker/login-action@v4` from `codeload.github.com`; GitHub Actions retried and
then reported the action archive download timed out. Artifact count for this run
was `0`.

Conclusion: the diagnostics artifact implementation is present on the pushed
branch, but runner verification is blocked by Windows runner connectivity to
GitHub action archives. Retry after runner network recovers or after reducing
external action downloads for this workflow.

### Diagnostics stdout follow-up

The diagnostics change was revised to avoid additional marketplace action
downloads before deployment: `docker/login-action@v4` was replaced with an
inline Docker CLI login, and `actions/upload-artifact@v4` was replaced with a
failure-only stdout diagnostics step.

| Field | Value |
| --- | --- |
| Change | `capture-gateway-diagnostics` |
| Branch | `work/capture-gateway-diagnostics` |
| Commit | `249fe4def16e703a278815b1ce474d53d7b88e92` |
| Runner run | `28529821620` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28529821620` |
| Job | `84576037442` |
| Final status | Failed |

Runner evidence from run `28529821620`:

- Runner setup and checkout completed.
- Inline GHCR login completed with `Login Succeeded`.
- Backend, frontend, and web-gateway images pulled successfully, including
  `docker.m.daocloud.io/library/nginx:1.27-alpine`.
- Pre-migration backup was created:
  `<docker-root>\backups\mist-<timestamp>.sql`.
- Database migrations ran; migrations `001_init_core_tables.sql`,
  `002_add_tdx_vol_in_stock.sql`, and `003_security_code_identity.sql` were
  already applied.
- Containers reached healthy state for `mist-fe`, `mist-backend`, and
  `mist-chan-api`.
- Windows-local direct health checks passed:
  - `http://127.0.0.1:8001/app/hello`
  - `http://127.0.0.1:8008/app/hello`
  - `http://127.0.0.1:80/`
- Workflow failed during gateway Mist API health:
  `http://127.0.0.1:80/api/mist/app/hello` returned HTTP `502`.
- Diagnostics were captured on the Windows host at:
  `<docker-root>\diagnostics\<timestamp>`.
- The failure-only stdout diagnostics step ran successfully and printed compose
  status, `web-gateway` logs, `mist-fe` logs, and the applied nginx
  configuration.

Stdout diagnostics from run `28529821620`:

- Compose status showed all Docker services up and healthy:
  `mist-backend`, `mist-chan-api`, `mist-fe`, `mist-mysql`, and
  `mist-web-gateway`.
- `mist-backend` and `mist-chan-api` containers were about `3 hours` old, while
  `mist-fe` and `mist-web-gateway` were about `8 hours` old.
- `web-gateway` logs repeatedly showed nginx returning `502` for
  `/api/mist/app/hello`.
- The nginx error was:
  `connect() failed (111: Connection refused) while connecting to upstream`
  for upstream `http://172.18.0.5:8001/app/hello`.
- `mist-fe` logs showed Next.js ready on `0.0.0.0:3000`.
- The applied nginx config routes:
  - `/api/mist/` to `http://mist-backend:8001/`
  - `/api/chan/` to `http://chan-api:8008/`
  - `/` to `http://mist-fe:3000`

Updated gateway `502` conclusion:

- The selected GHCR image tags exist and are pullable from the authenticated
  runner.
- The backup and migration path works far enough to create a backup and run
  migrations.
- The backend direct host health succeeds, but nginx inside `web-gateway`
  cannot connect to the upstream IP it resolved for `mist-backend`.
- Because `web-gateway` remained older than the recreated backend/Chan
  containers, the next deployment-script fix should explicitly recreate or
  restart `web-gateway` after backend and Chan containers are recreated, then
  rerun this baseline workflow.

### Gateway lifecycle fix follow-up

The deploy script was updated to start app services first and then explicitly
force-recreate `web-gateway` with `--force-recreate --no-deps`, preserving the
existing nginx upstream config.

| Field | Value |
| --- | --- |
| Change | `restart-web-gateway-after-app-recreate` |
| Branch | `work/restart-web-gateway-after-app-recreate` |
| Commit | `a216ecb5f2c89eb40de8e8cf047622b4f0dd5e6f` |
| Runner run | `28531193330` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28531193330` |
| Job | `84580860587` |
| Final status | Success |

Runner evidence from run `28531193330`:

- Checkout used deploy ref
  `a216ecb5f2c89eb40de8e8cf047622b4f0dd5e6f`.
- Inline GHCR login completed with `Login Succeeded`.
- Backend, frontend, and web-gateway images pulled successfully, including
  `docker.m.daocloud.io/library/nginx:1.27-alpine`.
- Pre-migration backup was created:
  `<docker-root>\backups\mist-<timestamp>.sql`.
- Database migrations ran; migrations `001_init_core_tables.sql`,
  `002_add_tdx_vol_in_stock.sql`, and `003_security_code_identity.sql` were
  already applied.
- `mist-backend`, `chan-api`, and `mist-fe` were started before gateway
  refresh.
- `mist-web-gateway` was recreated and started before health checks.
- Docker service checks passed for `mysql`, `mist-backend`, `chan-api`,
  `mist-fe`, and `web-gateway`.
- Windows-local HTTP health checks passed:
  - `http://127.0.0.1:8001/app/hello`
  - `http://127.0.0.1:8008/app/hello`
  - `http://127.0.0.1:80/`
  - `http://127.0.0.1:80/api/mist/app/hello`
  - `http://127.0.0.1:80/api/chan/app/hello`
- Host-side datasource health passed:
  `http://127.0.0.1:9001/health`.
- Backend-container-to-host datasource health passed from `mist-backend`:
  `http://host.docker.internal:9001/health`.
- Diagnostics were captured on the Windows host at:
  `<docker-root>\diagnostics\<timestamp>`.
- Deployment completed successfully.

Gateway `502` fix conclusion:

- The previous gateway failure was resolved by recreating `web-gateway` after
  app containers were started.
- The nginx config remained conventional:
  `/api/mist/` still targets `http://mist-backend:8001/`, and `/api/chan/`
  still targets `http://chan-api:8008/`.
- The datasource service boundary remained intact: app deployment did not
  reinstall, remove, recover, or restart `mist-tdx-datasource`.

Health checks that were not reached in the earlier failed runs but passed in
run `28531193330`:

- Windows-local gateway Chan health:
  `http://127.0.0.1:80/api/chan/app/hello`.
- Host-side datasource health.
- Backend-container-to-host datasource health through
  `http://host.docker.internal:9001/health`.

Deployment script review for datasource preservation:

- `deploy-windows-docker-appliance.yml` passes `datasource_root` only as a
  script input.
- `scripts/deploy-docker-appliance.ps1` uses `DatasourceRoot` for health and
  diagnostics script calls.
- The deploy workflow/script inspection found no `sc.exe`, service install,
  service delete, `Start-Service`, `Stop-Service`, or `Restart-Service` path for
  `mist-tdx-datasource`.

## Mac-Side Gateway Evidence

Probe mode: raw Windows LAN IP and `<gateway-hostname>`.

Initial name resolution from the Mac before local host resolution was fixed:

| Check | Result |
| --- | --- |
| `/etc/hosts` entry for `<gateway-hostname>` or `<windows-lan-ip>` | No matching entry found |
| `dscacheutil -q host -a name <gateway-hostname>` | No record returned |
| `dig +short <gateway-hostname>` | `198.18.0.30` |
| `http://<gateway-hostname>/api/mist/app/hello` | Connected to `198.18.0.30:80`, then `curl: (52) Empty reply from server` |
| `--resolve <gateway-hostname>:80:<windows-lan-ip>` for `/api/mist/app/hello` | HTTP `200 OK`; backend JSON success |

Follow-up after Mac-local host resolution was fixed on 2026-07-02:

| Check | Result |
| --- | --- |
| `dscacheutil -q host -a name <gateway-hostname>` | `ip_address: <windows-lan-ip>` |
| `curl --noproxy '*' http://<gateway-hostname>/api/mist/app/hello` | HTTP `200 OK`; `remote_ip=<windows-lan-ip>`; JSON `success=true`, `data="Hello World!"`, path `/app/hello` |
| `curl --noproxy '*' http://<gateway-hostname>/api/chan/app/hello` | HTTP `200 OK`; `remote_ip=<windows-lan-ip>`; body `Hello World!` |
| `curl --noproxy '*' http://<windows-lan-ip>/api/mist/app/hello` | HTTP `200 OK`; `remote_ip=<windows-lan-ip>`; JSON `success=true`, `data="Hello World!"`, path `/app/hello` |

Gateway and direct service probes from the Mac:

| URL | Result |
| --- | --- |
| `http://<windows-lan-ip>/` | HTTP `307 Temporary Redirect`; `Server: nginx/1.27.5`; `Location: /k`; Next.js HTML body returned |
| `http://<windows-lan-ip>/api/mist/app/hello` | HTTP `200 OK`; JSON `success=true`, `data="Hello World!"`, path `/app/hello` |
| `http://<windows-lan-ip>/api/chan/app/hello` | HTTP `200 OK`; body `Hello World!` |

Mac-side gateway conclusion:

- Raw Windows LAN IP `<windows-lan-ip>` is reachable from the Mac for the gateway
  frontend path, Mist API proxy, and Chan API proxy.
- `<gateway-hostname>` now resolves to `<windows-lan-ip>` from the Mac verification
  host and gateway Mist/Chan API probes pass without a per-command `--resolve`
  override.
- The remaining DNS scope limitation is intentional: the mapping is Mac-local,
  not a LAN-wide DNS record.

## MySQL Restore Rehearsal Evidence

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28531904790` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28531904790` |
| Final status | Success |
| Branch | `work/restart-web-gateway-after-app-recreate` |
| Commit | `f1a823a17bb50c5afb3d5b9e9146f1f8da3f9bda` |
| Docker root | `<docker-root>` |
| Backup path | `<docker-root>\backups\mist-<timestamp>.sql` |
| Temporary container | `mist-mysql-restore-check-<timestamp>` |
| Database | `mist` |

Runner evidence from run `28531904790`:

- Docker image `mysql:8.4` was available on the Windows runner.
- The temporary MySQL restore-check container became ready.
- The selected deployment backup was imported into the temporary database.
- Restore validation passed, including schema validation against the restored
  `mist` database.
- The workflow reported
  `RestoreBackupPath=<docker-root>\backups\mist-<timestamp>.sql`.
- Cleanup removed the temporary container
  `mist-mysql-restore-check-<timestamp>`.

## TDX Runtime Smoke Evidence

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28533769291` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28533769291` |
| Job | `84589758293` |
| Final status | Success |
| Branch | `master` |
| Commit | `0ceba9cf31e3e348449ce600f40c2de3186f8a7f` |
| Runner | `<windows-runner-name>` |
| Machine | `<windows-machine-name>` |
| Datasource root | `<datasource-root>` |
| Appliance root | `<appliance-root>` |
| Base URL | `http://127.0.0.1:9001` |
| WebSocket URL | Derived as `ws://127.0.0.1:9001/ws/quote/deploy-runtime-smoke` |
| Symbol | `600519.SH` |
| Sector | Default `880081.SH` |
| Period/count | `1d` / `2` |
| Timeout | `20` seconds |
| Optional reference smoke | Not enabled |
| Optional finance/report smoke | Not enabled |
| Optional formula smoke | Not enabled |
| Live quote requirement | Not enabled |
| WebSocket subscription mutation | Not enabled |

Runner evidence from run `28533769291`:

- The deploy wrapper invoked
  `<datasource-root>\scripts\run-runtime-checks.ps1` with
  `-SkipScriptSelfTest`, keeping production runtime smoke separate from
  datasource source-tree static tests.
- Datasource SDK preflight passed:
  - `.env` was found at `<datasource-root>\.env`.
  - `TDX_SDK_PATH` existed at `F:/quant/tdx/PYPlugins/user`.
  - `tqcenter.py` was found.
  - `TPythClient.dll` was found in the parent directory.
  - `QMT_SDK_PATH` was empty and treated as disabled.
- TDX WinSW runtime probe passed:
  - Health keys were present.
  - Raw TDX call endpoint passed.
  - Normalized bars query endpoint passed.
  - WebSocket bridge ping/pong passed.
- Appliance health check was skipped because
  `<appliance-root>\health-check.ps1` was not present; the runtime smoke
  continued because this script is optional for the host datasource root.
- TDX basic HTTP smoke passed, covering providers, bars, snapshots, sector
  query, sector list, trading dates, securities, security info, and
  price-volume paths.
- TDX WebSocket smoke passed.
- The run ended with `All selected runtime checks passed.`

Follow-up fixes made before the successful run:

- Run `28532922891` failed before runtime checks because the deploy wrapper used
  array splatting for a PowerShell script; parameters were bound positionally.
  Commit `4c719063d0d3449f5ca774deac09acde9650c43f` fixed the wrapper to use
  named-parameter hashtable splatting and added a binding regression test.
- Run `28533201503` failed in datasource source-tree self-test, not runtime
  health. Commit `488958a505c6c534d4b48daaf3103106071ae63f` made deploy-side
  runtime smoke pass `-SkipScriptSelfTest` by default.
- Run `28533443197` reached runtime smoke but failed sector membership because
  the non-ASCII sector default was unsafe through the Windows Actions
  PowerShell path. Run `28533574973` passed with explicit
  `sector=880081.SH`. Commit
  `0ceba9cf31e3e348449ce600f40c2de3186f8a7f` changed deploy-side defaults to
  the ASCII sector code `880081.SH`, and run `28533769291` passed without
  explicitly providing the `sector` input.

Datasource health snapshot after smoke from the Mac:

| Field | Value |
| --- | --- |
| URL | `http://<windows-lan-ip>:9001/health` |
| HTTP status | `200 OK` |
| `status` | `ok` |
| `instance` | `tdx` |
| `adapter` | `TDXAdapter` |
| `connections` | `1` |
| `tdxHttpReachable` | `true` |
| `tqInitialized` | `true` |
| `wsConnected` | `true` |
| `subscribedCount` | `0` |
| `activeSubscriptions` | `[]` |
| `quoteCallbackCount` | `0` |
| `quoteCallbackRejectedCount` | `0` |
| `eventQueueDepth` | `0` |
| `eventQueueCapacity` | `1000` |
| `collectorState` | `not_started` |
| Last quote callback fields | `null` |

## Judgment

The deployed runtime baseline is marked known-good for the verified production
baseline from the Mac verification host. Deploy, Windows-local health, gateway
proxy health, datasource smoke, MySQL restore rehearsal, raw LAN probes, and
canonical hostname probes passed. The canonical hostname relies on Mac-local
host resolution rather than LAN-wide DNS.

Passed or recorded:

- Repository refs, remotes, intended pinned image tags, compose topology, runtime
  defaults, and gateway probe method were recorded.
- `Deploy Windows Mist Stack` run `28531193330` completed successfully after
  `web-gateway` was recreated after app services.
- Windows-local gateway Mist API, gateway Chan API, host datasource health, and
  backend-container-to-host datasource health passed in run `28531193330`.
- Mac-side raw LAN gateway probes passed for frontend, Mist API, and Chan API.
- Mac-side canonical hostname probes passed for Mist API and Chan API after
  `<gateway-hostname>` resolved to `<windows-lan-ip>` without `--resolve`.
- MySQL restore rehearsal run `28531904790` imported and validated backup
  `<docker-root>\backups\mist-<timestamp>.sql`, then removed the
  temporary restore container.
- TDX runtime smoke run `28533769291` completed successfully on
  `<windows-runner-name>` at deploy commit
  `0ceba9cf31e3e348449ce600f40c2de3186f8a7f`, covering SDK preflight, TDX
  WinSW runtime probe, basic HTTP smoke, and WebSocket smoke.
- Datasource `/health` after smoke returned `200 OK` from the Mac with
  `tdxHttpReachable=true`, `tqInitialized=true`, `wsConnected=true`,
  `subscribedCount=0`, `activeSubscriptions=[]`, and `eventQueueDepth=0`.
- Secret redaction review found no secrets in copied snippets.

Failed or blocked:

- Mac-local GHCR image manifest checks returned `unauthorized`, though runner
  GHCR pull succeeded.
- `Deploy Windows Mist Stack` run `28519192627` failed because Windows-local
  gateway Mist API health returned HTTP `502`.
- `Deploy Windows Mist Stack` run `28529821620` reproduced the gateway HTTP
  `502`; stdout diagnostics showed nginx `connect() failed (111: Connection
  refused)` to upstream `http://172.18.0.5:8001/app/hello`.
- The gateway HTTP `502` from runs `28519192627` and `28529821620` was resolved
  by run `28531193330`.
- Local monitoring metrics at `127.0.0.1:8787` were not available.
- LAN-wide DNS for `<gateway-hostname>` is not configured; canonical hostname
  verification currently depends on this Mac's local host resolution.

Exact follow-up commands for future drift checks:

- Recheck `dscacheutil -q host -a name <gateway-hostname>`.
- Recheck `curl --noproxy '*' http://<gateway-hostname>/api/mist/app/hello`.
- Recheck `curl --noproxy '*' http://<gateway-hostname>/api/chan/app/hello`.
