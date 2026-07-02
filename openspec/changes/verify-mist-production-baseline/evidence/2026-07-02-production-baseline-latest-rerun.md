# Mist Production Baseline Latest Rerun Evidence - 2026-07-02

Status: known-good for the latest production baseline rerun.

This rerun used the latest `origin/master` refs at the time of execution. It was
started after earlier same-day deploy attempts were blocked by transient GHCR
connectivity errors from the Windows runner. The successful run used the same
single-attempt deploy workflow semantics; no retry behavior was added to the
deploy scripts.

## Baseline Context

| Field | Value |
| --- | --- |
| Baseline date | 2026-07-02 |
| Verification host | Mac workspace `<mac-workspace-root>` |
| Windows runner | `<windows-runner-name>`, machine `<windows-machine-name>` |
| Windows LAN IP | `<windows-lan-ip>` |
| Gateway hostname | `<gateway-hostname>` |
| Hostname resolution | Mac-local host resolution |
| Docker root | `<docker-root>` |
| Datasource root | `<datasource-root>` |

## Latest Refs And Images

| Repository | Latest `origin/master` ref |
| --- | --- |
| `mist` | `85ef3c6bb9ca8cb9cbc00d0ba94e86608536834a` |
| `mist-fe` | `c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| `mist-deploy` | `61e631e095f88bc7a51092b6ea909b2da868a981` |
| `mist-datasource` | `922ae3e889be32832fe52bbe08fa1173ed3bbaba` |

| Component | Image |
| --- | --- |
| Backend | `ghcr.io/mist-trade/mist:85ef3c6bb9ca8cb9cbc00d0ba94e86608536834a` |
| Frontend | `ghcr.io/mist-trade/mist-fe:c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine` |

Image build evidence:

| Repository | Workflow | Run | Status |
| --- | --- | --- | --- |
| `mist` | `Build Docker Images` | `28578785154` | Success for `85ef3c6bb9ca8cb9cbc00d0ba94e86608536834a` |
| `mist-fe` | `Build Frontend Docker Image` | `28564798552` | Success for `c9bb33588b55d8509526cf71b38ae4b26e52b790` |

Rollback tags supplied to deployment:

- Backend: `3aa23e3558da87899337d215cf52aa8663a755ba`
- Frontend: `23b483388a9f40d9ad9b22529729e1f75f369726`

## Windows Deployment Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28579818265` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28579818265` |
| Job | `84737141655` |
| Final status | Success |
| `mist-deploy` ref | `61e631e095f88bc7a51092b6ea909b2da868a981` |
| Backend image | `ghcr.io/mist-trade/mist:85ef3c6bb9ca8cb9cbc00d0ba94e86608536834a` |
| Frontend image | `ghcr.io/mist-trade/mist-fe:c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| Web gateway image | `docker.m.daocloud.io/library/nginx:1.27-alpine` |

Deployment evidence:

- Inline GHCR login completed with `Login Succeeded`.
- Backend image `85ef3c6bb9ca8cb9cbc00d0ba94e86608536834a` was pulled.
- Frontend image `c9bb33588b55d8509526cf71b38ae4b26e52b790` was deployed.
- MySQL was running and healthy.
- Pre-migration backup was created:
  `<docker-root>\backups\mist-<timestamp>.sql`.
- Backup retention cleanup removed `0` item(s).
- Migrations ran; `001_init_core_tables.sql`,
  `002_add_tdx_vol_in_stock.sql`, and
  `003_security_code_identity.sql` were already applied.
- `mist-fe`, `mist-backend`, and `mist-chan-api` were recreated.
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
| Run | `28580029153` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28580029153` |
| Job | `84737809947` |
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

## TDX Runtime Smoke

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Field | Value |
| --- | --- |
| Run | `28580153802` |
| URL | `https://github.com/mist-trade/mist-deploy/actions/runs/28580153802` |
| Job | `84738208310` |
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
- Basic HTTP smoke passed.
- Reference/instrument HTTP smoke passed.
- Finance/report HTTP smoke passed.
- Formula HTTP smoke passed.
- WebSocket smoke passed.
- All selected runtime checks passed.

## TDX Live Quote Subscription Smoke

Positive live quote verification used the backend leader test endpoints.

