# Mist Production Baseline Rerun Evidence - 2026-07-02 GHCR Blocked

Status: blocked before a new known-good baseline could be established.

This rerun attempted to redeploy the current `master` backend image and the
current frontend image through the authenticated Windows self-hosted runner.
The deployment did not complete because the Windows runner repeatedly failed to
reach GHCR. No MySQL restore rehearsal, TDX runtime smoke, or live quote
subscription smoke was run from this attempt because no successful deployment
backup was produced.

## Target Refs And Images

| Repository | Commit |
| --- | --- |
| `mist` | `a2403704d69711b00f2211449105112564794a68` |
| `mist-fe` | `c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| `mist-deploy` | `61e631e095f88bc7a51092b6ea909b2da868a981` |

| Component | Image |
| --- | --- |
| Backend target | `ghcr.io/mist-trade/mist:a2403704d69711b00f2211449105112564794a68` |
| Frontend target | `ghcr.io/mist-trade/mist-fe:c9bb33588b55d8509526cf71b38ae4b26e52b790` |
| Web gateway | `docker.m.daocloud.io/library/nginx:1.27-alpine` |

Image build status before deploy:

- `mist` workflow `Build Docker Images` run `28576670523`: success for
  `a2403704d69711b00f2211449105112564794a68`.
- `mist-fe` workflow `Build Frontend Docker Image` run `28564798552`: success
  for `c9bb33588b55d8509526cf71b38ae4b26e52b790`.

## Deploy Attempts

Workflow: `Deploy Windows Mist Stack` in `mist-trade/mist-deploy`.

Common inputs:

- `image_tag=a2403704d69711b00f2211449105112564794a68`
- `previous_image_tag=3aa23e3558da87899337d215cf52aa8663a755ba`
- `frontend_image_tag=c9bb33588b55d8509526cf71b38ae4b26e52b790`
- `previous_frontend_image_tag=23b483388a9f40d9ad9b22529729e1f75f369726`
- `web_gateway_image=docker.m.daocloud.io/library/nginx:1.27-alpine`
- `docker_root=<docker-root>`
- `datasource_root=<datasource-root>`
- `skip_pull=false`
- `skip_backup=false`
- `skip_migration=false`
- `skip_health_check=false`

| Run | Result | Evidence |
| --- | --- | --- |
| `28577024870` | Failed in `Deploy Mist stack` | `docker compose pull` failed while resolving frontend GHCR manifest: `Head "https://ghcr.io/v2/mist-trade/mist-fe/manifests/c9bb33588b55d8509526cf71b38ae4b26e52b790": EOF`. Backend pull was interrupted. The deploy script captured diagnostics at `<docker-root>\diagnostics\<timestamp>` and rolled containers back to backend `3aa23e3558da87899337d215cf52aa8663a755ba` and frontend `23b483388a9f40d9ad9b22529729e1f75f369726`. |
| `28577310629` | Failed in `Login to GHCR` | `docker login ghcr.io` failed with `Get "https://ghcr.io/v2/": net/http: TLS handshake timeout`. `Deploy Mist stack` was skipped. |
| `28577819141` | Cancelled | Run remained queued for several minutes while runner `<windows-runner-name>` was reported online and not busy. It was cancelled before any step executed to avoid leaving a hanging deployment run. |
| `28578333117` | Failed in `Login to GHCR` | `docker login ghcr.io` failed with `Get "https://ghcr.io/v2/": net/http: TLS handshake timeout`. `Deploy Mist stack` was skipped. |

Conclusion: this rerun did not validate the target production baseline. The
blocker is connectivity from the Windows runner to GHCR, not GHCR permissions:
earlier deployment logs in the same workflow shape showed `Login Succeeded`,
and the failing errors were `EOF` / TLS handshake timeout rather than denied,
unauthorized, or manifest-not-found errors.

## Current Runtime After Failed Attempts

The last deploy attempt did not enter the deploy script, so it did not mutate
the Docker stack. The first failed deploy did enter rollback. Mac-side probes
after the failures showed the stack remained reachable in the rollback state.

Host resolution from the Mac:

```text
name: <gateway-hostname>
ip_address: <windows-lan-ip>
```

Gateway and datasource probes after the failures:

| Probe | Result |
| --- | --- |
| `http://<gateway-hostname>/` | HTTP `307`, remote IP `<windows-lan-ip>`, redirects to `/k` |
| `http://<gateway-hostname>/k` | HTTP `200`, remote IP `<windows-lan-ip>` |
| `http://<gateway-hostname>/api/mist/app/hello` | HTTP `200`, JSON `success=true`, `data="Hello World!"`, remote IP `<windows-lan-ip>` |
| `http://<gateway-hostname>/api/chan/app/hello` | HTTP `200`, body `Hello World!`, remote IP `<windows-lan-ip>` |
| `http://<windows-lan-ip>:9001/health` | HTTP `200`, `status="ok"`, `tdxHttpReachable=true`, `tqInitialized=true`, `wsConnected=true`, `subscribedCount=0`, `activeSubscriptions=[]`, `quoteCallbackRejectedCount=0`, `lastQuoteCallbackAccepted=true`, `eventQueueDepth=0`, `collectorState="running"` |

Frontend note: the failed `28577024870` run rolled frontend back to
`23b483388a9f40d9ad9b22529729e1f75f369726`. The `/k` page still responds, but
this is not the target frontend baseline `c9bb33588b55d8509526cf71b38ae4b26e52b790`.

## Final Judgment

This rerun is not known-good.

Accepted current facts:

- The target backend and frontend images were built by their image workflows.
- Windows runner deployment was not completed because GHCR connectivity failed
  before or during image pull.
- No new deployment backup path was produced, so restore rehearsal was not run.
- TDX runtime smoke and live quote subscription smoke were not run for this
  blocked rerun.
- The currently running rollback stack is still reachable through gateway API
  and datasource health probes.

Next valid baseline action: rerun `Deploy Windows Mist Stack` once the Windows
runner can complete `docker login ghcr.io` and pull both GHCR images.
