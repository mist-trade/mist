# Mist Production Baseline Rerun Evidence - 2026-07-03 Round 5

Status: known-good.

This rerun validates the production baseline after new `mist` and `mist-deploy`
`master` commits. The backend commit only changes docs/OpenSpec/evidence files
relative to the previous runtime baseline; no `apps/`, `libs/`, `tools/`,
`package.json`, `pnpm-lock.yaml`, or deploy runtime code changed in `mist`.
Runtime confidence comes from the image build workflow plus the live Windows
deployment and smoke checks below.

## Target Refs And Images

| Repository | Commit |
| --- | --- |
| `mist` | `ba4442ec369177f24854c3eed4e30f492d71a2d5` |
| `mist-fe` | `600b9fce2aedd9fc7d82074f9d7a65bc15a14815` |
| `mist-deploy` | `bf0285d95cc8fe5b98f5525cbb2e113d263c1fcb` |
| `mist-monitoring` | `dfed8df10e2f5cd5170bb358e66002c00d85c078` |

| Component | Image Or Runtime |
| --- | --- |
| Backend target | `ghcr.io/mist-trade/mist:ba4442ec369177f24854c3eed4e30f492d71a2d5` |
| Frontend target | `ghcr.io/mist-trade/mist-fe:600b9fce2aedd9fc7d82074f9d7a65bc15a14815` |
| Previous backend rollback tag | `0ca11bbc3872cc78396a44e047e4e20f23d1a4b2` |
| Previous frontend rollback tag | `600b9fce2aedd9fc7d82074f9d7a65bc15a14815` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10` |
| Public host | `www.moyui.mist` |

Image build status before deploy:

- `mist` workflow `Build Docker Images` run `28667925089`: success for
  `ba4442ec369177f24854c3eed4e30f492d71a2d5`.
- `mist-fe` workflow `Build Frontend Docker Image` run `28636232882`: success
  for `600b9fce2aedd9fc7d82074f9d7a65bc15a14815`.

## Local Checks

Run from `mist-deploy`:

| Command | Result |
| --- | --- |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-workflow-config.ps1` | Passed |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-compose-config.ps1` | Passed |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-windows-monitoring.ps1` | Passed |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-defaults.ps1` | Passed |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-docker-appliance.ps1` | Passed |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-health-check-docker-appliance.ps1` | Passed |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-tdx-runtime-smoke.ps1` | Passed |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-manage-tdx-datasource.ps1` | Passed |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-mysql-backup-restore-script.ps1` | Passed |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-appliance-diagnostics.ps1` | Passed |
| `bash scripts/test-deploy-mac-watchdog.sh` | Passed |
| `git diff --check` in `mist-deploy` | Passed |
| `openspec validate --specs --strict` in `mist` | Passed: 27 specs |

Note: running `scripts/test-deploy-mac-watchdog.sh` through `sh` is invalid
because the test and sourced deploy script are Bash scripts and use process
substitution. The correct `bash scripts/test-deploy-mac-watchdog.sh` invocation
passed.

## Deploy And Restore Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28668201813` | Passed | Checked out `mist-deploy@bf0285d95cc8fe5b98f5525cbb2e113d263c1fcb`, deployed backend `ba4442ec369177f24854c3eed4e30f492d71a2d5`, frontend `600b9fce2aedd9fc7d82074f9d7a65bc15a14815`, digest-pinned web gateway image, and public host `www.moyui.mist`. |

Key deploy log evidence:

- GHCR login succeeded.
- Pulled backend, frontend, and digest-pinned gateway images.
- `DockerRoot=E:\quant\MistDocker`.
- `DatasourceRoot=F:\quant\MistAPI\datasource`.
- `BackupPath=E:\quant\MistDocker\backups\mist-20260703-225621.sql`.
- MySQL was healthy before migration.
- Database migrations ran from `/app/deploy/database/migrations`; all existing
  migrations were already applied.
- `mist-backend` and `mist-chan-api` were recreated.
- `mist-web-gateway` was recreated after app service recreation.
- `mysql`, `mist-backend`, `chan-api`, `mist-fe`, and `web-gateway` were
  reported running.
- Windows-local direct health passed for backend and Chan.
- Windows-local gateway health passed for frontend, Mist API, and Chan API.
- Host datasource health passed at `http://127.0.0.1:9001/health`.
- Backend-container-to-host datasource probe passed through
  `http://host.docker.internal:9001/health`.
