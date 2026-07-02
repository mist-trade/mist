# Production Baseline Verification Runbook

This runbook records the current end-to-end Mist production baseline verification
flow. It is the operational companion to the OpenSpec evidence under
`openspec/changes/verify-mist-production-baseline/evidence/`.

Latest known-good evidence:

- `openspec/changes/verify-mist-production-baseline/evidence/2026-07-03-production-baseline-rerun.md`
- Backend baseline image:
  `ghcr.io/mist-trade/mist:9f1d239950bc94304887dbb49ae7f38042a73e13`
- Frontend baseline image:
  `ghcr.io/mist-trade/mist-fe:c9bb33588b55d8509526cf71b38ae4b26e52b790`
- Deploy scripts baseline:
  `mist-deploy@61e631e095f88bc7a51092b6ea909b2da868a981`

## Scope

The baseline covers:

- backend/frontend image build and GHCR push
- Windows self-hosted runner deployment
- Docker Compose health for `mysql`, `mist-backend`, `chan-api`, `mist-fe`,
  and `web-gateway`
- gateway routing for frontend, Mist API, and Chan API
- host datasource health and backend-container-to-host datasource health
- MySQL backup restore rehearsal
- TDX datasource HTTP/WebSocket runtime smoke
- TDX live quote subscription smoke through the backend leader path
- Mac-side LAN and hostname probes

Deferred by default:

- browser UI automation
- full product API contract sweep across every endpoint

## Preconditions

- Run GitHub workflow commands from an authenticated `gh` CLI session.
- Use pinned commit SHAs for deployable image tags. Do not use `latest` for a
  production baseline.
- On the Mac, use `pwsh-preview` for local PowerShell checks when needed.
- Windows runner labels: `self-hosted`, `windows`, `mist-api`.
- Docker root: `<docker-root>`.
- Datasource root: `<datasource-root>`.
- Gateway hostname: `<gateway-hostname>`, resolved locally on the Mac to
  `<windows-lan-ip>`.
- The datasource remains a host-side WinSW service. The Docker app deploy must
  not reinstall, remove, or replace `mist-tdx-datasource`.

## Local Backend Gates

Run these from the `mist` repo before using a backend commit as the deploy tag:

```bash
env TZ=UTC pnpm run test:ci
pnpm run typecheck
pnpm run ci:contracts
pnpm run build:docker
```

The UTC test is intentional. It protects A-share market time logic and source
date formatting from depending on the runner timezone.

For a single-repo CI checkout simulation:

```bash
mkdir -p /private/tmp/mist-ci-single
ln -s <mac-workspace-root>/mist /private/tmp/mist-ci-single/mist
MIST_WORKSPACE_ROOT=/private/tmp/mist-ci-single pnpm run ci:contracts
```

## Image Build Verification

Backend workflow:

```bash
gh run list --repo mist-trade/mist \
  --workflow "Build Docker Images" \
  --limit 5 \
  --json databaseId,headSha,status,conclusion,createdAt,displayTitle,url
```

Frontend workflow:

```bash
gh run list --repo mist-trade/mist-fe \
  --workflow "Build Frontend Docker Image" \
  --limit 5 \
  --json databaseId,headSha,status,conclusion,createdAt,displayTitle,url
```

The deploy tag is ready only after the matching workflow run succeeds.

## Windows Deployment

Run from `mist-deploy` with the selected backend and frontend image tags:

```bash
gh workflow run deploy-windows-docker-appliance.yml \
  --repo mist-trade/mist-deploy \
  --ref master \
  -f image_repository=ghcr.io/mist-trade/mist \
  -f image_tag=<backend-sha> \
  -f previous_image_tag=<previous-backend-sha> \
  -f frontend_image_repository=ghcr.io/mist-trade/mist-fe \
  -f frontend_image_tag=<frontend-sha> \
  -f previous_frontend_image_tag=<previous-frontend-sha> \
  -f web_gateway_image=docker.m.daocloud.io/library/nginx:1.27-alpine \
  -f docker_root='<docker-root>' \
  -f datasource_root='<datasource-root>' \
  -f skip_migration=false \
  -f skip_backup=false \
  -f skip_health_check=false \
  -f skip_pull=false
```

