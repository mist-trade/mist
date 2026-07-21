# Theme A Session Validation Matrix

Status: **after-hours verification complete; trading-session acceptance pending**
Prepared: `2026-07-21`  
Trading-session execution date: `2026-07-22`  
TDX symbol: `600519.SH`  
QMT symbol: `300502.SZ`

This ledger separates control-plane verification from realtime market-data
acceptance. A check appearing in the first table is useful evidence, but it
does not close tasks 6.4 or 6.5 by itself.

## May Run Outside Trading Hours

| Check | What it proves | What it does not prove |
|---|---|---|
| Repository and deployed SHA checks | Exact reproducible source identity | Live native data |
| Installed bridge SHA-256 and runtime version | Exact terminal artifact identity | Callback or snapshot freshness |
| Datasource/WinSW/backend process health | Service and process availability | Realtime market-data delivery |
| Bridge owner registration and heartbeat | Control-plane ownership and lease liveness | Same-session native quote |
| WebSocket ready, subscription convergence, ping/pong | Transport control path | Fresh snapshot or sequence progression |
| Thirty-minute lifecycle observation | No observed fixed process lifetime | Market callback behavior |
| `baseline` evidence and protected-table digests | Disabled-source boundary and before-state | Enabled transport |
| `post_rollback` evidence | Exact restoration and route removal | Enabled transport |
| TDX `:17709` historical/reference matrix | TDX non-realtime HTTP path | TDX realtime bridge |
| QMT bars/native command matrix | QMT historical command path | QMT realtime collector |
| Local unit, contract, lint, type, build, and OpenSpec checks | Static and replay correctness | Windows live acceptance |

An experimental mode may be started outside the session to inspect owner,
ready, subscription, and error diagnostics. It MUST remain classified as a
control-plane observation. For QMT A-share symbols the collector reports
`outside_session` and intentionally enqueues no native realtime command.

## Requires A Supported Trading Session

The following evidence is accepted only when the exact tested security is in a
supported exchange session:

1. A native TDX `get_market_snapshot` result produced by the active bridge and
   accepted through datasource HTTP, datasource WebSocket, Mist decoding,
   allowlist, and latest-snapshot diagnostics.
2. A native QMT `get_full_tick` result for `300502.SZ` whose `timetag` is from
   the same Beijing trading date and whose required numeric fields are valid.
3. `enabled` evidence with a fresh backend snapshot and sequence at least one.
4. A later snapshot in the same epoch proving strictly increasing sequence.
5. `post_restart` evidence showing a new owner generation/stream epoch followed
   by a new same-session snapshot and reconverged subscriptions.
6. Monitoring readiness and snapshot age observed while those fresh snapshots
   are flowing.

For the current A-share symbols, schedule acceptance away from session edges:
use `09:40-11:15` or `13:10-14:45` Beijing time. QMT's implementation retains
operational buffers through `11:35` and `15:05`, but those buffers are not the
preferred acceptance window. They exist so `11:30` and `15:00` do not cause an
abrupt control-path stop.

## Phase Classification

| Evidence phase | Session requirement | Acceptance rule |
|---|---|---|
| `baseline` | Any time | Source experimental routes/metrics absent; exact SHAs and before-digests captured |
| `enabled` | Trading session only | Native snapshot, fresh backend readback, sequence, subscription, and metrics all converge |
| `post_restart` | Trading session only | New epoch/generation plus a new fresh native snapshot after restart |
| `post_rollback` | Any time | Recorded backup restored; experimental routes/metrics absent; digests unchanged |

## Current Evidence Boundary

- The 77-minute TDX observation proves bridge lifecycle stability but is not F2
  snapshot acceptance.
- TDX runtime smoke run `29804929908` passed on 2026-07-21, but the two formal
  evidence attempts stopped on evidence-tool identity checks before F2
  acceptance. Those tooling defects have since been corrected.
- QMT runtime smoke run `29807213095` proved a native `300502.SZ` snapshot and
  datasource sequence. Later diagnostics proved datasource/backend WebSocket
  connection and owner convergence.
- QMT backend `connected=false` was a false negative caused by reading the Mist
  response envelope without unwrapping `data`; `mist-deploy` commit `fb94f0e`
  fixes the evidence reader and adds bounded convergence waiting.
