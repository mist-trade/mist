# Mist Production Baseline Rerun Evidence - 2026-07-04 Round 6

Status: known-good after deploy-script fix and rerun.

This rerun validates the production baseline after new `mist`, `mist-fe`,
`mist-deploy`, and `mist-monitoring` `master` commits. The first Docker stack
deploy attempt exposed a Windows PowerShell compatibility bug in deploy
diagnostics collection. That bug was fixed in `mist-deploy` and the full
Windows deployment baseline was rerun successfully.

## Target Refs And Images

| Repository | Commit |
| --- | --- |
| `mist` | `13f328409777b4d4c769b89acbb524ac91cefa5d` |
| `mist-fe` | `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f` |
| `mist-deploy` | `614be72a92082ca8c119891099f3f5ce904813f2` |
| `mist-monitoring` | `dc4c63534905f74b1f7e59b0db736f5c577abd42` |

| Component | Image Or Runtime |
| --- | --- |
| Backend target | `ghcr.io/mist-trade/mist:13f328409777b4d4c769b89acbb524ac91cefa5d` |
| Frontend target | `ghcr.io/mist-trade/mist-fe:100cf5d72fa6be83bbb1badbcccd7fdd20ec159f` |
| Previous backend rollback tag | `ba4442ec369177f24854c3eed4e30f492d71a2d5` |
| Previous frontend rollback tag | `600b9fce2aedd9fc7d82074f9d7a65bc15a14815` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10` |
| Public host | `www.moyui.mist` |

Image build and CI status before deploy:

- `mist` workflow `Build Docker Images` run `28683843372`: success for
  `13f328409777b4d4c769b89acbb524ac91cefa5d`.
- `mist-fe` workflow `Build Frontend Docker Image` run `28683864638`: success
  for `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f`.
- `mist-monitoring` workflow `Monitoring CI` run `28683857395`: success for
  `dc4c63534905f74b1f7e59b0db736f5c577abd42`.

## Local Checks

Run from `mist`:

| Command | Result |
| --- | --- |
| `env TZ=UTC pnpm run test:ci` | Passed: 48 suites, 478 tests |
| `pnpm run typecheck` | Passed |
| `pnpm run ci:contracts` | Passed |
| `pnpm run build:docker` | Passed |
| `openspec validate --specs --strict` | Passed: 27 specs |
| `git diff --check` | Passed |

Run from `mist-deploy` after the diagnostics compatibility fix:

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
| `git diff --check` | Passed |

Run from `mist-monitoring`:

| Command | Result |
| --- | --- |
| `env GOCACHE=/private/tmp/go-cache-mist-monitoring sh scripts/verify.sh` | Passed |
| `git diff --check` | Passed |

## Deploy-Script Compatibility Finding

The first Docker stack deploy attempt failed after application health had
already passed.

| Run | Result | Evidence |
| --- | --- | --- |
| `28684131651` | Failed | `mysql`, `mist-backend`, `chan-api`, `mist-fe`, `web-gateway`, direct HTTP health, gateway HTTP health, host datasource health, and backend-container-to-host datasource probe all passed. The deploy failed during success diagnostics with `Method invocation failed because [System.IO.Path] does not contain a method named 'GetRelativePath'.` |

Root cause:

- `scripts/collect-docker-appliance-diagnostics.ps1` used
  `[System.IO.Path]::GetRelativePath`.
- The Windows runner executes deployment scripts with Windows PowerShell
  5.1/.NET Framework, where that API is unavailable.
- The failure was in diagnostics collection, not in Docker, migrations,
  gateway routing, datasource health, or app runtime.

Fix:

- `mist-deploy@614be72a92082ca8c119891099f3f5ce904813f2` replaced the
  unsupported API with a Windows PowerShell compatible relative child path
  helper.
- `scripts/test-docker-appliance-diagnostics.ps1` now asserts the unsupported
  API is not used.
- Targeted and full deploy-script local checks passed after the fix.

## Windows Monitoring Evidence

Workflow: `Deploy Windows Monitoring` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28684065956` | Passed | Deployed `mist-monitoring@dc4c63534905f74b1f7e59b0db736f5c577abd42` to `E:\quant\MistMonitoring\mist-windows-exporter`, listened on `0.0.0.0:9109`, enabled the firewall rule, started the WinSW service, and passed local metrics smoke at `http://127.0.0.1:9109/metrics`. |

Mac-side scrape of `http://192.168.31.182:9109/metrics` after deployment
confirmed:

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

## Deploy And Restore Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28684308758` | Passed | Checked out `mist-deploy@614be72a92082ca8c119891099f3f5ce904813f2`, deployed backend `13f328409777b4d4c769b89acbb524ac91cefa5d`, frontend `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f`, digest-pinned web gateway image, and public host `www.moyui.mist`. |

Key deploy log evidence:

- GHCR login succeeded.
- Pulled backend, frontend, and digest-pinned gateway images.
- `DockerRoot=E:\quant\MistDocker`.
- `DatasourceRoot=F:\quant\MistAPI\datasource`.
- `BackupPath=E:\quant\MistDocker\backups\mist-20260704-053432.sql`.
- MySQL was healthy before migration.
- Database migrations ran from `/app/deploy/database/migrations`.
- `mysql`, `mist-backend`, `chan-api`, `mist-fe`, and `web-gateway` were
  reported running.
- Windows-local direct health passed for backend and Chan.
- Windows-local gateway health passed for frontend, Mist API, and Chan API.
- Host datasource health passed at `http://127.0.0.1:9001/health`.
- Backend-container-to-host datasource probe passed through
  `http://host.docker.internal:9001/health`.
- Diagnostics were captured at `E:\quant\MistDocker\diagnostics\20260704-053440`.
- Deployment completed successfully.

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28684364992` | Passed | Restored `E:\quant\MistDocker\backups\mist-20260704-053432.sql` into temporary container `mist-mysql-restore-check-20260704-053603`; import and schema validation passed; temporary container was removed. |

## TDX Runtime Evidence

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28684412396` | Passed | Datasource SDK preflight passed; TDX WinSW runtime probe passed; TDX basic HTTP, reference/instrument, finance/report, formula, and WebSocket checks passed. |

The runtime smoke was run with `require_live_quote=false` and
`allow_websocket_subscription_change=false`. Positive live quote validation is
recorded separately through the backend leader path.

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
   `ws://192.168.31.182:9001/ws/quote/baseline-live-quote-observer-20260704-0539`.
4. Observer received `ready` with `leaderClientId="mist-backend-tdx"` and
   `active=["600519.SH"]`.
5. Observer received `type="quote"` with `snapshot.Code="600519.SH"` and
   `snapshot.Now=1194.45`; `snapshot.AsOf="2026-07-04T05:39:40.357179+08:00"`.
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

Round 6 is known-good. The baseline passed image build verification, deploy
script local checks, monitoring CI and deployment, Windows Docker deployment,
MySQL restore rehearsal, TDX runtime smoke, Mac-side LAN probes, Windows
monitoring metrics, and backend-leader live quote verification.