Watch the run:

```bash
gh run watch <deploy-run-id> \
  --repo mist-trade/mist-deploy \
  --exit-status \
  --interval 20
```

Deployment evidence must include:

- GHCR login success
- image pull success
- MySQL healthy
- backup path, for example
  `<docker-root>\backups\mist-YYYYMMDD-HHMMSS.sql`
- migrations ran or were intentionally skipped
- `mist-fe`, `mist-backend`, and `mist-chan-api` recreated
- `mist-web-gateway` recreated after app service recreation
- Docker status OK for all five Compose services
- Windows-local direct health:
  - `http://127.0.0.1:8001/app/hello`
  - `http://127.0.0.1:8008/app/hello`
  - `http://127.0.0.1:80/`
- Windows-local gateway health:
  - `http://127.0.0.1:80/api/mist/app/hello`
  - `http://127.0.0.1:80/api/chan/app/hello`
- datasource health:
  - `http://127.0.0.1:9001/health`
  - `http://host.docker.internal:9001/health` from the backend container
- diagnostics path, for example
  `<docker-root>\diagnostics\YYYYMMDD-HHMMSS`

## MySQL Restore Rehearsal

Use the backup path printed by deployment. Do not restore into the production
MySQL container.

```bash
gh workflow run test-windows-mysql-restore.yml \
  --repo mist-trade/mist-deploy \
  --ref master \
  -f docker_root='<docker-root>' \
  -f backup_path='<backup-path-from-deploy>' \
  -f timeout_seconds=120 \
  -f keep_container=false
```

Required evidence:

- temporary MySQL container name
- backup imported into the temporary database
- schema validation passed
- temporary container removed

## TDX Runtime Smoke

Run non-state-changing datasource smoke first:

```bash
gh workflow run run-windows-tdx-runtime-smoke.yml \
  --repo mist-trade/mist-deploy \
  --ref master \
  -f datasource_root='<datasource-root>' \
  -f appliance_root='<appliance-root>' \
  -f base_url='http://127.0.0.1:9001' \
  -f ws_url='' \
  -f client_id='<runtime-smoke-client-id>' \
  -f symbol='600519.SH' \
  -f raw_symbol='' \
  -f sector='880081.SH' \
  -f sector_trade_code='880081.SH' \
  -f period='1d' \
  -f count=2 \
  -f timeout_seconds=20 \
  -f include_reference_instrument_smoke=true \
  -f include_finance_report_smoke=true \
  -f include_formula_smoke=true \
  -f require_live_quote=false \
  -f allow_websocket_subscription_change=false \
  -f skip_websocket=false
```

Required evidence:

- datasource SDK preflight passed
- TDX WinSW runtime probe passed
- basic HTTP smoke passed
- reference/instrument smoke passed
- finance/report smoke passed
- formula smoke passed
- WebSocket ping/pong smoke passed

## Live Quote Subscription Smoke

Do not mutate subscriptions directly from a non-leader WebSocket client in
production. The datasource enforces a command leader. The normal leader is the
backend client id `mist-backend-tdx`.

A direct `RequireLiveQuote` runner smoke using a non-leader client is expected
to fail with `DATASOURCE_WS_NOT_LEADER`; record that as leader-protection
evidence, not as the positive live quote proof.

Positive live quote verification uses the backend leader test endpoints:

```bash
curl --noproxy '*' --connect-timeout 5 --max-time 20 -sS -i \
  -X POST \
  http://<gateway-hostname>/api/mist/v1/collector/test/tdx-streaming/subscribe \
  -H 'Content-Type: application/json' \
  --data '{"code":"600519","period":1,"testOnly":true}'
```

Then connect a read-only observer to datasource WebSocket and wait for `quote`:

