# Mist Production Baseline Latest Rerun Evidence - 2026-07-02 Round 2

Status: known-good for the latest production baseline rerun.

This rerun used the latest `origin/master` refs at execution time and preserved
single-attempt deploy semantics. No retry behavior was added to deployment or
validation scripts.

## Baseline Context

| Field | Value |
| --- | --- |
| Baseline date | 2026-07-02 |
| Verification host | Mac workspace `/Users/moyui/sean/mist` |
| Windows runner | `mist-api-windows-01`, machine `DESKTOP-T3B1O2J` |
| Windows LAN IP | `192.168.31.182` |
| Gateway hostname | `www.moyui.mist` |
| Hostname resolution | Mac-local host resolution |
| Docker root | `E:\quant\MistDocker` |
| Datasource root | `F:\quant\MistAPI\datasource` |

## Latest Refs And Images

| Repository | Latest `origin/master` ref |
| --- | --- |
| `mist` | `82a1c78ed4e080b70de49281a43e1e6d2c1fda66` |
| `mist-fe` | `c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| `mist-deploy` | `61e631e095f88bc7a51092b6ea909b2da868a981` |
| `mist-datasource` | `922ae3e889be32832fe52bbe08fa1173ed3bbaba` |

| Component | Image |
| --- | --- |
| Backend | `ghcr.io/mist-trade/mist:82a1c78ed4e080b70de49281a43e1e6d2c1fda66` |
| Frontend | `ghcr.io/mist-trade/mist-fe:c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine` |

Image build evidence:

| Repository | Workflow | Run | Status |
| --- | --- | --- | --- |
| `mist` | `Build Docker Images` | `28584043799` | Success for `82a1c78ed4e080b70de49281a43e1e6d2c1fda66` |
| `mist-fe` | `Build Frontend Docker Image` | `28564798552` | Success for `c9bb33588b55d8509526cf71b38ae4b26e52b790` |

Rollback tags supplied to deployment:

- Backend: `85ef3c6bb9ca8cb9cbc00d0ba94e86608536834a`
- Frontend: `c9bb33588b55d8509526cf71b38ae4b26e52b790`

## Windows Deployment Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28584226945` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28584226945` |
| Job | `84751686516` |
| Final status | Success |
| `mist-deploy` ref | `61e631e095f88bc7a51092b6ea909b2da868a981` |
| Backend image | `ghcr.io/mist-trade/mist:82a1c78ed4e080b70de49281a43e1e6d2c1fda66` |
| Frontend image | `ghcr.io/mist-trade/mist-fe:c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| Web gateway image | `docker.m.daocloud.io/library/nginx:1.27-alpine` |

Deployment evidence:

- Inline GHCR login completed with `Login Succeeded`.
- Backend image `82a1c78ed4e080b70de49281a43e1e6d2c1fda66` was pulled.
- Frontend image `c9bb33588b55d8509526cf71b38ae4b26e52b790` was deployed.
- MySQL was running and healthy.
- Pre-migration backup was created:
  `E:\quant\MistDocker\backups\mist-20260702-184736.sql`.
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
  `E:\quant\MistDocker\diagnostics\20260702-184744`.
- Deployment completed without reinstalling, removing, or replacing the
  host-side `mist-tdx-datasource` WinSW service.

## MySQL Restore Rehearsal

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28584359632` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28584359632` |
| Job | `84752135249` |
| Final status | Success |
| Backup path | `E:\quant\MistDocker\backups\mist-20260702-184736.sql` |
| Temporary container | `mist-mysql-restore-check-20260702-184912` |

Restore evidence:

- Docker image `mysql:8.4` was available.
- Temporary MySQL container reached ready state.
- Backup imported into the temporary database.
- Restored schema validation passed.
- `RestoreBackupPath=E:\quant\MistDocker\backups\mist-20260702-184736.sql`.
- Temporary container was removed after validation.