1. `POST http://<gateway-hostname>/api/mist/v1/collector/test/tdx-streaming/subscribe`
   with `{"code":"600519","period":1,"testOnly":true}` returned HTTP `200`,
   `success=true`, and `count=1`.
2. A Mac-side read-only WebSocket observer connected to
   `ws://<windows-lan-ip>:9001/ws/quote/<observer-client-id>`.
3. The observer received a ready message showing
   `leaderClientId="mist-backend-tdx"` and `active=["600519.SH"]`.
4. The observer received a `quote` event with snapshot fields including
   `Code="600519.SH"`, `Now=1203.0`, `LastClose=1193.01`, and
   `AsOf="2026-07-02T17:35:57.393837+08:00"`.
5. `POST http://<gateway-hostname>/api/mist/v1/collector/test/tdx-streaming/unsubscribe`
   with the same body returned HTTP `200`, `success=true`, and `count=1`.
6. Post-cleanup datasource health returned HTTP `200` with
   `subscribedCount=0`, `activeSubscriptions=[]`,
   `quoteCallbackCount=9`, `quoteCallbackRejectedCount=0`,
   `lastQuoteCallbackSymbol="600519.SH"`,
   `lastQuoteCallbackAccepted=true`, `eventQueueDepth=0`, and
   `collectorState="running"`.

Conclusion: subscription-changing live quote smoke passed through the supported
backend leader path and was cleaned up after verification.

## Mac-Side LAN And Gateway Probes

Host resolution:

```text
name: <gateway-hostname>
ip_address: <windows-lan-ip>
```

Gateway and API probes used `curl --noproxy '*'` from the Mac host.

| Probe | Result |
| --- | --- |
| `http://<gateway-hostname>/` | HTTP `307`, remote IP `<windows-lan-ip>`, redirects to `/k`; frontend metadata title `Mist` |
| `http://<gateway-hostname>/k` | HTTP `200`, remote IP `<windows-lan-ip>`, Next.js Mist page rendered |
| `http://<gateway-hostname>/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"`, remote IP `<windows-lan-ip>` |
| `http://<gateway-hostname>/api/chan/app/hello` | HTTP `200`, body `Hello World!`, remote IP `<windows-lan-ip>` |
| `http://<windows-lan-ip>/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"` |
| `http://<windows-lan-ip>/api/chan/app/hello` | HTTP `200`, body `Hello World!` |
| `http://<windows-lan-ip>:9001/health` | HTTP `200`, `status="ok"`, `tdxHttpReachable=true`, `tqInitialized=true`, `wsConnected=true`, `subscribedCount=0`, `activeSubscriptions=[]`, `eventQueueDepth=0`, `collectorState="running"` |

No LAN, firewall, gateway routing, or datasource reachability blocker remained
in this latest rerun.

## GHCR Connectivity Note

Earlier attempts on 2026-07-02 failed at the Windows runner to GHCR boundary:

- run `28577024870`: `docker compose pull` failed with GHCR manifest `EOF`;
- run `28577310629`: `docker login ghcr.io` failed with TLS handshake timeout;
- run `28578333117`: `docker login ghcr.io` failed with TLS handshake timeout.

The latest run `28579818265` passed GHCR login and image pulls without any code
change or retry change, so the earlier failures are consistent with transient
network/registry connectivity rather than a deploy script or permission
regression.

## Final Judgment

This latest rerun is known-good:

- Latest backend and frontend images were built and pushed with pinned commit
  tags.
- Windows runner deployment completed with GHCR login, image pulls, backup,
  migrations, service recreation, gateway recreation, health checks, and
  diagnostics capture.
- MySQL restore rehearsal passed against the deployment backup in a temporary
  container.
- TDX runtime smoke passed with basic, reference/instrument, finance/report,
  formula, and WebSocket checks.
- TDX live quote subscription smoke passed through the backend leader path and
  was cleaned up after verification.
- Mac-side DNS, frontend, gateway API, fixed-IP API, and datasource probes all
  passed.

Residual notes:

- `<gateway-hostname>` is still Mac-local host resolution, not LAN-wide DNS.
- Browser UI automation and full product API contract sweeps remain deferred.
- GitHub Actions emitted Node 20 deprecation warnings for actions running under
  Node 24 compatibility behavior; the workflows themselves completed
  successfully.