```bash
node -e "const url='ws://<windows-lan-ip>:9001/ws/quote/<observer-client-id>'; const ws=new WebSocket(url); const timeout=setTimeout(()=>{console.error('timeout waiting for quote'); ws.close(); process.exit(2);},70000); ws.addEventListener('open',()=>console.log('open '+url)); ws.addEventListener('message',(event)=>{const text=String(event.data); console.log(text); let msg; try{msg=JSON.parse(text);}catch{return;} if(msg.type==='ready'){ws.send(JSON.stringify({type:'ping'}));} if(msg.type==='quote'){clearTimeout(timeout); console.log('quote_ok symbol='+((msg.data&&msg.data.symbol)||(msg.data&&msg.data.snapshot&&msg.data.snapshot.Code)||'')); ws.close(); process.exit(0);} }); ws.addEventListener('error',(event)=>{console.error('ws error', event.message || event.type); clearTimeout(timeout); process.exit(1);});"
```

Clean up through the backend leader:

```bash
curl --noproxy '*' --connect-timeout 5 --max-time 20 -sS -i \
  -X POST \
  http://<gateway-hostname>/api/mist/v1/collector/test/tdx-streaming/unsubscribe \
  -H 'Content-Type: application/json' \
  --data '{"code":"600519","period":1,"testOnly":true}'
```

Confirm cleanup:

```bash
curl --noproxy '*' --connect-timeout 5 --max-time 15 -sS \
  http://<windows-lan-ip>:9001/health
```

Required evidence:

- subscribe endpoint returns HTTP 200, `success=true`, and `count=1`
- observer receives `ready` with `leaderClientId="mist-backend-tdx"`
- observer receives a `quote` event whose `snapshot.Code` is `600519.SH`
- unsubscribe endpoint returns HTTP 200 and `count=1`
- final datasource health shows:
  - `subscribedCount=0`
  - `activeSubscriptions=[]`
  - `quoteCallbackRejectedCount=0`
  - `lastQuoteCallbackAccepted=true`
  - `eventQueueDepth=0`

## Mac LAN Probes

Confirm hostname resolution:

```bash
dscacheutil -q host -a name <gateway-hostname>
```

Probe gateway and datasource paths:

```bash
curl --noproxy '*' --connect-timeout 5 --max-time 15 -sS -i \
  -w '\nremote_ip=%{remote_ip}\nhttp_code=%{http_code}\n' \
  http://<gateway-hostname>/

curl --noproxy '*' --connect-timeout 5 --max-time 15 -sS -i \
  -w '\nremote_ip=%{remote_ip}\nhttp_code=%{http_code}\n' \
  http://<gateway-hostname>/k

curl --noproxy '*' --connect-timeout 5 --max-time 15 -sS -i \
  -w '\nremote_ip=%{remote_ip}\nhttp_code=%{http_code}\n' \
  http://<gateway-hostname>/api/mist/app/hello

curl --noproxy '*' --connect-timeout 5 --max-time 15 -sS -i \
  -w '\nremote_ip=%{remote_ip}\nhttp_code=%{http_code}\n' \
  http://<gateway-hostname>/api/chan/app/hello

curl --noproxy '*' --connect-timeout 5 --max-time 15 -sS -i \
  -w '\nremote_ip=%{remote_ip}\nhttp_code=%{http_code}\n' \
  http://<windows-lan-ip>/api/mist/app/hello

curl --noproxy '*' --connect-timeout 5 --max-time 15 -sS -i \
  -w '\nremote_ip=%{remote_ip}\nhttp_code=%{http_code}\n' \
  http://<windows-lan-ip>/api/chan/app/hello

curl --noproxy '*' --connect-timeout 5 --max-time 15 -sS -i \
  -w '\nremote_ip=%{remote_ip}\nhttp_code=%{http_code}\n' \
  http://<windows-lan-ip>:9001/health
```

Known-good shape:

- `<gateway-hostname>` resolves to `<windows-lan-ip>`
- `/` returns HTTP 307 to `/k`
- `/k` returns HTTP 200
- Mist and Chan gateway API paths return HTTP 200
- datasource health returns HTTP 200 with `tdxHttpReachable=true` and
  `tqInitialized=true`

## Evidence And Completion

After every rerun, create or update an evidence file under:

```text
openspec/changes/verify-mist-production-baseline/evidence/
```

Then validate:

```bash
openspec validate verify-mist-production-baseline --strict
openspec validate define-mist-production-roadmap --strict
```

The baseline can be marked known-good only when deployment, health checks,
restore rehearsal, datasource smoke, live quote subscription smoke, and Mac LAN
probes have all passed or have an explicit accepted disposition.
