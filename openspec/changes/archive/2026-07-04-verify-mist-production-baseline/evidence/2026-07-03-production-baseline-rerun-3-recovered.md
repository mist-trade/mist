# Mist Production Baseline Rerun Evidence - 2026-07-03 Round 3 Recovered

Status: known-good after Windows interactive-session recovery.

This evidence extends the blocked round-3 rerun. The Docker deployment and
MySQL restore rehearsal had already passed. The remaining blocker was TDX
runtime login/window activation. After validating `MistRuntimeLogin` from the
real Windows console session, the GitHub recovery workflow passed, followed by
datasource runtime smoke, Mac-side probes, and live quote verification through
the backend leader path.

## Target Refs And Images

| Repository | Commit |
| --- | --- |
| `mist` | `a8eb29c089477456b980da83ce885e07e8fab14a` |
| `mist-fe` | `600b9fce2aedd9fc7d82074f9d7a65bc15a14815` |
| `mist-deploy` Docker deploy run | `61e631e095f88bc7a51092b6ea909b2da868a981` |
| `mist-deploy` recovery and smoke runs | `da3e07e6b48280833d6b3118c054cf63b5509ebf` |

| Component | Image |
| --- | --- |
| Backend target | `ghcr.io/mist-trade/mist:a8eb29c089477456b980da83ce885e07e8fab14a` |
| Frontend target | `ghcr.io/mist-trade/mist-fe:600b9fce2aedd9fc7d82074f9d7a65bc15a14815` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine` |

Image build status before deploy:

- `mist` workflow `Build Docker Images` run `28637564495`: success for
  `a8eb29c089477456b980da83ce885e07e8fab14a`.
- `mist-fe` workflow `Build Frontend Docker Image` run `28636232882`: success
  for `600b9fce2aedd9fc7d82074f9d7a65bc15a14815`.

## Local Gates

Run from the `mist` repo:

| Command | Result |
| --- | --- |
| `env TZ=UTC pnpm run test:ci` | Passed: 48 suites, 474 tests |
| `pnpm run typecheck` | Passed |
| `pnpm run build:docker` | Passed |
| `pnpm run ci:contracts` | Passed after updating the monitoring workflow contract to require non-mutating `gofmt -l .` plus failure exit behavior |

## Deploy And Restore Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28637824969` | Passed | Deployed backend and frontend target images, ran migrations, recreated application containers and web gateway, passed Docker, HTTP, and datasource health checks. A pre-migration MySQL backup was produced at `<docker-root>\backups\<backup-file>.sql`; diagnostics were captured at `<docker-root>\diagnostics\<timestamp>`. |

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28637910922` | Passed | Temporary MySQL container started, backup imported, restored schema validation passed, and the temporary container was removed. |

## TDX Recovery Evidence

Earlier round-3 recovery attempts were blocked because `MistRuntimeLogin` could
not activate the TDX window from the Windows runner context. Windows-local
diagnosis found the Codex shell was running on an isolated desktop while the
real console session was active. Manually triggering `MistRuntimeLogin` from
the real console session succeeded and produced a TDX window title; the TDX
native port and datasource service then became reachable.

Workflow: `Recover Windows TDX Datasource` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28641880518` | Passed | Checked out `mist-deploy@da3e07e6b48280833d6b3118c054cf63b5509ebf`, stopped and started TDX, ran `MistRuntimeLogin`, waited for initialization, restarted `mist-tdx-datasource`, passed datasource health, confirmed service `Running`, confirmed native TDX TCP reachability, and passed datasource smoke. |

Key recovery log evidence:

- `Datasource health OK: http://127.0.0.1:9001/health`.
- `Status : Running` for `mist-tdx-datasource`.
- `TcpTestSucceeded : True` for the local TDX native HTTP port.
- `TDX datasource smoke test passed`.

## Runtime Smoke Evidence

Workflow: `Run Windows TDX Runtime Smoke` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28642021156` | Passed | Datasource SDK preflight passed; WinSW runtime probe passed; TDX basic HTTP, reference/instrument, finance/report, formula, and WebSocket checks passed. |

The smoke was non-state-changing for subscriptions:

- `require_live_quote=false`.
- `allow_websocket_subscription_change=false`.

## Mac-Side Probes

Mac-side probes after recovery:

| Probe | Result |
| --- | --- |
| `http://<windows-lan-ip>:9001/health` | HTTP `200`, `status="ok"`, `tdxHttpReachable=true`, `tqInitialized=true`, `wsConnected=true`, `collectorState="not_started"` |
| `http://<gateway-hostname>/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"` |
| `http://<gateway-hostname>/api/chan/app/hello` | HTTP `200`, body `Hello World!` |

## Live Quote Verification

The positive live quote check used the backend leader path:

1. Opened a read-only datasource WebSocket observer.
2. Called the backend test subscribe endpoint for `600519`.
3. Received a datasource quote payload for `600519.SH`.
4. Called the backend test unsubscribe endpoint for cleanup.

Evidence:

- Subscribe endpoint returned HTTP `200`.
- The datasource observer reported leader `mist-backend-tdx`.
- The observer received `type="quote"` with `stock_code="600519.SH"`.
- Unsubscribe endpoint returned HTTP `200`.

Conclusion: after Windows interactive-session recovery, the baseline passed
deployment, restore rehearsal, explicit TDX recovery, datasource runtime smoke,
Mac-side health probes, and backend-leader live quote verification.

