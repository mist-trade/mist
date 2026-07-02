# Mist Production Baseline Rerun Evidence - 2026-07-02

Status: known-good for the rerun production baseline after the backend,
frontend, deploy, datasource, monitoring, and skills fixes were pushed to their
respective `master` branches. This run used the authenticated Windows
self-hosted runner for deployment and restore/smoke validation, then verified
LAN reachability from the Mac host.

## Baseline Context

| Field | Value |
| --- | --- |
| Baseline date | 2026-07-02 |
| Operator | moyui |
| Verification host | Mac workspace `/Users/moyui/sean/mist` |
| Windows runner | `mist-api-windows-01`, machine `DESKTOP-T3B1O2J` |
| Windows LAN IP | `192.168.31.182` |
| Gateway hostname | `www.moyui.mist` |
| Hostname resolution | Mac-local host resolution; no LAN-wide DNS record |
| Docker root | `E:\quant\MistDocker` |
| Datasource root | `F:\quant\MistAPI\datasource` |

## Repository Refs And Images

| Repository | Commit |
| --- | --- |
| `mist` | `3aa23e3558da87899337d215cf52aa8663a755ba` |
| `mist-fe` | `c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| `mist-deploy` | `61e631e095f88bc7a51092b6ea909b2da868a981` |
| `mist-datasource` | `b7cfd2a61f76cbf5478c127c56ca12124b69878d` |
| `mist-monitoring` | `41020a5c672a2b30259307666a8054710be58bd2` |
| `mist-skills` | `eaf8896eca26cc091cee74cdbb41f76320e4a210` |

| Component | Image |
| --- | --- |
| Backend | `ghcr.io/mist-trade/mist:3aa23e3558da87899337d215cf52aa8663a755ba` |
| Frontend | `ghcr.io/mist-trade/mist-fe:c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine` |

Previous rollback tags supplied to deployment:

- Backend: `32364ecad2199a8ea011c5423541692834fab710`
- Frontend: `23b483388a9f40d9ad9b22529729e1f75f369726`

## Pre-Deploy Fixes Verified

Backend Docker image build initially failed in GitHub Actions because tests used
the Linux runner's UTC timezone, while local Mac tests had passed in the local
timezone. The fix made A-share market boundaries and datasource query date
formatting explicitly use `Asia/Shanghai`, and made a schedule test timestamp
timezone-explicit.

Local backend verification after the fix:

- `env TZ=UTC pnpm run test:ci`: 56 suites, 463 tests passed.
- `pnpm run typecheck`: passed.
- `pnpm run ci:contracts`: passed.
- `MIST_WORKSPACE_ROOT=/private/tmp/mist-ci-single-de7622a pnpm run ci:contracts`:
  passed with sibling repo checks skipped, matching GitHub single-repo checkout.
- `pnpm run build:docker`: `mist`, `chan`, and `mcp-server` compiled
  successfully.
- Default-timezone target suite covering K boundary, EastMoney, TDX source,
  schedule MCP, and EastMoney collector tests passed: 5 suites, 64 tests.

GitHub image build evidence:

| Repository | Workflow | Run | Status |
| --- | --- | --- | --- |
| `mist` | `Build Docker Images` | `28565366107` | Success; validate and linux/amd64 build/push passed |
| `mist-fe` | `Build Frontend Docker Image` | `28564798552` | Success |

## Windows Deployment Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28565503344` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28565503344` |
| Job | `84691851921` |
| Final status | Success |
| `mist-deploy` ref | `61e631e095f88bc7a51092b6ea909b2da868a981` |
| Backend image | `ghcr.io/mist-trade/mist:3aa23e3558da87899337d215cf52aa8663a755ba` |
| Frontend image | `ghcr.io/mist-trade/mist-fe:c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| Web gateway image | `docker.m.daocloud.io/library/nginx:1.27-alpine` |
| `skip_pull` | `false` |
| `skip_backup` | `false` |
| `skip_migration` | `false` |
| `skip_health_check` | `false` |

Runner evidence:

- Inline GHCR login completed with `Login Succeeded`.
- Backend image `3aa23e3558da87899337d215cf52aa8663a755ba` pulled.
- MySQL was running and healthy.
- Pre-migration backup was created:
  `E:\quant\MistDocker\backups\mist-20260702-123156.sql`.
- Migrations ran; `001_init_core_tables.sql`,
  `002_add_tdx_vol_in_stock.sql`, and
  `003_security_code_identity.sql` were already applied.
- `mist-fe`, `mist-backend`, and `mist-chan-api` were recreated.
- `mist-web-gateway` was explicitly recreated after backend/Chan/frontend
  recreation, so nginx resolved the current containers.
- Docker status health checks passed for `mysql`, `mist-backend`, `chan-api`,
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
  `E:\quant\MistDocker\diagnostics\20260702-123209`.
- Deployment completed without reinstalling, removing, or replacing the
  host-side `mist-tdx-datasource` WinSW service.

## MySQL Restore Rehearsal

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28565608678` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28565608678` |
| Job | `84692160551` |
| Final status | Success |
| Backup path | `E:\quant\MistDocker\backups\mist-20260702-123156.sql` |
| Temporary container | `mist-mysql-restore-check-20260702-123335` |

Restore evidence:

- Docker image `mysql:8.4` was available.
- Temporary MySQL container reached ready state.
- Backup imported into the temporary database.
- Restored schema validation passed.
- `RestoreBackupPath=E:\quant\MistDocker\backups\mist-20260702-123156.sql`.
- Temporary container was removed after validation.

