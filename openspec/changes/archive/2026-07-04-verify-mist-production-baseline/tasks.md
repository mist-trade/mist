# Tasks: Verify Mist production baseline

## 1. Prepare baseline evidence ledger

- [x] 1.1 Create `evidence/YYYY-MM-DD-production-baseline.md` under this
      change.
- [x] 1.2 Record the baseline date, operator, Windows API machine identity,
      Windows LAN IP, and gateway hostname.
- [x] 1.3 Record `mist`, `mist-fe`, `mist-datasource`, `mist-deploy`, and
      optional `mist-monitoring` commit SHAs.
- [x] 1.4 Record intended backend image repository/tag and frontend image
      repository/tag.
- [x] 1.5 Record `docker_root`, `datasource_root`, and whether monitoring is in
      scope for this baseline.

## 2. Verify image and workflow inputs

- [x] 2.1 Confirm the backend image tag exists for the selected `mist` commit.
- [x] 2.2 Confirm the frontend image tag exists for the selected `mist-fe`
      commit.
- [x] 2.3 Record previous backend and frontend image tags if rollback inputs
      will be provided.
- [x] 2.4 Record `Deploy Windows Mist Stack` workflow inputs before dispatch.
- [x] 2.5 Record any prerequisite blockers: Docker Desktop, self-hosted runner,
      GHCR access, datasource service, Docker root, datasource root, or
      machine `.env`.

## 3. Capture Windows deploy evidence

- [x] 3.1 Run or inspect `Deploy Windows Mist Stack` using the selected pinned
      image tags.
- [x] 3.2 Record the GitHub Actions workflow run identifier and final status.
- [x] 3.3 Record the printed MySQL backup path.
- [x] 3.4 Record the printed diagnostics path.
- [x] 3.5 Record whether migrations ran or were intentionally skipped.
- [x] 3.6 Record evidence that app deployment did not reinstall, remove, or
      replace `mist-tdx-datasource`.

## 4. Capture hybrid health evidence

- [x] 4.1 Run or inspect `scripts/health-check-docker-appliance.ps1` on the
      Windows API machine.
- [x] 4.2 Record Docker Compose service status for MySQL, `mist-backend`,
      `chan-api`, `mist-fe`, and `web-gateway`.
- [x] 4.3 Record backend health `http://127.0.0.1:8001/app/hello`.
- [x] 4.4 Record Chan health `http://127.0.0.1:8008/app/hello`.
- [x] 4.5 Record gateway frontend, `/api/mist/app/hello`, and
      `/api/chan/app/hello` results on the Windows host.
- [x] 4.6 Record host-side datasource health and backend-container-to-host
      datasource health through `http://host.docker.internal:9001/health`.

## 5. Capture datasource runtime smoke evidence

- [x] 5.1 Run or inspect `mist-deploy/scripts/run-tdx-runtime-smoke.ps1`.
- [x] 5.2 Record default smoke coverage: health, providers, bars, snapshots,
      sectors, calendar/security paths, and WebSocket ping/pong.
- [x] 5.3 If used, record `-IncludeFinanceReportSmoke`,
      `-IncludeReferenceInstrumentSmoke`, or formula smoke switches.
- [x] 5.4 If used, record `-RequireLiveQuote` and
      `-AllowWebSocketSubscriptionChange` together with operator acceptance of
      subscription-changing risk.
- [x] 5.5 Record datasource health fields after smoke, including subscription
      count, active subscriptions, callback counters, queue depth, and last
      error code when available.

## 6. Capture MySQL restore rehearsal evidence

- [x] 6.1 Run or inspect `scripts/test-mysql-backup-restore.ps1` against the
      backup path from deployment.
- [x] 6.2 Record the temporary MySQL container name or run identifier.
- [x] 6.3 Record successful import evidence.
- [x] 6.4 Record schema validation evidence, including `schema_migrations`.
- [x] 6.5 Record cleanup evidence for the temporary restore container.

## 7. Capture Mac-side gateway evidence

- [x] 7.1 Record whether Mac probes use raw Windows LAN IP,
      `www.moyui.mist`, or both.
- [x] 7.2 Record whether `/etc/hosts` or LAN DNS is required.
- [x] 7.3 Run and record `curl` output for the frontend gateway path.
- [x] 7.4 Run and record `curl` output for `/api/mist/app/hello`.
- [x] 7.5 Run and record `curl` output for `/api/chan/app/hello`.
- [x] 7.6 Record any LAN, DNS, firewall, or gateway routing blockers.

## 8. Finalize baseline judgment

- [x] 8.1 Redact secrets from all copied output snippets.
- [x] 8.2 Summarize passed checks, failed checks, deferred checks, and residual
      risks.
- [x] 8.3 Mark the baseline as known-good only if deploy, health, datasource
      smoke, restore rehearsal, and Mac-side probes all passed.
- [x] 8.4 If any critical check is missing or failed, record the exact command
      or workflow needed to finish later and leave the baseline incomplete.
- [x] 8.5 Run `openspec validate verify-mist-production-baseline --strict`.
- [x] 8.6 Confirm git status only contains intentional evidence/spec changes.