- The 2026-07-21 after-close QMT diagnostic correctly reported
  `outside_session`, sequence zero, and no new backend symbol. It is retained as
  negative session-gating evidence, not realtime acceptance.
- The controlled baseline transition run `29812642433` established TDX
  `legacy` and QMT `off`; backup ID `20260721T080146Z-9eeccedd` records the
  prior TDX experimental/QMT-off state.
- Final mode status run `29814095118` confirms datasource and backend remain
  TDX `legacy`, QMT `off` after both datasource services were updated and
  restarted.

## 2026-07-21 After-Hours Results

All checks in this section are control-plane, historical, identity, or
rollback-boundary evidence. They do not complete the trading-session portions
of tasks 6.4 or 6.5.

### Final Identity

| Component | Exact deployed identity |
|---|---|
| `mist-datasource` | `41a823990c437a60ca95e7ab1a024691fd7c820b` |
| Mist backend image | `4dd26cdaf05d77e99c49f41b2222f43cee2ae809` |
| `mist-deploy` | `b61a322` (QMT recovery workflow and locale-safe hosted test) |
| `mist-monitoring` | `27a79eba056b34470678559d472f98e09311bdbf` |
| TDX bridge SHA-256 | `063943212180e1c3369905e464c72c35f2a94c62a9513880f70520aaa9a5260c` |
| QMT bridge SHA-256 | `14b6143fa1d81f32606b7090a5d687041922ae78e0abc30e0e56e11b7bfb880b` |

TDX datasource update/restart run `29813436411` and QMT datasource
update/restart run `29813501701` both passed. The bridge artifacts were not
copied, registered, replaced, or removed by those workflows.

### Independent Restart Matrix

| Restart domain | Evidence | Result |
|---|---|---|
| TDX datasource | Windows run `29816035359` | Passed; the WinSW datasource restarted independently. |
| QMT datasource | Windows run `29816109795` | Passed; the WinSW datasource restarted independently. |
| TDX terminal | Previously accepted user-session recovery, run `28954109319` | Passed; this result was not re-run on July 21 because the operator confirmed the TDX terminal recovery was already complete. |
| QMT terminal | Windows run `29816225780` | Passed; 12 unrelated content windows were minimized, QMT PID changed from `27860` to `33132`, and owner changed from `bigqmt-27860` to `bigqmt-33132`. |

The QMT recovery found no separately running `mist_qmt_bridge.py` console, so
the exact-name fence safely skipped that step. It then stopped the old QMT
terminal, started the replacement in the interactive user session, completed
the saved-login action using the Enter fallback, observed the new owner, and
passed the `300502.SZ` runtime smoke. The result records
`datasourceRestarted=false` and `strategyRegistered=false`. Hosted workflow
validation run `29815961269` also passed on Windows PowerShell 5.1.

These restart results close only the four restart-domain checks. They do not
claim fresh realtime market data outside a supported trading session; tasks
6.4 and 6.5 remain open for the July 22 trading-session acceptance.

### TDX Recovery Workflow Replacement

`mist-deploy` commits `95d0060` and `46b6725` replaced the legacy
`restart-login-register.ps1` path with isolated user-session TDX terminal
recovery. The workflow does not receive an SDK path, restart the datasource,
copy or register a strategy, or kill arbitrary Python processes. It requires a
different owner and stream epoch, matching desired/converged revisions, and an
independent official `:17709` `get_market_data` POST.

Hosted Windows PowerShell validation run `29826339513` passed. Non-destructive
preflight run `29826415496` found the deployed datasource still in `legacy`
mode because `/tdx/bridge/health` returned `404`; no terminal restart was
triggered. Commit `46b6725` consequently makes this a fail-closed precondition
before window minimization or TDX shutdown. The real terminal restart remains
part of task 6.4 after the built-in mode is enabled during the supported July
22 trading session.

### Baseline And Database Boundary

- TDX `600519.SH` baseline run `29813949839`: passed; datasource/backend
  experimental routes both returned `404`.
- QMT `300502.SZ` baseline run `29814015012`: passed; datasource/backend
  experimental routes both returned `404`.
- Both final artifacts contain identical protected-table states:
  `k=4375`, `k_extensions_tdx=4371`, `k_extensions_qmt=4`, and zero rows in
  `k_extensions_ef`, `strategy_signals`, and `strategy_alert_events`.
