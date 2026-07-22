# Tasks — experimental-tdx-realtime-slice

## 1. Contract freeze (C0.1)

- [x] 1.1 Freeze JSON Schema `tdx-realtime-snapshot-v0.json` (schemaVersion=0,
      draftRevision=1, all fields typed).
- [x] 1.2 Freeze golden messages (normal, partial, reject cases,
      stream_started, ready, owner registration).
- [x] 1.3 Freeze control/data plane authority split (gateway owns 4-state +
      epoch + outbound seq; store owns fence).
- [x] 1.4 Freeze mode matrix (legacy / builtin_experimental / off) for both
      datasource and Mist.
- [x] 1.5 Freeze decoder shared-projection split (raw projection shared,
      fill policy per-path).
- [x] 1.6 Freeze terminal-script versioning requirements (SHA, buildId,
      callback dirty-only invariant).
- [x] 1.7 `openspec validate experimental-tdx-realtime-slice --strict`.

## 2. Datasource (DS-T) — mist-datasource

- [x] 2.1 Add `TDX_SNAPSHOT_FIELD_ALIASES` + `extract_tdx_snapshot_native_fields`
      (raw optional values, no fill, no model) — shared with HTTP, HTTP
      projector unchanged. The alias table and raw projection MUST live in a
      shared module and both HTTP normalization and the experimental decoder
      MUST consume it; HTTP fill/clock/first-alias behavior remains regression
      covered.
- [x] 2.2 Add strict experimental decoder: validate ErrorId and optional native
      Code consistency while accepting the official Code-less snapshot shape;
      last required finite (reject NaN/Inf/bool), other prices null, eventTime
      null (no clock), reject conflicting aliases.
- [x] 2.3 Add `ExperimentalTdxRealtimeGateway`: owner registration (leaseToken
      + streamEpoch + accepted tuple), four-state convergence (desired/
      attempted/converged/observedNative), atomic outbound sequence reservation
      (before any await), native subscription reconciliation, retry
      classification/backoff. Result failures MUST expose a stable retryable
      classification and bounded retry delay; terminal retries MUST honor it
      and re-register after owner/lease/epoch fencing failures.
- [x] 2.4 Add loopback-only routes: `/tdx/bridge/{owner,poll,result,snapshot,
      health}`. Health reports buildId + owner + epoch + converged. Every route,
      including health, MUST reject non-loopback callers, and request models
      MUST reject unknown fields.
- [x] 2.5 Add experimental WS message factories `ws_experimental_snapshot`,
      `ws_stream_started` (do NOT reuse `ws_quote`). Extend `ready` to carry
      contract tuple + currentStreamEpoch + buildIds.
- [x] 2.6 Instantiate isolated `experimental_ws_manager` (separate
      `ConnectionManager()` instance; legacy manager untouched).
- [x] 2.7 Wire gateway into datasource lifespan gated on
      `TDX_REALTIME_MODE=builtin_experimental` (legacy path untouched with mode
      guard).
- [x] 2.8 macOS tests: gateway state-machine unit tests (epoch fencing,
      sequence dedup, four-state transitions, lease expiry); decoder strict
      validation (F0 fixtures); WS factory shape.
- [x] 2.9 `uv run pytest -m "not live"` + `uv run ruff check .` +
      `uv run pyright src/`.

## 3. Mist (M-T) — mist backend

- [x] 3.1 Split `CollectorModule` → `HistoricalCollectorModule` (CollectorController
      with only `POST /collect`, CollectorService, polling strategies, registry)
      + `LegacyTdxRealtimeModule` (LegacyTdxStreamingController, KCandleAggregator,
      TdxWebSocketService with mode guard, WebSocketCollectionStrategy). Legacy
      imports Historical for CollectorService. Remove the obsolete aggregate
      module and stale provider spec; export Historical from the collector barrel
      and retain polling-provider coverage against the new module.
- [x] 3.2 Add `ExperimentalTdxRealtimeModule` (mist + builtin_experimental only):
      ExperimentalTdxRealtimeClient, identity resolver, store, diagnostic
      controller.
- [x] 3.3 Conditional module wiring on `TDX_REALTIME_MODE` in `app.module.ts`
      and `schedule.module.ts` (schedule imports only Historical; unknown mode
      fails bootstrap).
- [x] 3.4 Add `ExperimentalTdxRealtimeClient` (independent — no inheritance,
      no `readNumber`/`readTimestamp` reuse): strict JSON number/null,
      RFC3339, epoch, sequence, exact identity validation from typed wire.
      Runtime validation MUST enforce the frozen schema's exact object keys and
      strict `quality` object/boolean semantics; every rejected frame MUST
      increment a stable drop reason counter.
