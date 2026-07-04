# Mist Production Baseline Rerun Evidence - 2026-07-04 Round 7

Status: known-good after CI fixes and full rerun.

This rerun validates the production baseline after new `mist`, `mist-deploy`,
and `mist-monitoring` `master` commits. Initial remote checks found two CI
blockers outside the runtime path. Both were fixed and revalidated before
deployment.

## Target Refs And Images

| Repository | Commit |
| --- | --- |
| `mist` | `0844d4860b5243bf727399a3678fb7668fe21b11` |
| `mist-fe` | `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f` |
| `mist-deploy` | `e25ebaf2bd8ef61acc5bcede6149f9c988083a6d` |
| `mist-monitoring` | `3372534000ecb4e01deae53fb00799f851298e7f` |

| Component | Image Or Runtime |
| --- | --- |
| Backend target | `ghcr.io/mist-trade/mist:0844d4860b5243bf727399a3678fb7668fe21b11` |
| Frontend target | `ghcr.io/mist-trade/mist-fe:100cf5d72fa6be83bbb1badbcccd7fdd20ec159f` |
| Previous backend rollback tag | `13f328409777b4d4c769b89acbb524ac91cefa5d` |
| Previous frontend rollback tag | `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10` |
| Public host | `www.moyui.mist` |

Image build and CI status before deploy:

- `mist` workflow `Build Docker Images` run `28687577080`: success for
  `0844d4860b5243bf727399a3678fb7668fe21b11`.
- `mist-fe` workflow `Build Frontend Docker Image` run `28683864638`: success
  for `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f`.
- `mist-monitoring` workflow `Monitoring CI` run `28687793283`: success for
  `3372534000ecb4e01deae53fb00799f851298e7f`.
- `mist-deploy` workflow `Test Deploy Scripts` run `28687793422`: success for
  `e25ebaf2bd8ef61acc5bcede6149f9c988083a6d`.

## CI Findings And Fixes

Two remote CI blockers were found before deployment:

| Repository | Failing Run | Root Cause | Fix |
| --- | --- | --- | --- |
| `mist-monitoring` | `28687586260` | `toolchain go1.26.4` caused CI to target Go `1.26.4`; `golangci-lint-action@v6` was built with Go `1.24` and refused the higher target version. | `mist-monitoring@3372534000ecb4e01deae53fb00799f851298e7f` removed the toolchain override and kept CI on the module's declared `go 1.22` path. |
| `mist-deploy` | `28687591051` | `scripts/test-docker-appliance-diagnostics.ps1` matched raw JSON text; Windows PowerShell `ConvertTo-Json` spacing differed from the test expectation. | `mist-deploy@e25ebaf2bd8ef61acc5bcede6149f9c988083a6d` parses the metadata JSON and asserts field values. |

## Local Checks

Run from `mist`:

| Command | Result |
| --- | --- |
| `env TZ=UTC pnpm run test:ci` | Passed: 49 suites, 481 tests |
| `pnpm run typecheck` | Passed |
| `pnpm run ci:contracts` | Passed |
| `pnpm run build:docker` | Passed |
| `openspec validate --specs --strict` | Passed: 27 specs |

Run from `mist-monitoring`:

| Command | Result |
| --- | --- |
| `env GOCACHE=/private/tmp/go-cache-mist-monitoring sh scripts/verify.sh` | Passed |
| `git diff --check` | Passed |

Run from `mist-deploy`:

| Command | Result |
| --- | --- |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-appliance-diagnostics.ps1` | Passed |
| `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-workflow-config.ps1` | Passed |
| `git diff --check` | Passed |

The pushed `mist-deploy` CI also reran the full hosted Windows deploy-script
test suite successfully in run `28687793422`.

## Windows Monitoring Evidence

Workflow: `Deploy Windows Monitoring` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28687885873` | Passed | Deployed `mist-monitoring@3372534000ecb4e01deae53fb00799f851298e7f` to `E:\quant\MistMonitoring\mist-windows-exporter`, listened on `0.0.0.0:9109`, enabled the firewall rule, started the WinSW service, and passed local metrics smoke at `http://127.0.0.1:9109/metrics`. |

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
| `28687936813` | Passed | Validate job passed on hosted Windows; deploy job checked out `mist-deploy@e25ebaf2bd8ef61acc5bcede6149f9c988083a6d`, deployed backend `0844d4860b5243bf727399a3678fb7668fe21b11`, frontend `100cf5d72fa6be83bbb1badbcccd7fdd20ec159f`, digest-pinned web gateway image, and public host `www.moyui.mist`. |

Key deploy log evidence:

- GHCR login succeeded.
- Pulled backend, frontend, and digest-pinned gateway images.
- `DockerRoot=E:\quant\MistDocker`.
- `DatasourceRoot=F:\quant\MistAPI\datasource`.
- `BackupPath=E:\quant\MistDocker\backups\mist-20260704-073632.sql`.
- MySQL was healthy before migration.
- Database migrations ran from `/app/deploy/database/migrations`.
- `mysql`, `mist-backend`, `chan-api`, `mist-fe`, and `web-gateway` were
  reported running.
- Windows-local direct health passed for backend and Chan.
- Windows-local gateway health passed for frontend, Mist API, and Chan API.
- Host datasource health passed at `http://127.0.0.1:9001/health`.
- Backend-container-to-host datasource probe passed through
  `http://host.docker.internal:9001/health`.
- Diagnostics were captured at `E:\quant\MistDocker\diagnostics\20260704-073646`.
- Deployment completed successfully.

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28688014111` | Passed | Restored `E:\quant\MistDocker\backups\mist-20260704-073632.sql` into temporary container `mist-mysql-restore-check-20260704-073822`; import and schema validation passed; temporary container was removed. |

## TDX Runtime Evidence

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28688049863` | Passed | Datasource SDK preflight passed; TDX WinSW runtime probe passed; TDX basic HTTP, reference/instrument, finance/report, formula, and WebSocket checks passed. |

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
   `ws://192.168.31.182:9001/ws/quote/baseline-live-quote-observer-20260704-0741`.
4. Observer received `ready` with `leaderClientId="mist-backend-tdx"` and
   `active=["600519.SH"]`.
5. Observer received `type="quote"` with `snapshot.Code="600519.SH"` and
   `snapshot.Now=1194.45`; `snapshot.AsOf="2026-07-04T07:41:52.384637+08:00"`.
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

Round 7 is known-good. The baseline passed image build verification, CI fixes
and reruns, local backend/deploy/monitoring checks, Windows monitoring
deployment, Windows Docker deployment, MySQL restore rehearsal, TDX runtime
smoke, Mac-side LAN probes, Windows monitoring metrics, and backend-leader live
quote verification.
