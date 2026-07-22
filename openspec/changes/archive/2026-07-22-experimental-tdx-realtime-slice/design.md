# Design — experimental-tdx-realtime-slice

## Context

11 rounds of independent review converged this design. Key decisions, each
backed by code verification:

1. **Sampled K never writes `k` table.** The `k` table has no provenance/
   finality/adjustment columns; four consumers (scanner, IndicatorService,
   backtest, Chan) read by `(securityId, source, period)` and cannot
   distinguish realtime samples from historical authoritative K. Write-time
   isolation (don't write) is cleaner than consumer-side gating.

2. **Latest snapshot only, no reducer.** A candle reducer looks simple but
   requires session boundaries, cumulative-counter resets, cross-day, unit
   handling, and restart semantics — too heavy for an experimental transport
   spike. We store only the latest authorized snapshot.

3. **Strict decoder, no silent fills.** Existing `normalize_tdx_snapshot` fills
   missing prices with 0 and missing times with the current clock — unsafe for
   realtime. The experimental decoder shares the raw field projection
   (`extract_tdx_snapshot_native_fields`) with HTTP but applies its own strict
   validation: `last` required finite, others null, no clock substitution.

4. **Isolated new code, minimal shared projection.** We do NOT refactor
   `ConnectionManager` (topic), extract `BaseRealtimeWebSocketService`, directly
   port the remote gateway, or delete `DataCollectionScheduler` — all deferred
   to avoid scope creep and regression risk on live code. We use two isolated
   manager instances and a new independent client.

## Architecture

```
TDX terminal (versioned strategy script)
  subscribe_hq(codes, cb)
    cb(code): threading.Lock → add to bounded dirty set → return
  worker loop (main thread):
    poll/heartbeat → reconcile (unsubscribe then subscribe, 50/batch) → result
    → swap dirty set under lock → filter desired ∩ converged
    → per-symbol get_market_snapshot → native projection POST (producerSequence)
        ↓ loopback HTTP (stdlib urllib only)
datasource :9001 (ExperimentalTdxRealtimeGateway, loopback-only)
  /tdx/bridge/owner   → leaseToken + streamEpoch + accepted tuple (health reports buildId)
  /tdx/bridge/poll    → desired revision
  /tdx/bridge/result  → applied/rejected (four-state convergence)
  /tdx/bridge/snapshot → producerSequence → validate lease/epoch/converged/monotonic
                        → atomic accept → authoritative outbound sequence
  /tdx/bridge/health  → buildId + owner + epoch + converged
  decoder: extract_tdx_snapshot_native_fields (shared raw projection)
           → strict validation (last finite; others null; no clock fill)
  experimental_ws_manager (isolated instance, not legacy ConnectionManager)
  stream_started (already-connected, epoch change) / ready (late-connect recovery)
        ↓ experimental WS (payloadType=tdx.realtime.snapshot, independent endpoint)
Mist (mode-gated DI)
  HistoricalCollectorModule (polling + CollectorController POST /collect; mist+schedule)
  LegacyTdxRealtimeModule (legacy streaming controller + aggregator + ws service + strategy; mist+legacy)
  ExperimentalTdxRealtimeModule (mist+builtin_experimental):
    ExperimentalTdxRealtimeClient (independent, strict JSON/RFC3339/epoch/seq/identity)
    allowlist (env ≤5, BINARY exact, fail-closed)
    InMemoryStore (beginEpoch / applyIfCurrentAndNewer CAS / markDisconnected / invalidateSymbol / readDebug)
    diagnostic readback (/internal/experimental/tdx/realtime/:formatCode + /status)
```

The pre-split aggregate `CollectorModule` is removed rather than retained as a
compatibility export. Keeping it would preserve a second DI graph containing
historical and legacy realtime providers together and could bypass the mode
gate if accidentally imported. Its obsolete provider test is replaced by a
test of the `HistoricalCollectorModule` polling-strategy provider; legacy
strategy behavior remains covered by its strategy tests and the mode matrix.

## Control-plane / data-plane authority split

| Plane | Owner | State |
|-------|-------|-------|
| Control (subscriptions) | datasource gateway | desired / attempted / converged / observedNative / streamEpoch / outbound sequence |
| Data fence | Mist store | currentEpoch / lastSequence / latestSnapshot / freshness |

Mist does NOT replicate the four states and does NOT self-generate epochs.
Epoch changes arrive only via `stream_started` (already-connected) or `ready`
(late-connect). Snapshots never implicitly switch epoch (prevents late frames
from reverting the store to an old epoch).

Every accepted `stream_started` event is an atomic generation identity tuple:
`(streamEpoch, generation, ownerId, bridgeBuildId)`. The datasource broadcasts
all four values from the same registered owner generation. Mist validates the
whole tuple before changing any store or diagnostic state; invalid or stale
events leave the previous generation untouched.

## decoder shared-projection (safe split)

```
TDX_SNAPSHOT_FIELD_ALIASES  (shared raw provider-field mapping)
        ↓
extract_tdx_snapshot_native_fields()  → separate raw provider fields + alias hits,
                                        no fill, no model
        ├─ HTTP projector: reads only Now/Open/Max/Min/LastClose/Volume/
        │                  Amount/AsOf (fill-0/fill-clock semantics UNCHANGED)
        └─ experimental decoder:
             resolves Last/Close/High/Low alternatives only here
             ErrorId validation; optional Code consistency validation
             envelope symbol is authoritative when snapshot omits Code
             last required + finite (reject NaN/Inf/bool)
             other prices: present-or-null
             eventTime: present-or-null (never clock-filled)
             strict: reject conflicting aliases
```

Even if this means duplicating ~7 lines of field mapping, it is safer than
parameterizing the live HTTP projector's missing-value policy.

The gateway treats transport symbols as exact identities. It may perform
stable de-duplication, but never trims, changes case, or calls
`normalize_symbol` for desired/add/remove/result state. The terminal binds each
single-symbol `get_market_snapshot` response to its request symbol. Provider
Code canonicalization, when a TDX build supplies the optional field, remains
confined to the terminal/provider boundary.

## Experimental lifecycle and exit gate

Current state: `transport-HIL-verified`; `hilOwner=project-maintainer`;
accepted `2026-07-22` before `hilBy=2026-08-17`.

Selected resolution path (2026-07-17): run the bounded Windows F2 HIL. The
acceptance record completed on 2026-07-22. F2 stores the native SDK
payload verbatim and a sanitized request envelope; `leaseToken` MUST be
redacted and MUST NOT be persisted in evidence.

| State | Entry evidence | Permitted runtime claim |
|-------|----------------|-------------------------|
| schema-draft | schema + goldens exist | design only |
| replay-proven | macOS real HTTP/WS replay and no-K gates pass | replay-backed experiment |
| HIL-pending | replay-proven + named owner + deadline | no live eligibility |
| transport-HIL-verified | accepted F2 with repo/script/TDX versions, trading phase, raw payload, and DB write digest | transport verified only |
| live-transport-experiment-eligible | HIL verified; one machine; 1–2 symbols; no writes; legacy rollback available | bounded live experiment |
| productization / research-archived | explicit follow-up decision | follow-up change or archive |
| reference-quarantined | HIL deadline missed or cannot be satisfied | no active wiring |

Quarantined code is reference material, not assumed reusable. Reactivation
requires mainline compatibility work and a complete replay validation before a
new HIL attempt.

## Fixture evidence tiers

| Tier | Source | Use |
|------|--------|-----|
| F0 | Hand-crafted normal/abnormal (missing fields, ErrorId, NaN, symbol mismatch) + `snapshot.json` (mock-adapter) | decoder edge cases |
| F1 | `live_market_snapshot_600519.json` (2026-06-29 external HTTP capture) | macOS main replay; tagged `F1-external-http`, `runtimeVersion=unknown` — does NOT prove builtin-strategy environment |
| F2 | First Windows HIL raw POST body | acquisition-profile authority; records datasource/Mist SHA + script SHA + TDX version + trading phase + raw payload. If F2 disagrees with v0, fix decoder + increment draftRevision (only if typed contract changed); NEVER edit fixture to match code. |

## No-K safety gate (three layers this phase; DB summary at HIL)

1. **Static dependency gate:** `ExperimentalTdxRealtimeModule` MUST NOT import
   `CollectorService`, `KCandleAggregator`, K repository, `StrategyScanService`.
2. **DI/route mode matrix:** under `builtin_experimental`, legacy providers and
   routes do not exist; schedule has no realtime WS.
3. **Activated poison replay:** accidental calls to
   `KCandleAggregator.process` / `saveRawKData` / scanner/signal/alert entry
   points fail immediately; experimental repository mocks throw on write.

(DB-level INSERT/UPDATE/DELETE interception with content digests moves to the
HIL gate, because K uses upsert and count-based checks miss in-place updates.)

## Why not (explicitly rejected alternatives)

- **Refactor `ConnectionManager` with topics:** requires connect/disconnect/
  send/namespace/count/health/cleanup all topic-aware — full live-code rewrite
  for zero experimental benefit. Use two isolated instances instead.
- **Extract `BaseRealtimeWebSocketService`:** `TdxWebSocketService` couples URL,
  subscription set, dispatch, alias parsing, 5-period aggregator, candle
  callbacks. Refactoring 558 lines + 579 test lines to share ~80 connection
  lines is not worth it. New independent client instead.
- **Direct port remote gateway:** remote has 7 structural defects (no
  lease/epoch/build, result advances on error, snapshot checks desired not
  converged, sequence committed after await, ready lacks epoch, calls
  `get_full_tick`). Core state-machine reuse ≈ 0. Use as scaffold only.
- **Delete `DataCollectionScheduler` in this PR:** confirmed runtime-dead but
  246 impl + 351 test lines would pollute the realtime PR diff and rollback.
  Separate `remove-orphaned-data-collection-scheduler` change.