- Their deterministic digests are identical across providers. In particular,
  `k` is `91ccfd3e1bda07fa1b4e64b146460366cbbe27d63f052e8522d459813189226b`,
  `k_extensions_tdx` is
  `eba21ccd9ed20eb5ca15b50376bc1f5c642b88cf70bac43eb043de117f746a2d`,
  and `k_extensions_qmt` is
  `bf9ecbf751d3d1b5b06dc229bf64b4502138998aca693b181e020a653c756af3`.

### Historical Matrices

- TDX run `29813763401` passed bars, snapshots, sector, reference/instrument,
  finance/report, formula, and legacy WebSocket subscription-control checks for
  `600519.SH`. `require_live_quote=false`, so this run makes no realtime
  freshness claim.
- QMT run `29813848509` passed `/v1/bars/query` for all 21 configured periods,
  official bar/tick fields, five dividend modes, daily/minute time windows,
  bridge owner/health, `get_market_data_ex`, and sector-list commands for
  `300502.SZ`.
- QMT `get_full_tick` was intentionally skipped outside a supported market
  session. This is the expected gate, not a matrix failure.

### Findings Resolved

1. Added a transactional `baseline` workflow action. It writes both datasource
   and backend modes together, clears allowlists, restarts the required
   services, synchronizes monitoring, and restores the exact backup on failure.
2. Removed a stale TDX preflight inference that reported QMT historical bars as
   unavailable. QMT availability is now decided only by the dedicated QMT
   health/runtime checks.
3. Removed the obsolete appliance `health-check.ps1` probe from the dedicated
   TDX runtime workflow. Backend health and protected-table integrity remain
   covered by the evidence workflow instead of being silently skipped with a
   warning.
4. Added a dedicated QMT desktop recovery workflow. It minimizes other content
   windows, fences the old `mist_qmt_bridge.py` console, restarts QMT through an
   interactive user task, clicks the saved-login UI, and requires a different
   bridge owner without registering a strategy or restarting a datasource.

## 2026-07-22 Ordered Runbook

### Before The Session

1. Resolve exact full SHAs from the deployed datasource, backend image,
   deployment checkout, monitoring marker, and both installed bridge files.
2. Verify the Windows SHA-256 values using lowercase input when invoking the
   evidence workflow.
3. Verify that the established formal baseline remains
   `TDX_REALTIME_MODE=legacy` and `QMT_REALTIME_MODE=off`. Reuse final baseline
   runs `29813949839` and `29814015012`; create a new baseline only if any exact
   deployed identity or protected-table digest changes.
4. Stop if that baseline cannot be established through the controlled mode
   workflow or an exact known backup. Do not edit environment files ad hoc.
5. Capture TDX `baseline` for `600519.SH` and preserve its backup/identity
   values for all later TDX phases.

### TDX First: `600519.SH`

1. Between `09:40` and `11:15`, enable only TDX experimental mode.
2. Run strict TDX runtime smoke and inspect the bounded native payload.
3. Capture `enabled`, then verify a later increasing sequence.
4. Capture `post_restart` with a new epoch and a new fresh snapshot.
5. Roll back using the exact TDX backup and capture `post_rollback`.
6. Do not begin QMT until TDX is back at the recorded baseline and all TDX
   artifacts have been uploaded successfully.

### QMT Second: `300502.SZ`

1. Capture QMT `baseline` while QMT is `off`.
2. Prefer `13:10-14:45`; enable only QMT experimental mode and confirm the
   registered full-QMT owner.
3. Run strict QMT runtime smoke and retain one bounded native
   `get_full_tick` object for `300502.SZ`.
4. Run `Recover Windows QMT Runtime`, then capture `enabled`, a later increasing
   sequence, and `post_restart` with a new owner, epoch, and fresh snapshot.
5. Roll back using the exact QMT backup and capture `post_rollback`.
6. Confirm the final effective state is TDX `legacy`, QMT `off` unless the
   operator explicitly selects and records another approved final state.

### After The Session

1. Re-run the TDX `:17709` and QMT native historical matrices on the final
   deployed SHAs.
2. Compare protected-table row counts and deterministic digests across all four
   phases for each source.
3. Record accepted run IDs and artifact hashes in tasks 6.4-6.6 and the TDX F2
   evidence record.
4. Only then complete task 6.7, sync stable specs, archive Theme A, and release
   the Theme B gate.