## TDX Runtime Smoke

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28565678747` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28565678747` |
| Job | `84692367314` |
| Final status | Success |
| Base URL | `http://127.0.0.1:9001` |
| WebSocket URL | `ws://127.0.0.1:9001/ws/quote/deploy-runtime-smoke-20260702` |
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
- Basic HTTP smoke passed: health, provider manifest, raw/normalized bars,
  raw/normalized snapshots, sectors, sector list, trading calendar,
  securities, security info, and price-volume paths.
- Reference/instrument HTTP smoke passed.
- Finance/report HTTP smoke passed.
- Formula HTTP smoke passed.
- WebSocket ping/pong smoke passed.
- All selected runtime checks passed.

## TDX Live Quote Subscription Smoke

Operator approval was given on 2026-07-02 to run the subscription-changing live
quote smoke. Browser UI automation and full product API contract sweeps remained
deferred.

First, `Run Windows TDX Runtime Smoke` was dispatched with
`-RequireLiveQuote` and `-AllowWebSocketSubscriptionChange` using a non-leader
client id:

| Field | Value |
| --- | --- |
| Run | `28568506730` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28568506730` |
| Job | `84700795056` |
| Final status | Failed as expected for non-leader subscription mutation |
| Client id | `deploy-live-quote-smoke-20260702` |

Evidence from run `28568506730`:

- Datasource SDK preflight passed.
- TDX WinSW runtime probe passed.
- Basic HTTP smoke passed.
- WebSocket live-quote step failed with
  `DATASOURCE_WS_NOT_LEADER`.
- The datasource reported `leaderClientId="mist-backend-tdx"`.

This failure confirmed that the datasource correctly rejects subscription
mutation from non-leader clients. The live quote subscription was then verified
through the production backend leader path:

1. `POST http://www.moyui.mist/api/mist/v1/collector/test/tdx-streaming/subscribe`
   with `{"code":"600519","period":1,"testOnly":true}` returned HTTP `200`,
   `success=true`, and `count=1`.
2. A Mac-side read-only WebSocket observer connected to
   `ws://192.168.31.182:9001/ws/quote/codex-live-quote-observer-20260702`.
3. The observer received a ready message showing
   `leaderClientId="mist-backend-tdx"` and `active=["600519.SH"]`.
4. The observer received a `quote` event with snapshot fields including
   `Code="600519.SH"`, `Now=1209.94`, `LastClose=1193.01`,
   and `AsOf="2026-07-02T13:52:16.314824+08:00"`.
5. `POST http://www.moyui.mist/api/mist/v1/collector/test/tdx-streaming/unsubscribe`
   with the same body returned HTTP `200`, `success=true`, and `count=1`.
6. Post-cleanup datasource health returned HTTP `200` with
   `subscribedCount=0`, `activeSubscriptions=[]`,
   `quoteCallbackCount=5`, `quoteCallbackRejectedCount=0`,
   `lastQuoteCallbackSymbol="600519.SH"`,
   `lastQuoteCallbackAccepted=true`, `eventQueueDepth=0`, and
   `collectorState="running"`.

Conclusion: subscription-changing live quote smoke passed through the supported
backend leader path and was cleaned up after verification.

## Mac-Side LAN And Gateway Probes

Host resolution:

```text
name: www.moyui.mist
ip_address: 192.168.31.182
```

Gateway and API probes used `curl --noproxy '*'` from the Mac host.

| Probe | Result |
| --- | --- |
| `http://www.moyui.mist/` | HTTP `307`, remote IP `192.168.31.182`, redirects to `/k` |
| `http://www.moyui.mist/k` | HTTP `200`, remote IP `192.168.31.182`, Next.js Mist page rendered |
| `http://www.moyui.mist/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"`, remote IP `192.168.31.182` |
| `http://www.moyui.mist/api/chan/app/hello` | HTTP `200`, body `Hello World!`, remote IP `192.168.31.182` |
| `http://192.168.31.182/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"` |
| `http://192.168.31.182/api/chan/app/hello` | HTTP `200`, body `Hello World!` |
| `http://192.168.31.182:9001/health` | HTTP `200`, `status="ok"`, `tdxHttpReachable=true`, `tqInitialized=true`, `wsConnected=true`, `eventQueueDepth=0`, `collectorState="not_started"` |

No LAN, firewall, gateway routing, or datasource reachability blocker remained
in this rerun.

## Final Judgment

This rerun is known-good:

- Backend and frontend images were built and pushed with pinned commit tags.
- Windows runner deployment completed with backup, migrations, service
  recreation, gateway recreation, health checks, and diagnostics capture.
- The previous gateway `502` failure was resolved by recreating
  `web-gateway` after app service recreation.
- MySQL restore rehearsal passed against the deployment backup in a temporary
  container.
- TDX runtime smoke passed with basic, reference/instrument, finance/report,
  formula, and WebSocket checks.
- TDX live quote subscription smoke passed through the backend leader path and
  was cleaned up after verification.
- Mac-side DNS, frontend, gateway API, fixed-IP API, and datasource probes all
  passed.

Residual notes:

- `www.moyui.mist` is still Mac-local host resolution, not LAN-wide DNS.
- Browser UI automation and full product API contract sweeps remain deferred.
- GitHub Actions emitted Node 20 deprecation warnings for third-party actions
  running under the Node 24 compatibility behavior; the workflows themselves
  completed successfully.
