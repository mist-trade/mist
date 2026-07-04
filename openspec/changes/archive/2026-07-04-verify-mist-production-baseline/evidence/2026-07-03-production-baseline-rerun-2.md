# Mist Production Baseline Rerun Evidence - 2026-07-03 Round 2

Status: known-good for the production baseline rerun requested on 2026-07-03,
including explicit TDX terminal recovery.

This rerun used pinned backend and frontend image tags that had already passed
their GitHub image build workflows. The deploy target remained the single
Docker-stack plus host-side TDX datasource chain.

## Baseline Context

| Field | Value |
| --- | --- |
| Baseline date | 2026-07-03 |
| Verification host | Mac workspace `<mac-workspace-root>` |
| Windows runner | `<windows-runner-name>`, machine `<windows-machine-name>` |
| Windows LAN IP | `<windows-lan-ip>` |
| Gateway hostname | `<gateway-hostname>` |
| Hostname resolution | Mac-local host resolution |
| Docker root | `<docker-root>` |
| Datasource root | `<datasource-root>` |

## Validated Refs And Images

| Repository | Ref | Evidence |
| --- | --- | --- |
| `mist` | `0c209d41a20e280a4b440dc38b344ebef2c584e8` | Backend image built, deployed, and smoke-tested |
| `mist-fe` | `c9bb33588b55d8509526cf71b38ae4b26e52b790` | Frontend image built, deployed, and gateway-tested |
| `mist-deploy` | `61e631e095f88bc7a51092b6ea909b2da868a981` | Deployment, restore, TDX recovery, and runtime smoke workflows ran from this ref |

Related local or runtime refs:

| Repository | Ref | Evidence |
| --- | --- | --- |
| `mist-datasource` | `9363f392735ccafcdef87d25679190428f6aad19` | Local workspace ref only; this rerun smoke-tested the already deployed host WinSW service in place and did not reinstall or re-checkout datasource code |
| `mist-monitoring` | `66798cf69edcd5fdf757b183ed122fdd11c04f85` | Local contract guardrail fix committed so `mist` CI release contracts pass against the workspace |
| `mist-skills` | `bb364f8bade78e7ebe22a674c4651bb5395628ee` | Local workspace ref only; skills deployment was not in this rerun scope |

| Component | Image |
| --- | --- |
| Backend | `ghcr.io/mist-trade/mist:0c209d41a20e280a4b440dc38b344ebef2c584e8` |
| Frontend | `ghcr.io/mist-trade/mist-fe:c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine` |

Image build evidence:

| Repository | Workflow | Run | Status |
| --- | --- | --- | --- |
| `mist` | `Build Docker Images` | `28632389889` | Success for `0c209d41a20e280a4b440dc38b344ebef2c584e8` |
| `mist-fe` | `Build Frontend Docker Image` | `28564798552` | Success for `c9bb33588b55d8509526cf71b38ae4b26e52b790` |

Rollback tags supplied to deployment:

- Backend: `9f1d239950bc94304887dbb49ae7f38042a73e13`
- Frontend: `c9bb33588b55d8509526cf71b38ae4b26e52b790`

## Local Backend Gates

Local verification from `<mac-workspace-root>/mist`:

- `env TZ=UTC pnpm run test:ci`: 48 suites, 474 tests passed.
- `pnpm run typecheck`: passed.
- `pnpm run build:docker`: `mist`, `chan`, and `mcp-server` compiled
  successfully.
- `pnpm run ci:contracts`: initially failed because the local
  `mist-monitoring` CI workflow no longer matched the required formatting
  contract. The workflow was aligned back to `gofmt -w` plus
  `git diff --exit-code`, then `pnpm run ci:contracts` passed with
  `CI release contract checks passed.`

## Windows Deployment Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28633389531` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28633389531` |
| Job | `84914716004` |
| Final status | Success |
| `mist-deploy` ref | `61e631e095f88bc7a51092b6ea909b2da868a981` |
| Backend image | `ghcr.io/mist-trade/mist:0c209d41a20e280a4b440dc38b344ebef2c584e8` |
| Frontend image | `ghcr.io/mist-trade/mist-fe:c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| Web gateway image | `docker.m.daocloud.io/library/nginx:1.27-alpine` |
| `skip_pull` | `false` |
| `skip_backup` | `false` |
| `skip_migration` | `false` |
| `skip_health_check` | `false` |

Deployment evidence:

- Inline GHCR login completed with `Login Succeeded`.
- Backend image `0c209d41a20e280a4b440dc38b344ebef2c584e8` was pulled.
- Frontend image `c9bb33588b55d8509526cf71b38ae4b26e52b790` was pulled.
- Web gateway image `docker.m.daocloud.io/library/nginx:1.27-alpine` was pulled.
- MySQL was running and healthy.
- Pre-migration backup was created:
  `<docker-root>\backups\mist-<timestamp>.sql`.
- Backup retention cleanup removed 0 item(s).
- Migrations ran; `001_init_core_tables.sql`,
  `002_add_tdx_vol_in_stock.sql`, and
  `003_security_code_identity.sql` were already applied.
- `mist-backend` and `mist-chan-api` were recreated. `mist-fe` was already
  running.
- `mist-web-gateway` was recreated after app service recreation.
- Docker status checks passed for `mysql`, `mist-backend`, `chan-api`,
  `mist-fe`, and `web-gateway`.
- Windows-local direct health checks passed:
  - `http://127.0.0.1:8001/app/hello`
  - `http://127.0.0.1:8008/app/hello`
  - `http://127.0.0.1:80/`
