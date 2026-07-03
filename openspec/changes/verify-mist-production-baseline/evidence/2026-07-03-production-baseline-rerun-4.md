# Mist Production Baseline Rerun Evidence - 2026-07-03 Round 4

Status: known-good.

This rerun validates the current production baseline after the deploy-side
gateway image pinning and public-host parameterization changes. The round uses
the latest `mist`, `mist-fe`, and `mist-deploy` `master` heads available during
the rerun.

## Target Refs And Images

| Repository | Commit |
| --- | --- |
| `mist` | `0ca11bbc3872cc78396a44e047e4e20f23d1a4b2` |
| `mist-fe` | `600b9fce2aedd9fc7d82074f9d7a65bc15a14815` |
| `mist-deploy` | `9c84229770e6a957459268108276be339c7a0e03` |
| `mist-monitoring` | `3430f1e4fbdaf3415ef3b1ac67d9dbf7f05c4773` |

| Component | Image Or Runtime |
| --- | --- |
| Backend target | `ghcr.io/mist-trade/mist:0ca11bbc3872cc78396a44e047e4e20f23d1a4b2` |
| Frontend target | `ghcr.io/mist-trade/mist-fe:600b9fce2aedd9fc7d82074f9d7a65bc15a14815` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10` |
| Public host | `www.moyui.mist` |

Image build status before deploy:

- `mist` workflow `Build Docker Images` run `28653454101`: success for
  `0ca11bbc3872cc78396a44e047e4e20f23d1a4b2`.
- `mist-fe` workflow `Build Frontend Docker Image` run `28636232882`: success
  for `600b9fce2aedd9fc7d82074f9d7a65bc15a14815`.

## Local Gates

Run from the `mist` repo:

| Command | Result |
| --- | --- |
| `env TZ=UTC pnpm run test:ci` | Passed: 48 suites, 477 tests |
| `pnpm run typecheck` | Passed |
| `pnpm run ci:contracts` | Passed |
| `pnpm run build:docker` | Passed |

Run from the `mist-deploy` repo:

| Check | Result |
| --- | --- |
| Docker deploy script, compose, diagnostics, workflow, health-check tests | Passed |
| Datasource manager, TDX runtime smoke wrapper, TDX restart/login/register, TDX guard tests | Passed |
| MySQL restore script, Windows monitoring deploy script, Mac watchdog tests | Passed |
| `openspec validate windows-deployment-script-hygiene --strict` | Passed |
| `git diff --check` | Passed |

## Deploy And Restore Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28655203299` | Passed | Checked out `mist-deploy@9c84229770e6a957459268108276be339c7a0e03`, deployed backend `0ca11bbc3872cc78396a44e047e4e20f23d1a4b2`, frontend `600b9fce2aedd9fc7d82074f9d7a65bc15a14815`, digest-pinned web gateway image, and public host `www.moyui.mist`. |

Key deploy log evidence:

- `DockerRoot=E:\quant\MistDocker`.
- `DatasourceRoot=F:\quant\MistAPI\datasource`.
- `BackupPath=E:\quant\MistDocker\backups\mist-20260703-184058.sql`.
- Database migrations ran from `/app/deploy/database/migrations`.
- `mist-backend`, `chan-api`, and `web-gateway` were recreated or refreshed.
- `mysql`, `mist-backend`, `chan-api`, `mist-fe`, and `web-gateway` were
  reported running.
- Windows-local direct health passed for backend and Chan.
- Windows-local gateway health passed for frontend, Mist API, and Chan API.
- Host datasource health passed at `http://127.0.0.1:9001/health`.
- Backend-container-to-host datasource probe passed through
  `http://host.docker.internal:9001/health`.
- Diagnostics were captured at `E:\quant\MistDocker\diagnostics\20260703-184108`.

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28655312866` | Passed | Restored `E:\quant\MistDocker\backups\mist-20260703-184058.sql` into a temporary MySQL container, imported the backup, validated schema migrations, and removed the temporary container. |

## TDX Recovery And Runtime Evidence

Workflow: `Recover Windows TDX Datasource` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28655379573` | Passed | Stopped and started TDX, ran `MistRuntimeLogin`, restarted `mist-tdx-datasource`, confirmed datasource health, service `Running`, local TDX TCP reachability, and datasource smoke. |

Key recovery evidence:

- `Datasource health OK: http://127.0.0.1:9001/health`.
- `Status : Running` for `mist-tdx-datasource`.
- `TcpTestSucceeded : True` for local TDX native HTTP port `17709`.
- `TDX datasource smoke test passed`.

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28655501458` | Passed | Datasource SDK preflight passed; WinSW runtime probe passed; TDX basic HTTP, reference/instrument, finance/report, formula, and WebSocket checks passed. |

The runtime smoke was run with `require_live_quote=false` and
`allow_websocket_subscription_change=false`. Positive live quote validation is
recorded separately through the backend leader path.

Workflow: `Manage Windows Datasource` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28655548057` | Passed | `action=status` confirmed TDX SDK runtime files, `mist-tdx-datasource` status `Running`, local TDX TCP reachability, and datasource health. |

## Monitoring Evidence

Workflow: `Deploy Windows Monitoring` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28655592895` | Passed | Deployed `mist-monitoring@3430f1e4fbdaf3415ef3b1ac67d9dbf7f05c4773`, configured monitoring firewall, started the service, and passed local metrics smoke at `http://127.0.0.1:9109/metrics`. |

Mac-side metrics probe confirmed:

- `mist_windows_exporter_up 1`.
- `mist_datasource_tdx_http_reachable 1`.
- `mist_datasource_tq_initialized 1`.
- `mist_datasource_ws_connected 1`.
- `mist_windows_probe_success{target="tdx_http_17709"} 1`.
- `mist_windows_process_running{process="TdxW.exe"} 1`.
- `mist_windows_service_running{service="mist-tdx-datasource"} 1`.

Observation: the same metrics scrape reported
`mist_docker_container_running{container="chan-api"} 0` and
`mist_docker_container_running{container="mysql"} 0`, while the deploy workflow
reported both services running and the Mac-side gateway/API probes passed. This
is recorded as a monitoring metric-value discrepancy, not a baseline blocker.
The monitoring deployment smoke contract validates required metric names rather
than requiring every runtime value to be healthy.

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
| `http://192.168.31.182:9001/health` | HTTP `200`, `status="ok"`, `tdxHttpReachable=true`, `tqInitialized=true`, `wsConnected=true` |
| `http://192.168.31.182:9109/metrics` | HTTP `200`, required monitoring metrics present |

## Live Quote Verification

The positive live quote check used the backend leader path:

1. Opened read-only datasource WebSocket observer
   `ws://192.168.31.182:9001/ws/quote/baseline-live-quote-observer-20260703-2`.
2. Observer received `ready` with `leaderClientId="mist-backend-tdx"` and no
   active subscriptions.
3. Called backend test subscribe endpoint through the gateway for `600519`.
4. Subscribe endpoint returned HTTP `200`, `success=true`, and `count=1`.
5. Observer received `type="quote"` with `stock_code="600519.SH"`.
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

Round 4 is known-good. The baseline passed local backend gates, deploy-script
contract tests, Windows Docker deployment, MySQL restore rehearsal, explicit TDX
recovery, datasource runtime smoke, datasource status, Windows monitoring
deployment, Mac-side LAN probes, and backend-leader live quote verification.