- [x] 3.5 Add allowlist resolver: env `TDX_EXPERIMENTAL_ALLOWLIST` (≤5),
      `BINARY formatCode` or JS `===` filter, exactly-one-match fail-closed,
      no `normalizeSecurityCode` fallback.
- [x] 3.6 Add `InMemoryStore`: `beginEpoch` / `applyIfCurrentAndNewer` (sync
      CAS, no await between check and set) / `markDisconnected` /
      `invalidateSymbol` / `readDebug`. Per-instrument: currentEpoch /
      lastSequence / latestSnapshot. Freshness via receivedAt/capturedAt
      (lazy stale check, no background TTL).
- [x] 3.7 Epoch handling: `ready` → recover currentStreamEpoch → beginEpoch;
      `stream_started` → invalidate old → beginEpoch; snapshot epoch mismatch
      → drop + count.
- [x] 3.8 Add diagnostic readback: `GET /internal/experimental/tdx/realtime/
      :formatCode` + `/status` (experimental mode + loopback/admin only).
      Returns typed snapshot, epoch, sequence, receivedAt, fresh/stale,
      drop reason, counters, owner, latest age, active symbols.
- [x] 3.9 Migrate controller spec (streaming routes → LegacyTdxStreamingController
      spec); new thin CollectorController spec (only `/collect`); module-graph
      tests.
- [x] 3.10 `pnpm typecheck && pnpm test && pnpm test:cov`.

## 4. Terminal script (DS-T companion)

- [x] 4.1 `mist_tdx_realtime_bridge.py`: `subscribe_hq` callback marks dirty
      under `threading.Lock` (no SDK/HTTP in callback); worker loop reconcile
      + swap dirty + filter desired∩converged + `get_market_snapshot` + POST
      (producerSequence).
- [x] 4.2 Carry `bridgeBuildId` + `bridgeArtifactSha256` + contract tuple in
      owner registration.
- [x] 4.3 Install/start/stop/rollback documentation.
- [x] 4.4 Adjust remote WIP guardrail: allow `threading.Lock`, keep forbidding
      `threading.Thread`.

## 5. Safety gates + replay (SAFE)

- [x] 5.1 Static dependency gate test: `ExperimentalTdxRealtimeModule` imports
      audited — no CollectorService/KCandleAggregator/K repo/StrategyScanService.
- [x] 5.2 DI/route mode matrix tests: builtin → legacy provider unresolvable +
      routes absent; schedule → no realtime WS.
- [x] 5.3 Poison replay: `KCandleAggregator.process` / `saveRawKData` /
      scanner/signal/alert entry calls fail; experimental repo mock writes
      throw.
- [x] 5.4 F0 fixtures (hand-crafted normal/abnormal + snapshot.json) for
      decoder edges.
- [x] 5.5 F1 fixture (`live_market_snapshot_600519.json`) tagged
      `F1-external-http` / `runtimeVersion=unknown`.
- [x] 5.6 Cross-repo replay E2E (builtin_experimental mode): fake bridge +
      fixtures → real HTTP/WS → codec → allowlist → store. Verify: epoch
      mismatch/dup/out-of-order/unknown-schema dropped; ready late-connect;
      stream_started switch; store update; diagnostic readback correct; no-K
      gates green. The positive path MUST exercise production datasource app
      wiring and the real allowlist resolver logic (with mocked repositories),
      while malformed-broadcast injection MAY use the dedicated replay app.

## 6. Cross-repo validation

- [x] 6.1 `pnpm typecheck && pnpm test && pnpm lint` (mist).
- [x] 6.2 `uv run pytest -m "not live" && uv run ruff check . && uv run pyright src/`
      (mist-datasource).
- [x] 6.3 `pnpm ci:contracts` with `MIST_WORKSPACE_ROOT` set.
- [x] 6.4 Confirm legacy path unchanged (default `legacy` mode regression).

## 7. Experimental lifecycle gate

- [x] 7.1 Restore the v10 lifecycle contract and record the current state as
      `HIL-pending` with `hilOwner=project-maintainer` and
      `hilBy=2026-08-17`. Completion of the macOS slice MUST NOT be described
      as production readiness.
- [x] 7.2 Resolve `HIL-pending` by `2026-08-17`: either capture accepted F2
      Windows evidence and advance through `transport-HIL-verified`, or enter
      `reference-quarantined` and remove active runtime wiring while preserving
      specs, fixtures, replay harness, and evidence. This task intentionally
      remained open until one of those outcomes occurred. Windows F2 HIL was
      accepted on 2026-07-22 using `evidence/F2-WINDOWS-HIL.md`, advancing the
      lifecycle to `transport-HIL-verified`.