- Windows-local gateway health checks passed:
  - `http://127.0.0.1:80/api/mist/app/hello`
  - `http://127.0.0.1:80/api/chan/app/hello`
- Datasource health checks passed:
  - host: `http://127.0.0.1:9001/health`
  - backend container: `http://host.docker.internal:9001/health`
- Diagnostics were captured at:
  `<docker-root>\diagnostics\<timestamp>`.
- Deployment completed without reinstalling, removing, or replacing the
  host-side `mist-tdx-datasource` WinSW service.

## MySQL Restore Rehearsal

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28633452562` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28633452562` |
| Job | `84914900656` |
| Final status | Success |
| Backup path | `<docker-root>\backups\mist-<timestamp>.sql` |
| Temporary container | `mist-mysql-restore-check-<timestamp>` |

Restore evidence:

- Docker image `mysql:8.4` was available.
- Temporary MySQL container reached ready state.
- Backup imported into the temporary database.
- Restored schema validation passed.
- `RestoreBackupPath=<docker-root>\backups\mist-<timestamp>.sql`.
- Temporary container was removed after validation.

## TDX Terminal Recovery

Workflow: `Recover Windows TDX Datasource` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28633516371` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28633516371` |
| Job | `84915086804` |
| Final status | Success |
| `skip_runtime_login` | `false` |
| `skip_smoke` | `false` |
| Runtime login task | `MistRuntimeLogin` |
| Initialize wait | 30 seconds |
| Health timeout | 120 seconds |

Recovery evidence:

- Existing `TdxW.exe` process was stopped.
- Runtime login task action was updated from the guard AHK steps.
- TDX terminal was started again.
- `MistRuntimeLogin` completed successfully.
- The flow waited 30 seconds for TDX/TQ initialization.
- `scripts\manage-tdx-datasource.ps1 -Action restart` ran through the recovery
  script.
- TDX SDK runtime files were found, including `tqcenter.py` and
  `TPythClient.dll`.
- TDX strategy identity file existed under `<tdx-sdk-path>`.
- Datasource health returned OK at `http://127.0.0.1:9001/health`.
- Windows service `mist-tdx-datasource` ended in `Running` status.
- Native TDX HTTP port `127.0.0.1:17709` had `TcpTestSucceeded=True`.
- Recovery smoke checked health, raw TDX call, normalized bars query, and
  WebSocket bridge.
- `TDX datasource smoke test passed.`
- Recovery result was written to the guard state file under
  `<tdx-guard-state-root>`.

## TDX Runtime Smoke

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28633614499` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28633614499` |
| Job | `84915379328` |
| Final status | Success |
| Base URL | `http://127.0.0.1:9001` |
| WebSocket URL | `ws://127.0.0.1:9001/ws/quote/<runtime-smoke-client-id>` |
| Symbol | `600519.SH` |
| Sector | `880081.SH` |
| Period/count | `1d` / `2` |

Switches used:

- `-IncludeReferenceInstrumentSmoke`
- `-IncludeFinanceReportSmoke`
- `-IncludeFormulaSmoke`
- `-RequireLiveQuote` was not used.
- `-AllowWebSocketSubscriptionChange` was not used.

Smoke evidence:

- Datasource SDK preflight passed. `TDX_SDK_PATH` exists and `tqcenter.py` plus
  `TPythClient.dll` were found. `QMT_SDK_PATH` remained empty and QMT is treated
  as disabled.
- TDX WinSW runtime probe passed, including health, raw TDX call, normalized
  bars query, and WebSocket bridge checks.
- Appliance health-check script was not present and the workflow skipped it;
  the runtime smoke still reported the appliance health check step as passed.
- Basic HTTP smoke passed.
- Reference/instrument HTTP smoke passed.
- Finance/report HTTP smoke passed.
- Formula HTTP smoke passed.
- WebSocket smoke passed.
- All selected runtime checks passed.

## TDX Live Quote Subscription Smoke

Positive live quote verification used the backend leader test endpoints after
TDX recovery.

1. `POST http://<gateway-hostname>/api/mist/v1/collector/test/tdx-streaming/subscribe`
   with `{"code":"600519","period":1,"testOnly":true}` returned HTTP `200`,
   `success=true`, `count=1`, request id `http-<request-id>`, and timestamp
   `2026-07-03T02:05:22Z`.
2. A Mac-side read-only WebSocket observer connected to
   `ws://<windows-lan-ip>:9001/ws/quote/<observer-client-id>`.
3. The observer received a ready message showing
   `leaderClientId="mist-backend-tdx"` and `active=["600519.SH"]`.
