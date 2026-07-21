# Theme A Session Validation Matrix

Status: **execution pending**  
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
- Effective state after rollback is TDX `builtin_experimental`, QMT `off`.

## 2026-07-22 Ordered Runbook

### Before The Session

1. Resolve exact full SHAs from the deployed datasource, backend image,
   deployment checkout, monitoring marker, and both installed bridge files.
2. Verify the Windows SHA-256 values using lowercase input when invoking the
   evidence workflow.
3. Establish the formal baseline state `TDX_REALTIME_MODE=legacy` and
   `QMT_REALTIME_MODE=off` using a reversible recorded backup. The current TDX
   experimental state is not a valid TDX `baseline`.
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
4. Capture `enabled`, a later increasing sequence, and `post_restart` with a
   new epoch and fresh snapshot.
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
