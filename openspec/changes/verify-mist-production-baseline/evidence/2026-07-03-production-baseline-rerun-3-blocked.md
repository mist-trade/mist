# Mist Production Baseline Rerun Evidence - 2026-07-03 Round 3 Blocked

Status: blocked. This rerun did not establish a new known-good production
baseline.

The Docker stack deployment and MySQL restore rehearsal passed, but the required
TDX terminal recovery did not complete. After the failed recovery attempts, the
gateway/backend remained reachable while the host datasource health endpoint was
not reachable from the Mac.

## Target Refs And Images

| Repository | Commit |
| --- | --- |
| `mist` | `a8eb29c089477456b980da83ce885e07e8fab14a` |
| `mist-fe` | `600b9fce2aedd9fc7d82074f9d7a65bc15a14815` |
| `mist-deploy` deploy attempt | `61e631e095f88bc7a51092b6ea909b2da868a981` |
| `mist-deploy` recovery hardening | `da3e07e6b48280833d6b3118c054cf63b5509ebf` |

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
| `pnpm run ci:contracts` | Initially failed, then passed after updating the monitoring workflow contract to require non-mutating `gofmt -l .` plus failure exit behavior |

The `ci:contracts` failure was a stale local contract after `mist-monitoring`
changed its Go format gate back to contract mode. The production deployment
blocker below is separate from that local contract fix.

## Deploy And Restore Evidence

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28637824969` | Passed | Deployed backend and frontend target images, ran migrations, recreated application containers and web gateway, passed Docker, HTTP, and datasource health checks. A pre-migration MySQL backup was produced at `<docker-root>\backups\<backup-file>.sql`; diagnostics were captured at `<docker-root>\diagnostics\<timestamp>`. |

Workflow: `Test Windows MySQL Restore` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28637910922` | Passed | Temporary MySQL container started, backup imported, restored schema validation passed, and the temporary container was removed. |

## TDX Recovery Attempts

Workflow: `Recover Windows TDX Datasource` in `mist-trade/mist-deploy`.

| Run | Result | Evidence |
| --- | --- | --- |
| `28637956618` | Failed | Stopped the existing TDX process and started TDX, then failed in `MistRuntimeLogin`: `TDX login window could not be activated`. |
| `28638049610` | Failed | Same failure after a same-input retry: `TDX login window could not be activated`. |
| `28638117957` | Failed | With `skip_runtime_login=true`, TDX stop/start proceeded, but datasource restart did not pass health within the timeout. Logs showed the TDX native HTTP port was not reachable and the datasource exited during TDX adapter initialization. |
| `28638397662` | Failed | After pushing `mist-deploy@da3e07e6b48280833d6b3118c054cf63b5509ebf`, the workflow used longer wait inputs and an AHK helper that restores/retries the window by hwnd. It still failed to activate the TDX login window. |
| `28639171132` | Failed | Retried after checking the Windows machine. The workflow checked out `mist-deploy@da3e07e6b48280833d6b3118c054cf63b5509ebf`, stopped and started TDX, then failed again in `MistRuntimeLogin`: `TDX login window could not be activated`. |

Root-cause evidence:

- The TDX process can be stopped and started by the workflow.
- The runtime login task can be updated and launched.
- The login task cannot activate the TDX login window in the current Windows
  interactive session.
- Skipping runtime login is not a valid recovery for this state: after a
  skip-login run, the TDX native HTTP port was not reachable and the datasource
  could not initialize the TDX adapter.

## Current Runtime After Failed Recovery

Mac-side probes after the failed recovery attempts:

| Probe | Result |
| --- | --- |
| `http://<gateway-hostname>/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"` |
| `http://<windows-lan-ip>:9001/health` | Failed to connect within timeout |

The Mac-side probes were repeated after retry `28639171132`; the gateway/backend
probe still returned HTTP `200`, and the datasource health probe still timed out.

Conclusion: the Docker stack and gateway/backend path remained reachable, but
the host datasource was not healthy after the failed TDX recovery attempts.

## Required Follow-Up

This baseline remains incomplete. To finish it:

1. On the Windows API machine, ensure the interactive desktop session used by
   the TDX scheduled tasks is logged in and can foreground the TDX login window.
2. Rerun `Recover Windows TDX Datasource` with runtime login enabled.
3. After recovery passes, rerun datasource runtime smoke and live quote
   verification through the backend leader path.
4. Record a new evidence file only if recovery, datasource smoke, live quote,
   restore, gateway probes, and Mac-side probes all pass.
