# Theme A Session Validation Matrix

Status: **trading-session transport verified; runtime inventory and acceptance review pending**
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
| `baseline` | Any time | TDX builtin routes remain ready with zero desired/converged subscriptions; disabled QMT routes/metrics are absent; exact SHAs and before-digests are captured |
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
   windows, restarts QMT through an interactive user task, relies on QMT saved
   automatic login, and requires a different builtin bridge owner without
   registering a strategy, killing standalone Python, or restarting a
   datasource.
5. TDX convergence removed `TDX_REALTIME_MODE` and the legacy adapter/runtime.
   TDX builtin realtime is now always active; QMT retains its independent
   `off|builtin_experimental` switch.
6. TDX desired-state synchronization now travels over the dedicated realtime
   WebSocket. Docker backend no longer attempts to call the loopback-only
   bridge HTTP routes.

## 2026-07-21 Post-Convergence Deployment

Exact deployed revisions:

- datasource: `59576bd7bc4b2c3d1b5956703b3956262664ad22`
- backend image: `ed2aab287228b5fe51445eec4afd2f5d3ac4ca66`
- monitoring: `048dda32d9adc6bcb3021bc849b747a94cd34a05`
- deploy workflows: `357a7b0` (TDX smoke no longer invokes retired scripts
  left behind in the datasource directory)

Successful deployment and recovery runs:

- TDX datasource restart: `29842178187`
- QMT datasource restart: `29842302112`
- backend Docker deploy: `29842399236`
- monitoring deploy: `29842623245`
- TDX terminal recovery: `29842743802`
- QMT terminal recovery: `29842896091`
- baseline cleanup: `29843182538`
- QMT post-baseline runtime smoke: `29843335724`
- TDX post-baseline runtime smoke: `29844081771`

TDX recovery replaced owner `tdx-bridge-pid-31528` with
`tdx-bridge-pid-6100`, converged revision `0`, changed stream epoch, and passed
the official `:17709` `get_market_data` POST for `600519.SH`. QMT recovery
replaced owner `bigqmt-22824` with `bigqmt-10792` and passed native bars plus
bridge `health`, `get_market_data_ex`, and sector-list commands for
`300502.SZ`. Neither terminal recovery restarted a datasource or registered a
strategy.

The final TDX smoke observed owner `tdx-bridge-pid-6100`, bridge build
`mist-tdx-bridge-v0.2`, connected/ready backend state, two normalized daily
bars and one normalized snapshot for `600519.SH`, plus realtime WebSocket
ready/ping/pong. The smoke explicitly avoided the retired
`run-runtime-checks.ps1` and `tqInitialized` contract. The baseline cleanup
also physically removed stale `TDX_REALTIME_MODE` keys from the Windows
datasource and Docker environment files.

## 2026-07-21 Dead-Code And Conversion Audit

The active TDX/QMT paths were traced from terminal bridge through datasource
HTTP/WebSocket boundaries into the backend stores. Required JSON conversion
remains only at process boundaries. The cleanup removed unused TDX/QMT
instance config modules, the legacy `TdxWsMessage` and quote helper, unused QMT
module aliases, the fake SDK path from the delivered TDX bridge, duplicate v1
response serializers, one unused repository injection, redundant native dict
copies, and field-by-field reconstruction of already validated backend frames.
TDX still canonicalizes omitted optional wire fields to `null` without creating
a replacement frame.

Verification passed with datasource `358` tests, Ruff, and Pyright; backend
`394` tests, lint, typecheck, strict unused-symbol compilation, CI contracts,
and Nest build.

This after-hours run closes the deployment/recovery control-plane task only.
It does not close tasks 6.4 or 6.5: TDX and QMT snapshot freshness, native
realtime payload, sequence advance, and database digest evidence still require
the 2026-07-22 trading session. QMT realtime was `off`, so subscription
restoration was intentionally not applicable in this run.

## 2026-07-22 Ordered Runbook

### Before The Session

1. Resolve exact full SHAs from the deployed datasource, backend image,
   deployment checkout, monitoring marker, and both installed bridge files.
2. Verify the Windows SHA-256 values using lowercase input when invoking the
   evidence workflow.
3. Verify that TDX builtin realtime is healthy with no `TDX_REALTIME_MODE` key
   and that `QMT_REALTIME_MODE=off`. The historical mode-based TDX baseline runs
   predate convergence and cannot be reused as final acceptance evidence.
4. Stop if that baseline cannot be established through the controlled mode
   workflow or an exact known backup. Do not edit environment files ad hoc.
5. Capture TDX `baseline` for `600519.SH` and preserve its backup/identity
   values for all later TDX phases.

### TDX First: `600519.SH`

1. Between `09:40` and `11:15`, verify the always-on TDX builtin path and set
   the TDX allowlist to `600519.SH`.
2. Run strict TDX runtime smoke and inspect the bounded native payload.
3. Capture `enabled`, then verify a later increasing sequence.
4. Capture `post_restart` with a new epoch and a new fresh snapshot.
5. Clear the TDX allowlist and capture `post_rollback`; there is no legacy mode
   to restore.
6. Do not begin QMT until TDX is back at the recorded no-subscription baseline
   and all TDX artifacts have been uploaded successfully.

### QMT Second: `300502.SZ`

1. Capture QMT `baseline` while QMT is `off`.
2. Prefer `13:10-14:45`; enable only QMT experimental mode and confirm the
   registered full-QMT owner.
3. Run strict QMT runtime smoke and retain one bounded native
   `get_full_tick` object for `300502.SZ`.