4. The observer received `pong`.
5. The observer received a `quote` event with snapshot fields including
   `Code="600519.SH"`, `Now=1199.88`, `Last=1199.88`, `Open=1205.24`,
   `High=1210.14`, `Low=1196.06`, `LastClose=1203.0`, `Volume=10217.0`,
   `Amount=122921.05`, `Provider="tdx"`, and `AsOf="<timestamp>"`.
6. `POST http://<gateway-hostname>/api/mist/v1/collector/test/tdx-streaming/unsubscribe`
   with the same body returned HTTP `200`, `success=true`, request id
   `http-<request-id>`, and `count=1`.
7. Post-cleanup datasource health returned HTTP `200` with
   `subscribedCount=0`, `activeSubscriptions=[]`,
   `quoteCallbackCount=5`, `quoteCallbackRejectedCount=0`,
   `lastQuoteCallbackSymbol="600519.SH"`,
   `lastQuoteCallbackAccepted=true`, `eventQueueDepth=0`, and
   `collectorState="running"`.

Conclusion: subscription-changing live quote smoke passed through the supported
backend leader path after TDX recovery and was cleaned up after verification.

## Mac-Side LAN And Gateway Probes

Host resolution:

```text
name: <gateway-hostname>
ip_address: <windows-lan-ip>
```

Gateway and API probes used `curl --noproxy '*'` from the Mac host.

| Probe | Result |
| --- | --- |
| `http://<gateway-hostname>/` | HTTP `307`, remote IP `<windows-lan-ip>`, redirects to `/k` |
| `http://<gateway-hostname>/` with redirects followed | HTTP `200`, one redirect, final URL `http://<gateway-hostname>/k` |
| `http://<gateway-hostname>/k` | HTTP `200`, remote IP `<windows-lan-ip>` |
| `http://<gateway-hostname>/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"`, remote IP `<windows-lan-ip>` |
| `http://<gateway-hostname>/api/chan/app/hello` | HTTP `200`, body `Hello World!`, remote IP `<windows-lan-ip>` |
| `http://<windows-lan-ip>/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"` |
| `http://<windows-lan-ip>/api/chan/app/hello` | HTTP `200`, body `Hello World!` |
| `http://<windows-lan-ip>:9001/health` | HTTP `200`, `status="ok"`, `tdxHttpReachable=true`, `tqInitialized=true`, `wsConnected=true`, `subscribedCount=0`, `activeSubscriptions=[]`, `eventQueueDepth=0`, `collectorState="running"` |

No LAN, firewall, gateway routing, or datasource reachability blocker remained
in this rerun. `<gateway-hostname>` is still Mac-local host resolution rather
than LAN-wide DNS.

## Smoke Test Findings

No blocking smoke-test issue was found in this rerun. The Windows deployment,
restore rehearsal, TDX terminal recovery, datasource runtime smoke,
backend-leader live quote smoke, and Mac-side gateway probes all passed.

Non-blocking findings and scope boundaries:

- `mist` local `ci:contracts` initially caught a `mist-monitoring` CI contract
  drift. The monitoring workflow was aligned and committed locally before the
  final baseline judgment.
- Datasource source provenance was not re-proven by this rerun. The deployed
  host-side WinSW service was verified in place through recovery, health, HTTP,
  WebSocket, and live quote checks, but the deployment workflow did not
  reinstall, remove, replace, or re-checkout `mist-datasource`.
- `<gateway-hostname>` still depends on Mac-local host resolution, not LAN-wide
  DNS.
- `/` intentionally redirects to `/k`; following redirects returns HTTP `200`.
- Runtime smoke reported `QMT_SDK_PATH` empty, so QMT is treated as disabled.
- Runtime smoke skipped the missing legacy appliance `health-check.ps1`; the
  datasource and gateway checks covered the active deployment path.
- TDX terminal recovery intentionally stopped and restarted TDX before
  restarting `mist-tdx-datasource`.
- Browser UI automation and the full product API contract sweep remained
  deferred by the runbook default.
- GitHub Actions emitted Node 20 deprecation warnings for `actions/checkout@v4`
  running under Node 24 compatibility behavior; the workflows completed
  successfully.

## Final Judgment

This rerun is known-good:

- Current backend and frontend images were built and pushed with pinned commit
  tags.
- Local backend gates passed after the adjacent monitoring CI contract drift
  was fixed.
- Windows runner deployment completed with inline GHCR login, image pull,
  backup, migrations, service recreation, gateway recreation, health checks,
  and diagnostics capture.
- MySQL restore rehearsal passed against the deployment backup in a temporary
  container.
- TDX terminal recovery passed with TDX stop/start, runtime login, datasource
  restart, datasource smoke, and post-recovery live quote validation.
- TDX runtime smoke passed with basic, reference/instrument, finance/report,
  formula, and WebSocket checks.
- TDX live quote subscription smoke passed through the backend leader path and
  was cleaned up after verification.
- Mac-side DNS, frontend, gateway API, fixed-IP API, and datasource probes all
  passed.

Residual notes:

- `<gateway-hostname>` is Mac-local host resolution, not LAN-wide DNS.
- Browser UI automation and full product API contract sweeps remain deferred.