- Diagnostics were captured at `E:\quant\MistDocker\diagnostics\20260703-225633`.

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28668308105` | Passed | Restored `E:\quant\MistDocker\backups\mist-20260703-225621.sql` into temporary container `mist-mysql-restore-check-20260703-225804`; import and schema validation passed; temporary container was removed. |

## TDX Runtime Evidence

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28668413005` | Passed | Datasource SDK preflight passed; WinSW runtime probe passed; TDX basic HTTP, reference/instrument, finance/report, formula, and WebSocket checks passed. |

The runtime smoke was run with `require_live_quote=false` and
`allow_websocket_subscription_change=false`. Positive live quote validation is
recorded separately through the backend leader path.

## Monitoring Evidence

Mac-side scrape of `http://192.168.31.182:9109/metrics` after deploy confirmed:

- `mist_windows_exporter_up 1`.
- `mist_datasource_tdx_http_reachable 1`.
- `mist_datasource_tq_initialized 1`.
- `mist_datasource_ws_connected 1`.
- `mist_datasource_event_queue_depth 0`.
- `mist_windows_probe_success{target="tdx_http_17709"} 1`.
- `mist_windows_process_running{process="TdxW.exe"} 1`.
- `mist_windows_service_running{service="mist-tdx-datasource"} 1`.
- `mist_docker_container_running{container="mist-backend"} 1`.
- `mist_docker_container_running{container="mist-chan-api"} 1`.
- `mist_docker_container_running{container="mist-mysql"} 1`.

This confirms the previous monitoring Docker metric label discrepancy is fixed
in the deployed Windows exporter configuration.

## Mac-Side Probes

| Probe | Result |
| --- | --- |
| `dscacheutil -q host -a name www.moyui.mist` | Resolved to `192.168.31.182` |
| `http://www.moyui.mist/` | HTTP `307`, `Location: /k`, remote IP `192.168.31.182` |
| `http://www.moyui.mist/k` | HTTP `200`, remote IP `192.168.31.182` |
| `http://www.moyui.mist/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"` |
| `http://www.moyui.mist/api/chan/app/hello` | HTTP `200`, body `Hello World!` |
| `http://192.168.31.182/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"` |
| `http://192.168.31.182/api/chan/app/hello` | HTTP `200`, body `Hello World!` |
| `http://192.168.31.182:9001/health` | HTTP `200`, `status="ok"`, `tdxHttpReachable=true`, `tqInitialized=true`, `wsConnected=true`, `subscribedCount=0`, `activeSubscriptions=[]`, `eventQueueDepth=0` |
| `http://192.168.31.182:9109/metrics` | HTTP `200`, required monitoring metrics present and healthy |

## Live Quote Verification

The positive live quote check used the backend leader path:

1. Called backend test subscribe endpoint through the gateway for `600519`.
2. Subscribe endpoint returned HTTP `200`, `success=true`, and `count=1`.
3. Opened read-only datasource WebSocket observer
   `ws://192.168.31.182:9001/ws/quote/baseline-live-quote-observer-20260703-2302`.
4. Observer received `ready` with `leaderClientId="mist-backend-tdx"` and
   `active=["600519.SH"]`.
5. Observer received `type="quote"` with `snapshot.Code="600519.SH"` and
   `snapshot.Now=1194.45`; `snapshot.AsOf="2026-07-03T23:02:34.803518+08:00"`.
6. Called backend test unsubscribe endpoint for cleanup.
7. Unsubscribe endpoint returned HTTP `200`, `success=true`, and `count=1`.

Final datasource health after cleanup:

- `subscribedCount=0`.
- `activeSubscriptions=[]`.
- `quoteCallbackRejectedCount=0`.
- `lastQuoteCallbackAccepted=true`.
- `lastQuoteCallbackSymbol="600519.SH"`.
- `eventQueueDepth=0`.
- `collectorState="running"`.

## Conclusion

Round 5 is known-good. The baseline passed image build verification, deploy
script local checks, Windows Docker deployment, MySQL restore rehearsal, TDX
runtime smoke, Mac-side LAN probes, Windows monitoring metrics, and
backend-leader live quote verification.