## TDX Runtime Smoke

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28584479551` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28584479551` |
| Job | `84752534324` |
| Final status | Success |
| Base URL | `http://127.0.0.1:9001` |
| WebSocket URL | `ws://127.0.0.1:9001/ws/quote/deploy-runtime-smoke-20260702-rerun2` |
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
- TDX WinSW runtime probe passed.
- Basic HTTP smoke passed.
- Reference/instrument HTTP smoke passed.
- Finance/report HTTP smoke passed.
- Formula HTTP smoke passed.
- WebSocket smoke passed.
- All selected runtime checks passed.

## TDX Live Quote Subscription Smoke

Positive live quote verification used the backend leader test endpoints.

1. `POST http://www.moyui.mist/api/mist/v1/collector/test/tdx-streaming/subscribe`
   with `{"code":"600519","period":1,"testOnly":true}` returned HTTP `200`,
   `success=true`, `count=1`, request id
   `http-1782989527425-icy8dly7m`, and timestamp
   `2026-07-02T10:52:07Z`.
2. A Mac-side read-only WebSocket observer connected to
   `ws://192.168.31.182:9001/ws/quote/codex-live-quote-observer-20260702-rerun2`.
3. The observer received a ready message showing
   `leaderClientId="mist-backend-tdx"` and `active=["600519.SH"]`.
4. The observer received `pong`.
5. The observer received a `quote` event with snapshot fields including
   `Code="600519.SH"`, `Now=1203.0`, `Last=1203.0`, `Open=1193.01`,
   `High=1215.52`, `Low=1190.51`, `LastClose=1193.01`, `Volume=50870.0`,
   `Amount=612236.06`, `Provider="tdx"`, and
   `AsOf="2026-07-02T18:52:22.505111+08:00"`.
6. `POST http://www.moyui.mist/api/mist/v1/collector/test/tdx-streaming/unsubscribe`
   with the same body returned HTTP `200`, `success=true`, and `count=1`.
7. Post-cleanup datasource health returned HTTP `200` with
   `subscribedCount=0`, `activeSubscriptions=[]`,
   `quoteCallbackCount=12`, `quoteCallbackRejectedCount=0`,
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
| `http://www.moyui.mist/` | HTTP `307`, remote IP `192.168.31.182`, redirects to `/k`; frontend metadata title `Mist` |
| `http://www.moyui.mist/k` | HTTP `200`, remote IP `192.168.31.182`, Next.js Mist page rendered |
| `http://www.moyui.mist/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"`, remote IP `192.168.31.182` |
| `http://www.moyui.mist/api/chan/app/hello` | HTTP `200`, body `Hello World!`, remote IP `192.168.31.182` |
| `http://192.168.31.182/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"` |
| `http://192.168.31.182/api/chan/app/hello` | HTTP `200`, body `Hello World!` |
| `http://192.168.31.182:9001/health` | HTTP `200`, `status="ok"`, `tdxHttpReachable=true`, `tqInitialized=true`, `wsConnected=true`, `subscribedCount=0`, `activeSubscriptions=[]`, `eventQueueDepth=0`, `collectorState="running"` |

No LAN, firewall, gateway routing, or datasource reachability blocker remained
in this rerun. `www.moyui.mist` is still Mac-local host resolution rather than
LAN-wide DNS.

## Final Judgment

This latest rerun is known-good:

- Latest backend and frontend images were built and pushed with pinned commit
  tags.
- Windows runner deployment completed with inline GHCR login, image pulls,
  backup, migrations, service recreation, gateway recreation, health checks,
  and diagnostics capture.
- MySQL restore rehearsal passed against the deployment backup in a temporary
  container.
- TDX runtime smoke passed with basic, reference/instrument, finance/report,
  formula, and WebSocket checks.
- TDX live quote subscription smoke passed through the backend leader path and
  was cleaned up after verification.
- Mac-side DNS, frontend, gateway API, fixed-IP API, and datasource probes all
  passed.

Residual notes:

- `www.moyui.mist` is Mac-local host resolution, not LAN-wide DNS.
- Browser UI automation and full product API contract sweeps remain deferred.
- This evidence file was intentionally added after deploying
  `82a1c78ed4e080b70de49281a43e1e6d2c1fda66`; committing it would create a new
  docs-only `mist` SHA that should not be treated as a new application baseline
  unless a further rerun is explicitly requested.