4. Run `Recover Windows QMT Runtime`, then capture `enabled`, a later increasing
   sequence, and `post_restart` with a new owner, epoch, and fresh snapshot.
5. Roll back using the exact QMT backup and capture `post_rollback`.
6. Confirm the final effective state is TDX builtin with an empty allowlist and
   QMT `off`, unless the operator explicitly selects and records another
   approved final state.

### After The Session

1. Re-run the TDX `:17709` and QMT native historical matrices on the final
   deployed SHAs.
2. Compare protected-table row counts and deterministic digests across all four
   phases for each source.
3. Record accepted run IDs and artifact hashes in tasks 6.4-6.6 and the TDX F2
   evidence record.
4. Only then complete task 6.7, sync stable specs, archive Theme A, and release
   the Theme B gate.

## 2026-07-22 Trading-Session Results

The ordered TDX-then-QMT run completed against the following exact deployed
identities:

| Component | Exact identity |
|---|---|
| `mist-datasource` | `d97e29f3aba61de3eb99baf523b8caa4fe7ab47a` |
| Mist backend | `a08ac44ea262a1e2b1e0c895b3d57920efef2bde` |
| `mist-deploy` | `ce9107a42e8bcfcd6dfbcfb6f8416911e02ed42c` |
| `mist-monitoring` | `048dda32d9adc6bcb3021bc849b747a94cd34a05` |
| TDX bridge | `mist-tdx-bridge-v0.2`, SHA-256 `063943212180e1c3369905e464c72c35f2a94c62a9513880f70520aaa9a5260c` |
| QMT bridge | SHA-256 `14b6143fa1d81f32606b7090a5d687041922ae78e0abc30e0e56e11b7bfb880b` |

### TDX `600519.SH`

- Baseline `29884138077`, enabled capture `29884310794`, and initial strict
  smokes `29884263718` and `29884358373` passed. The latter observed sequence
  progression from `13` to `34` in the original stream.
- Terminal recovery `29885539439` replaced owner `tdx-bridge-pid-11096` with
  `tdx-bridge-pid-1332`, reconverged revision `1`, and passed the independent
  official `:17709` POST.
- Immediate 30-second and 90-second live smokes (`29885613182` and
  `29885691893`) timed out with the new owner healthy and subscriptions
  converged but no first snapshot. A later datasource timestamp proved the
  callback resumed after that bounded wait. This is recorded as a terminal
  cold-start delay, not as accepted evidence from either failed run.
- The bounded retry `29886156553` then passed with the same replacement owner:
  sequence `16`, last `1294.19`, native volume `34450`, and capture time
  `2026-07-22T10:34:26+08:00`.
- Final `post_restart` capture `29886212704` passed with a fresh native
  `get_market_snapshot` object, sequence `28`, zero backend drop counts, and a
  matching owner/epoch across datasource and Mist. Artifact digest:
  `sha256:7523b6028c50e1e0d9d02fc8c05860e2196955a5d70acb50550db6ee68d38088`.
- Rollback `29886252380` and final `post_rollback` capture `29886299255`
  passed. Artifact digest:
  `sha256:42619ef407536c3da66c1a479cf445fa818c452282880327e09593082cf5ff4e`.

### QMT `300502.SZ`

- Baseline `29884583009`, enable `29884670398`, strict smoke `29884750216`,
  and enabled capture `29884816858` passed. The first retained native
  `get_full_tick` contained same-session time `10:03:21`, last price `540.49`,
  and full bid/ask levels.
- Later smoke `29884870502` advanced the sequence from `81` to `222` and
  retained a newer native tick at `10:05:48`.
- Terminal recovery `29884949919` replaced owner `bigqmt-34036` with
  `bigqmt-31036` without restarting a datasource or registering a strategy.
- `post_restart` capture `29885071190` passed with the new owner, a new epoch,
  sequence `92`, and native `timetag=20260722 10:10:21`. Artifact digest:
  `sha256:a7e8ee4ce557d0a282e59e801088583778343093f0cc55695f9616f123e743bd`.
- Rollback `29885123101` and `post_rollback` capture `29885170367` passed.
  Artifact digest:
  `sha256:cc76fbb63d589defc47f0e22d575ff2eb2a03ce12830e763d0f0736299410024`.

### Database And Final State

Every TDX and QMT phase retained identical protected-table row counts and
content digests: `k=4375`, `k_extensions_tdx=4371`,
`k_extensions_qmt=4`, and zero rows in `k_extensions_ef`,
`strategy_signals`, and `strategy_alert_events`. The principal digests remain:

- `k`: `91ccfd3e1bda07fa1b4e64b146460366cbbe27d63f052e8522d459813189226b`
- `k_extensions_tdx`: `eba21ccd9ed20eb5ca15b50376bc1f5c642b88cf70bac43eb043de117f746a2d`
- `k_extensions_qmt`: `bf9ecbf751d3d1b5b06dc229bf64b4502138998aca693b181e020a653c756af3`

Final status runs `29885922512` and `29885922553` confirmed datasource and
backend state TDX `builtin`, QMT `off`. The final TDX rollback evidence also
confirmed an empty desired/converged subscription set and empty backend
allowlist.

The transport, restart, rollback, and no-K portions of tasks 6.4 and 6.5 are
complete. Formal acceptance remains open until the current Windows terminal
product/runtime inventory is captured and the F2 reviewer records an explicit
decision. Task 6.7 and the Theme B release gate therefore remain open.
