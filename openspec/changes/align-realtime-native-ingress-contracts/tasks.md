## 1. Baseline And Contract Fixtures

- [x] 1.1 Record six-repository branch/master/checkpoint audit, confirm migration 006 is untouched, and defer checkpoint 007/008 pending production migration inventory.
- [x] 1.2 Define schema v1 `mist.realtime.native_snapshot` golden fixtures for TDX `600030.SH` and QMT `300502.SZ`, including ready, stream restart, reject and per-symbol sequence cases.
- [x] 1.3 Add a cross-repository fixture manifest/SHA guard consumed by datasource, backend, deploy smoke and monitoring tests.

## 2. Datasource Formal Realtime Contract

- [x] 2.1 Rename active TDX experimental gateway/validator/routes/state/tests to formal realtime names and remove old route/module aliases.
- [x] 2.2 Replace the TDX projected draft frame with the schema v1 native envelope while preserving full native validation, owner lease, subscription convergence and bounded evidence.
- [x] 2.3 Rename QMT experimental collector/constants/routes/state/tests to formal realtime names and emit the same schema v1 envelope with source-specific native data.
- [x] 2.4 Change QMT datasource and backend fencing to per-symbol sequence within each epoch and test duplicate/out-of-order/interleaved multi-symbol frames.
- [x] 2.5 Bind QMT poll/result commands to the active owner generation or lease, rotate epoch on owner replacement, reject retired in-flight results, and expose build/artifact identity without secrets.
- [x] 2.6 Add bounded JSON size/depth/sensitive-field validation and retain QMT builtin Python 3.6 compatibility guards.
- [x] 2.7 Run datasource unit/integration/replay tests, Ruff, Pyright and formal route-absence guards.
- [x] 2.8 Add `TDX_REALTIME_MODE=builtin|off`, default missing configuration to `builtin`, and omit the TDX realtime gateway/routes when explicitly off while preserving HTTP APIs.

## 3. Backend Formal Ingress

- [x] 3.1 Move active TDX/QMT realtime code from `experimental` directories to formal `realtime` modules and rename classes, tokens, errors, env allowlists and tests.
- [x] 3.2 Implement shared schema v1 frame types/decoder and source-specific TDX/QMT native validators/adapters producing `CanonicalRealtimeSnapshot`.
- [x] 3.3 Implement `RealtimeSnapshotIngressService` with a memory-only sink and route only transport-accepted frames into it.
- [x] 3.4 Consolidate security identity/allowlist resolution and formal realtime diagnostics while preserving source-specific client/owner behavior.
- [x] 3.5 Unify accepted/rejected fencing results, quality/freshness, source-labelled drops and disconnect/epoch behavior without adding Redis, K, scanner, signal, alert or notification dependencies.
- [x] 3.6 Replace `QMT_REALTIME_MODE=builtin_experimental` with `builtin|off`, default missing configuration to `builtin`, and retain `off` as explicit rollback.
- [x] 3.7 Run backend unit/replay/no-side-effect/module tests, lint, typecheck, Jest and Nest builds.
- [x] 3.8 Gate `TdxRealtimeModule` with the same strict default-builtin/explicit-off module matrix as QMT.

## 4. Deploy And Monitoring Promotion

- [x] 4.1 Rename current realtime mode/evidence PowerShell scripts and GitHub workflows to formal names; update parameters, backup/restore and `builtin|off` validation.
- [x] 4.2 Update TDX/QMT runtime smoke and evidence capture for schema v1, formal routes, per-symbol sequence and owner/build identity.
- [x] 4.3 Rename Windows exporter/Mac watchdog realtime config, types, metrics and alerts to formal `mist_realtime_*` contracts and add startup/session grace behavior.
- [x] 4.4 Update current Simplified Chinese architecture/operator/baseline docs and generated current OpenAPI summaries without editing historical archives.
- [x] 4.5 Add CI repository guards proving active realtime experimental/legacy names, old routes, old payloads and `builtin_experimental` are absent.
- [x] 4.6 Run deploy PowerShell tests with `pwsh-preview`, monitoring Go tests/lint/build and Docker builds.
- [x] 4.7 Propagate and validate both source modes through Compose, reversible switching, monitoring config and current operator documentation.

## 5. Release, HIL And Rollback Gates

- [ ] 5.0 Complete and locally validate `normalize-tdx-qmt-source-layouts`; use its renamed TDX/QMT bridge artifacts for every following HIL task.
- [ ] 5.1 Record pre-HIL protected-table row counts/digests and exact repository/image/bridge identities; do not run or change MySQL migrations.
- [ ] 5.2 Validate TDX `600030.SH` during a supported session: full native frame, canonical adapter, freshness, per-symbol sequence, owner/subscription recovery and terminal/datasource restart.
- [ ] 5.3 Validate QMT `300502.SZ` during a supported session: Python 3.6 bridge, owner generation fence, full native frame, canonical adapter, freshness, per-symbol sequence and terminal/datasource restart.
- [ ] 5.4 Validate non-trading-session owner/subscription/cache recovery claims without representing them as freshness evidence.
- [ ] 5.5 Execute per-source whole-chain/config rollback with TDX and QMT `off`, verify old-version compatibility boundary, and record post-phase protected-table digests identical to baseline.
- [ ] 5.6 Promote the verified release atomically, set production TDX/QMT desired state to `builtin`, confirm dual-source monitoring convergence, and refresh production baseline evidence.
- [ ] 5.7 Run final OpenSpec strict validation, all-repository clean/status checks and document residual gates for the separate Redis productization change.
