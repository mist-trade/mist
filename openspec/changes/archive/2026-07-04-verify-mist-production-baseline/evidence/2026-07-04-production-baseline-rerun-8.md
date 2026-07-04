# Mist Production Baseline Rerun Evidence - 2026-07-04 Round 8

Status: known-good after `mcp-server` decommission and Windows reboot recovery.

This rerun validates the production baseline after `apps/mcp-server` was
removed from the backend repository. During the run, the Windows host rebooted;
the final green baseline therefore includes TDX/runtime recovery, datasource
update/restart, Docker stack redeploy, restore rehearsal, TDX runtime smoke,
Mac-side probes, monitoring metrics, and backend-leader live quote verification.

## Target Refs And Images

| Repository | Commit |
| --- | --- |
| `mist` | `7c3efc9af7455b61712284805c94c2d9e6d42156` |
| `mist-fe` | `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f` |
| `mist-deploy` | `e25ebaf2bd8ef61acc5bcede6149f9c988083a6d` |
| `mist-monitoring` | `3a953771bcda26df412d622db989b226b17c8ea0` |
| `mist-datasource` | `6fddd74c8247efaebfa570116734f0838b767f8c` |

| Component | Image Or Runtime |
| --- | --- |
| Backend target | `ghcr.io/mist-trade/mist:7c3efc9af7455b61712284805c94c2d9e6d42156` |
| Frontend target | `ghcr.io/mist-trade/mist-fe:100cf5d72fa6be83bbb1badbcccd7fdd20ec159f` |
| Previous backend rollback tag | `0844d4860b5243bf727399a3678fb7668fe21b11` |
| Previous frontend rollback tag | `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f` |
| Datasource root | `F:\quant\MistAPI\datasource` |
| Docker root | `E:\quant\MistDocker` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10` |
| Public host | `www.moyui.mist` |

## Local Checks

Run from `mist`:

| Command | Result |
| --- | --- |
| `env CI=true TZ=UTC pnpm run test:ci` | Passed: 43 suites, 409 tests |
| `env CI=true pnpm run typecheck` | Passed |
| `env CI=true pnpm run ci:contracts` | Passed: CI release contract checks passed |
| `openspec validate --specs --strict` | Passed: 32 items |
| `env CI=true pnpm run build:docker` | Passed; command builds only `mist` and `chan` |

The backend `build:docker` script is now `nest build mist && nest build chan`.
`git ls-files apps/mcp-server` returned no tracked files. Remaining
`mcp-server` references are tests, docs, archived OpenSpec evidence, or ignored
stale local build output.

## CI Status Before Deploy

| Repository | Workflow | Run | Result |
| --- | --- | --- | --- |
| `mist` | `Build Docker Images` | `28691682444` | Success for `7c3efc9af7455b61712284805c94c2d9e6d42156` |
| `mist-fe` | `Build Frontend Docker Image` | `28683864638` | Success for `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f` |
| `mist-monitoring` | `Monitoring CI` | `28689634895` | Success for `3a953771bcda26df412d622db989b226b17c8ea0` |
| `mist-deploy` | `Test Deploy Scripts` | `28687793422` | Success for `e25ebaf2bd8ef61acc5bcede6149f9c988083a6d` |
| `mist-datasource` | `Datasource CI` | `28687581977` | Success for `6fddd74c8247efaebfa570116734f0838b767f8c` |

## Windows Monitoring Evidence

Workflow: `Deploy Windows Monitoring` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28691839698` | Passed | Deployed `mist-monitoring@3a953771bcda26df412d622db989b226b17c8ea0` to `E:\quant\MistMonitoring\mist-windows-exporter`, listened on `0.0.0.0:9109`, updated the firewall rule, started the service, and passed Windows-local metrics smoke at `http://127.0.0.1:9109/metrics`. |

Non-blocking annotation: GitHub Actions reported the standard Node.js 20
deprecation warning for `actions/checkout@v4`.

## Reboot And Datasource Recovery Notes

The first Docker deploy attempt after the Windows reboot was cancelled before
deployment steps ran:

| Run | Result | Evidence |
| --- | --- | --- |
| `28692001746` | Cancelled | The Windows runner was online and idle, but the deploy job stayed queued after the reboot. No production deployment steps had run, so the run was cancelled and redispatched. |

The next Docker deploy reached app and gateway health, then failed only at host
datasource health because the reboot left `mist-tdx-datasource` down:

| Run | Result | Evidence |
| --- | --- | --- |
| `28692248615` | Failed at datasource health | MySQL, backend, Chan, frontend, and gateway health passed; `mist-tdx-datasource` health at `http://127.0.0.1:9001/health` was not reachable. Diagnostics were captured at `E:\quant\MistDocker\diagnostics\20260704-103604`. |

Recovery and datasource status checks showed the TDX terminal path had recovered,
but the deployed datasource service still needed an update to the current
runtime commit:

| Run | Result | Evidence |
| --- | --- | --- |
| `28692405488` | Failed after TDX recovery | TDX was started, `MistRuntimeLogin` succeeded, SDK files were found, and `TDX_SDK_PATH=F:/quant/tdx/PYPlugins/user`; datasource health still did not pass within the timeout. |
| `28692508038` | Status captured | `mist-tdx-datasource` was stopped; `127.0.0.1:17709` succeeded; WinSW XML pointed at `F:\quant\MistAPI\datasource`; logs showed TQ initialization had succeeded before shutdown. |
| `28692547768` | Start failed health timeout | Datasource did not stay healthy after start. |
| `28692623600` | Status captured | Service was still stopped while `127.0.0.1:17709` and SDK paths were healthy. |
| `28692700312` | Passed | Updated `mist-datasource` to `6fddd74c8247efaebfa570116734f0838b767f8c`, restarted the service, and passed `http://127.0.0.1:9001/health`. Final service status was `Running`, `127.0.0.1:17709` was reachable, and TQ initialization succeeded. |

## Deploy And Restore Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28692783408` | Passed | Validate job passed; deploy job checked out `mist-deploy@e25ebaf2bd8ef61acc5bcede6149f9c988083a6d`, deployed backend `7c3efc9af7455b61712284805c94c2d9e6d42156`, frontend `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f`, digest-pinned web gateway image, and public host `www.moyui.mist`. |

Key deploy log evidence:

- GHCR login succeeded.
- Pulled backend, frontend, and digest-pinned gateway images.
- `DockerRoot=E:\quant\MistDocker`.
- `DatasourceRoot=F:\quant\MistAPI\datasource`.
- `BackupPath=E:\quant\MistDocker\backups\mist-20260704-105731.sql`.
- MySQL was healthy before migration.
- Database migrations ran from `/app/deploy/database/migrations`; existing
  migrations were already applied.
- `mysql`, `mist-backend`, `chan-api`, `mist-fe`, and `web-gateway` were
  reported running.
- Windows-local direct health passed for backend and Chan.
- Windows-local gateway health passed for frontend, Mist API, and Chan API.
- Host datasource health passed at `http://127.0.0.1:9001/health`.
- Backend-container-to-host datasource probe passed through
  `http://host.docker.internal:9001/health`.
- Diagnostics were captured at `E:\quant\MistDocker\diagnostics\20260704-105739`.
- Deployment completed successfully.

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28692839573` | Passed | Restored `E:\quant\MistDocker\backups\mist-20260704-105731.sql` into temporary container `mist-mysql-restore-check-20260704-105928`; import and schema validation passed; temporary container was removed. |

## TDX Runtime Evidence

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28692910608` | Passed | Datasource SDK preflight passed; TDX WinSW runtime probe passed; TDX basic HTTP, reference/instrument, finance/report, formula, and WebSocket checks passed. |

The runtime smoke was run with `require_live_quote=false` and
`allow_websocket_subscription_change=false`. Positive live quote validation is
recorded separately through the backend leader path.

## Mac-Side Probes

| Probe | Result |
| --- | --- |
| `dscacheutil -q host -a name www.moyui.mist` | Resolved to `192.168.31.182` |
| `http://www.moyui.mist/` | HTTP `307`, `Location: /k` |
| `http://www.moyui.mist/k` | HTTP `200` |
| `http://www.moyui.mist/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"` |
| `http://www.moyui.mist/api/chan/app/hello` | HTTP `200`, body `Hello World!` |
| `http://192.168.31.182/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"` |
| `http://192.168.31.182/api/chan/app/hello` | HTTP `200`, body `Hello World!` |
| `http://192.168.31.182:9001/health` | HTTP `200`, `status="ok"`, `tdxHttpReachable=true`, `tqInitialized=true`, `wsConnected=true`, `subscribedCount=0`, `activeSubscriptions=[]`, `eventQueueDepth=0` |
| `http://192.168.31.182:9109/metrics` | HTTP `200`, required monitoring metrics present and healthy |

Mac-side monitoring scrape confirmed:

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

## Live Quote Verification

The positive live quote check used the backend leader path:

1. Called backend test subscribe endpoint through the gateway for `600519`.
2. Subscribe endpoint returned HTTP `200`, `success=true`, and `count=1`.
3. Opened read-only datasource WebSocket observer
   `ws://192.168.31.182:9001/ws/quote/baseline-live-quote-observer-20260704-1107`.
4. Observer received `ready` with `leaderClientId="mist-backend-tdx"` and
   `active=["600519.SH"]`.
5. Observer received `type="quote"` with `snapshot.Code="600519.SH"`,
   `snapshot.Now=1194.45`, `snapshot.Open=1205.24`,
   `snapshot.LastClose=1203.0`, and
   `snapshot.AsOf="2026-07-04T11:07:21.342459+08:00"`.
6. Called backend test unsubscribe endpoint for cleanup.
7. Unsubscribe endpoint returned HTTP `200`, `success=true`, and `count=1`.

Final datasource health after cleanup:

- `subscribedCount=0`.
- `activeSubscriptions=[]`.
- `quoteCallbackCount=6`.
- `quoteCallbackRejectedCount=0`.
- `lastQuoteCallbackAccepted=true`.
- `lastQuoteCallbackSymbol="600519.SH"`.
- `eventQueueDepth=0`.
- `collectorState="running"`.

## Conclusion

Round 8 is known-good. The baseline passed local backend gates after
`mcp-server` decommission, all relevant CI gates, Windows monitoring deploy,
Windows TDX recovery and datasource update, Windows Docker deployment, MySQL
restore rehearsal, TDX runtime smoke, Mac-side LAN probes, monitoring metrics,
and backend-leader live quote verification.
