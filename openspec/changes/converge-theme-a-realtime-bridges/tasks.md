## 1. Convergence Baseline And Contracts

- [x] 1.1 Checkpoint the dirty Theme B backend and frontend worktrees without merging them.
- [x] 1.2 Create `integrate/theme-a-realtime-convergence` from current `origin/master` in Mist, datasource, deploy, and monitoring.
- [x] 1.3 Strictly validate this convergence change and confirm its five capability deltas are apply-ready.
- [x] 1.4 Record supersession of the blocked TDX branch and transfer remaining BigQMT realtime ownership without importing contradictory product-persistence tasks.

## 2. QMT Datasource Experimental Transport

- [x] 2.1 Add `QMT_REALTIME_MODE=off|builtin_experimental` validation with default `off` and mode-matrix tests.
- [x] 2.2 Port the bounded single-owner QMT native collector with session gating, one-command-in-flight, stable health counters, and strict native snapshot validation.
- [x] 2.3 Add a frozen QMT experimental ready/snapshot contract with stream epoch and monotonic sequence fencing.
- [x] 2.4 Add `/ws/qmt-experimental/{clientId}` subscription sync and liveness handling on an isolated manager.
- [x] 2.5 Add loopback-only `/qmt/realtime/health` and reject unknown request fields or remote callers.
- [x] 2.6 Gate collector lifecycle and routes on experimental mode while leaving historical QMT and bridge routes unchanged.
- [x] 2.7 Add datasource unit/integration/replay tests and repository guardrails proving no legacy TDX or product route is reintroduced.

## 3. Mist QMT Experimental Consumer

- [x] 3.1 Add QMT mode and exact `QMT_EXPERIMENTAL_ALLOWLIST` validation, including empty, duplicate, over-limit, disabled-source, and non-unique cases.
- [x] 3.2 Add an independent QMT experimental module, strict client, in-memory store, and guarded diagnostic controller.
- [x] 3.3 Implement ready/epoch/sequence/identity/freshness validation with stable drop counters and desired-set resync.
- [x] 3.4 Wire TDX and QMT modes independently in Mist while schedule remains historical-only and unknown values fail bootstrap.
- [x] 3.5 Add no-K dependency and poison gates for K repositories, collectors, aggregators, scanners, signals, alerts, and trading entry points.
- [x] 3.6 Add cross-repo QMT replay through production datasource wiring and the real backend allowlist resolver.
- [x] 3.7 Confirm no public latest-snapshot endpoint or old aggregate `CollectorModule` is present.

## 4. Deployment And Monitoring Convergence

- [ ] 4.1 Add default-off QMT experimental mode and loopback health configuration to Windows deployment contracts.
- [ ] 4.2 Replace the old TDX/QMT K persistence smoke with source-specific transport, diagnostic, restart, rollback, and no-K digest evidence.
- [ ] 4.3 Update TDX smoke to consume the current experimental health shape and remove all old `tdxBridgeReady` assumptions.
- [ ] 4.4 Add mode-aware Windows exporter metrics for TDX/QMT readiness, subscriptions, and snapshot age while preserving legacy metrics.
- [ ] 4.5 Add source-labelled experimental alerts that remain absent when the corresponding mode is disabled.
- [ ] 4.6 Update deployment, monitoring contracts, operator docs, and local script tests for the default-off experimental boundary.

## 5. Local Cross-Repo Verification

- [x] 5.1 Run datasource non-live pytest, ruff, and pyright.
- [x] 5.2 Run Mist full Jest, typecheck, lint, build, and mode/no-K tests.
- [ ] 5.3 Run deploy PowerShell/workflow contract tests and monitoring `scripts/verify.sh`.
- [ ] 5.4 Run strict OpenSpec validation, CI contracts with `MIST_WORKSPACE_ROOT`, and `git diff --check` in all four repositories.
- [ ] 5.5 Commit reviewable convergence changes in all four repositories with no unrelated branch history.

## 6. Master Integration And Windows Evidence

- [ ] 6.1 Merge datasource, Mist, deploy, and monitoring convergence commits to master in dependency order with experimental modes still default off.
- [ ] 6.2 Capture accepted TDX F2 Windows evidence on exact master SHAs, including native payload, epoch/sequence, restart, rollback, and unchanged database content digest.
- [ ] 6.3 Capture accepted QMT trading-session evidence on exact master SHAs, including owner, native snapshot, epoch/sequence, restart, rollback, and unchanged database content digest.
- [ ] 6.4 Re-run historical TDX HTTP and QMT native/DAT matrices, resolve all evidence findings, and record final master SHAs.
- [ ] 6.5 Complete the experimental TDX lifecycle task, sync stable specs, archive Theme A changes, and release the Theme B merge gate.

## 7. Theme B Handoff Gate

- [ ] 7.1 Create fresh Theme B integration branches only after task 6.5, cherry-picking backend `db365eb` plus `4c7880b` and frontend `13fac02` plus `132c594` without duplicate Chan history.
- [ ] 7.2 Merge Theme B code and its v3 active OpenSpec at 74/77 after non-MySQL validation; do not deploy migrations 007/008 to production.
- [ ] 7.3 When an isolated `MIST_TEST_MYSQL_URL` is later supplied, complete Theme B tasks 9.1, 10.5, and 10.7 before stable-spec sync, archive, migration, or release.
