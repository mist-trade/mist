# experimental-tdx-realtime-slice

## Why

The current TDX realtime path loads the `tqcenter` SDK inside the datasource
process (`adapter_legacy` + `tdx_legacy` collector), which couples SDK
lifecycle, strategy identity, and dirty-symbol collection to the web service
process. This makes the realtime path fragile on Windows and untestable on
macOS.

This change introduces an **experimental** TDX builtin bridge pathway that
moves SDK ownership out of the datasource process into a terminal strategy
script communicating over loopback HTTP. The datasource becomes a typed
control-plane gateway with an isolated experimental WebSocket; Mist runs an
isolated experimental consumer that stores only the latest authorized snapshot.

This is explicitly **not** a production realtime rollout. It validates
transport, control, and safety only — no K aggregation, no DB persistence, no
business side effects.

## What Changes

### Datasource (mist-datasource)

- Add `ExperimentalTdxRealtimeGateway`: loopback-only HTTP bridge with
  single-owner lease, four-state subscription convergence, and authoritative
  outbound sequence. **Rewritten from scratch** (remote WIP branch is scaffold
  / reference only — its state machine has structural defects).
- Add experimental TDX decoder: validates `ErrorId`/`Code`/`last`, emits typed
  draft snapshot (`last` required finite; `open`/`high`/`low`/`lastClose`
  present-or-null). Shares raw field projection with HTTP path but does **not**
  reuse `normalize_tdx_snapshot` (which silently fills missing prices with 0).
- Add isolated `experimental_ws_manager` instance (separate from legacy
  `ConnectionManager`). No topic modification to existing manager.
- Add experimental WS message factories (`ws_experimental_snapshot`,
  `ws_stream_started`). Do not reuse `ws_quote` (fixed `type="quote"` re-enters
  legacy aggregation semantics).
- Legacy realtime path (`adapter_legacy` + `tdx_legacy`) is **fully preserved**
  and guarded by `TDX_REALTIME_MODE`.

### Mist backend (mist)

- Split `CollectorModule` into three mode-gated modules:
  - `HistoricalCollectorModule` — polling strategies + `CollectorService` +
    historical `CollectorController` (only `POST /collect`). Imported by both
    mist and schedule.
  - `LegacyTdxRealtimeModule` — existing `TdxWebSocketService`,
    `KCandleAggregator`, `WebSocketCollectionStrategy`, legacy streaming test
    controller. Imported by mist only when `mode=legacy`.
  - `ExperimentalTdxRealtimeModule` — new independent
    `ExperimentalTdxRealtimeClient`, exact identity resolver, in-memory latest
    store, diagnostic readback. Imported by mist only when
    `mode=builtin_experimental`.
- Remove the obsolete aggregate `CollectorModule` implementation and its stale
  provider test after the split. The collector barrel exports
  `HistoricalCollectorModule`; no compatibility export may bypass mode gating.
- New independent `ExperimentalTdxRealtimeClient` (does **not** extend
  `TdxWebSocketService` or reuse `readNumber`/`readTimestamp`). Consumes typed
  wire; strictly validates JSON number/null, RFC3339, epoch, sequence, exact
  identity.
- `TDX_REALTIME_MODE=legacy|builtin_experimental|off` (default `legacy`).
  Mutual exclusion at DI level. Schedule never imports any realtime module.

### Terminal script (versioned deliverable)

- `mist_tdx_realtime_bridge.py`: `subscribe_hq` callback marks dirty symbols
  only (under `threading.Lock`, no SDK/HTTP in callback); worker loop fetches
  via `get_market_snapshot` and POSTs native projection. Carries SHA, artifact
  SHA, build ID; health reports build ID.

### What is explicitly out of scope

- QMT realtime (codec, WS, consumer).
- Candle reducer (`locateContainingCandle`, aggregation, cumulative cursor).
- Any K-line persistence (`sampled K` never writes `k` table).
- Redis / Pub-Sub / LRU / multi-instance.
- Frontend realtime preview API.
- Shadow strategy window evaluation.
- EOD reconciliation / finalization.
- `realtime_subscription_targets` DB migration.
- Generic securities-identity refactor (`exchange,code`).
- Deleting `DataCollectionScheduler` (separate cleanup change).
- Extracting `BaseRealtimeWebSocketService` (deferred until both paths pass
  HIL; use composition, not inheritance).
- Windows HIL (hard gate for canary/live).

Windows HIL execution is outside this implementation slice, but its lifecycle
gate is not optional. The current experiment state is `HIL-pending`, owned by
`project-maintainer`, with `hilBy=2026-08-17`. Until that gate is resolved, a
completed macOS replay slice MUST NOT be described as production-ready.

Resolution path selected on 2026-07-17: **Windows F2 HIL** (option 1). Active
experimental wiring remains in place for that bounded verification. The
selection does not advance lifecycle state by itself; only accepted evidence
using the checklist in `evidence/F2-WINDOWS-HIL.md` may advance the state to
`transport-HIL-verified`. The deadline fallback to `reference-quarantined`
remains mandatory if accepted evidence is not available by `hilBy`.

## Impact

- **mist-datasource**: new gateway, decoder, experimental WS factories,
  isolated manager instance. Legacy untouched except mode guard.
- **mist**: module split (including controller), new experimental client,
  store, allowlist, diagnostic readback.
- **mist-deploy**: deferred to monitoring/deploy phase (after schema freeze).
- **mist-monitoring**: deferred.

## Completion Criteria

`replay-backed experimental slice integrated` — not "production realtime
validated". The experimental path works under macOS replay (fake bridge +
fixtures through real HTTP/WS/codec/allowlist/store); no K writes, no business
side effects (three-layer gate); legacy fully preserved.

The lifecycle remains open after those criteria pass:

```text
schema-draft → replay-proven → HIL-pending(owner + hilBy)
  → transport-HIL-verified → live-transport-experiment-eligible
      ├─ productization change
      └─ research-archived
deadline exceeded without accepted HIL → reference-quarantined
```

`reference-quarantined` removes active provider/module/route wiring but keeps
the OpenSpec artifacts, fixtures, replay harness, and evidence tags. Restoring
it requires rebasing against the then-current mainline and rerunning every
macOS gate before assigning a new HIL owner and deadline.
