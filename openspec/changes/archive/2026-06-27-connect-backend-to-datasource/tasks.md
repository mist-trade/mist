## 0. Status Snapshot Captured On 2026-06-28

- [x] 0.1 Confirm `mist` and `mist-datasource` workspace status after the latest
      datasource work: `mist-datasource` is clean, and `mist` only has this
      untracked OpenSpec change directory.
- [x] 0.2 Confirm active datasource OpenSpec state:
      `align-tdx-qmt-datasource-contracts` is 58/59 and only the Windows
      logged-in TDX runtime smoke remains.
- [x] 0.3 Confirm datasource `/v1` surface now includes bars, snapshots,
      price-volume, calendar, securities, sectors, reference, instruments,
      finance/report, formula, providers, health, and raw diagnostics.
- [x] 0.4 Confirm backend `TdxSource.fetchK` currently calls
      `POST /v1/bars/query` and maps `data.bars[*]` from the datasource
      envelope.
- [x] 0.5 Confirm backend `TdxSource.fetchSnapshot` currently calls
      `POST /v1/snapshots/query` and maps `data.snapshots[*]` from the
      datasource envelope.
- [x] 0.6 Confirm backend production code is guarded from using
      `/v1/raw/tdx/call` through
      `apps/mist/src/sources/tdx/tdx-raw-endpoint.guard.spec.ts`.
- [x] 0.7 Confirm backend WebSocket currently connects to
      `${TDX_BASE_URL}/ws/quote/${TDX_WS_CLIENT_ID}`, sends
      `sync_subscriptions` on socket open, handles normalized `bar` events, and
      keeps legacy `quote` aggregation compatibility.
- [x] 0.8 Run targeted backend tests with Watchman disabled:
      `env JEST_HASTE_MAP_FORCE_NODE_FS=1 pnpm exec jest apps/mist/src/sources/tdx/tdx-source.service.spec.ts apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts apps/mist/src/sources/tdx/tdx-raw-endpoint.guard.spec.ts --runInBand --watchman=false`.
      Result: 4 test suites passed, 42 tests passed.
- [x] 0.9 Validate current OpenSpec changes:
      `openspec validate align-tdx-qmt-datasource-contracts --strict` and
      `openspec validate connect-backend-to-datasource --strict` both pass.

## 1. Baseline Backend Integration Already Present

- [x] 1.1 Add local datasource envelope, normalized bar, normalized snapshot, and
      datasource error types to `apps/mist/src/sources/tdx/types.ts`.
- [x] 1.2 Update `TdxSource.fetchK` to call
      `this.axios.post('/v1/bars/query', payload)` instead of legacy
      `GET /api/tdx/market-data`.
- [x] 1.3 Map backend `Period` through
      `PeriodMappingService.toSourceFormat(period, DataSource.TDX)` and send the
      resulting value as the `/v1/bars/query` `period`.
- [x] 1.4 Replace provider-shaped market-data parsing with normalized bar
      envelope parsing and `barTime` to `Date` conversion.
- [x] 1.5 Update `TdxSource.fetchSnapshot` to call
      `this.axios.post('/v1/snapshots/query', { symbols: [stockCode] })`.
- [x] 1.6 Replace provider-shaped snapshot parsing with normalized snapshot
      envelope parsing.
- [x] 1.7 Convert datasource `ok: false` envelopes and malformed bar/snapshot
      payloads into backend upstream datasource `HttpException`s.
- [x] 1.8 Add backend unit tests for `/v1/bars/query`,
      `/v1/snapshots/query`, successful mapping, invalid payloads, and failure
      envelopes in `tdx-source.service.spec.ts`.
- [x] 1.9 Add backend WebSocket tests for socket construction,
      `sync_subscriptions` on open, subscribe/unsubscribe resync, normalized
      `bar`, legacy `quote`, and callback error logging.
- [x] 1.10 Add `WebSocketCollectionStrategy` coverage proving normalized TDX
      bars resolve the real `Security` and persist through
      `CollectorService.saveRawKData`.
- [x] 1.11 Update `.env.example` and `deploy/windows/backend.env.example` so
      `TDX_BASE_URL` and `TDX_WS_CLIENT_ID` identify the Python datasource base
      URL and backend WebSocket client.

## 2. Datasource Bar Contract And Field Preservation

- [x] 2.1 Compare the current datasource `TdxBarQueryRequest` against legacy
      `/api/tdx/market-data` parameters and record the remaining non-equivalent
      fields: `fields`, `dividend_type`, `fill_data`, `ForwardFactor`,
      and `VolInStock`.
- [x] 2.2 Extend or confirm datasource `/v1/bars/query` support for `fields`,
      `dividendType`, `fillData`, and structured extension fields before
      expanding backend persistence.
- [x] 2.3 Add datasource tests that prove `/v1/bars/query` passes the requested
      field list and dividend/fill parameters to TDX `get_market_data`.
- [x] 2.4 Add datasource tests that prove `ForwardFactor` and `VolInStock` can
      survive normalization when returned by TDX.
- [x] 2.5 Add datasource tests that prove provider-specific fields are exposed as
      named structured fields, not only as opaque raw payloads.

## 3. Backend Field Persistence

- [x] 3.1 Decide the structured owner for each non-normalized field:
      `KExtensionTdx` for TDX K-line extensions and separate domain tables for
      non-K-line reference, finance/report, security, or corporate-action data.
- [x] 3.2 Update `apps/mist/src/sources/tdx/types.ts` so `TdxNormalizedBar` and
      `TdxResponse` can carry structured TDX extension fields returned by
      datasource `/v1/bars/query`.
- [x] 3.3 Update `TdxSource.fetchK` to request the backend-required bar field set
      once datasource `/v1/bars/query` exposes `fields`, `dividendType`, and
      `fillData`.
- [x] 3.4 Update `TdxSource.fetchK` to map datasource extension fields into
      `TdxResponse.extensions` rather than only top-level `forwardFactor`.
- [x] 3.5 Update `TdxSource.saveK` so it writes every available structured TDX
      extension field and does not overwrite absent values with misleading
      default zeros.
- [x] 3.6 Add backend tests for saving `forwardFactor`, `volInStock`, and any
      other structured TDX extension fields that the datasource contract
      guarantees.
- [x] 3.7 Add backend tests proving unsupported/unowned provider fields are not
      persisted as opaque raw JSON.
- [x] 3.8 Switch `fetchDividFactors` from legacy `/api/tdx/divid-factors` to
      `/v1/reference/dividend-factors/query`, or document why the legacy helper
      remains outside this change.

## 4. Backend WebSocket Protocol Gaps

- [x] 4.1 Add tests that verify a datasource `ready` message triggers a full
      `sync_subscriptions` resend with the locally desired symbol set.
- [x] 4.2 Implement `ready` handling in `TdxWebSocketService` without clearing
      desired subscriptions.
- [x] 4.3 Add tests that verify reconnect creates a new socket and resends
      `sync_subscriptions` after the new socket opens.
- [x] 4.4 Add handling and tests for datasource `subscribed` and `unsubscribed`
      acknowledgement messages so accepted, rejected, and active symbols are
      logged.
- [x] 4.5 Add handling and tests for datasource WebSocket `error` messages so
      error `code`, `message`, `retryable`, and `details` are logged without
      dropping desired subscriptions.
- [x] 4.6 If datasource normalized `bar` events gain structured extension fields,
      update `TdxRealtimeBar`, `parseBar`, and `WebSocketCollectionStrategy` so
      streaming persistence preserves the same fields as HTTP polling.

## 5. Deployment Configuration And Documentation

- [x] 5.1 Update `deploy/windows/health-check.ps1` to resolve `TDX_BASE_URL` from
      the backend env file and fall back to `http://127.0.0.1:9001` only when
      missing.
- [x] 5.2 Update `deploy/windows/health-check.ps1` to probe datasource
      `GET /health` at the configured base URL.
- [x] 5.3 Update `deploy/windows/health-check.ps1` to probe `GET /providers` at
      the configured base URL.
- [x] 5.4 Make any live `POST /v1/bars/query` health probe explicitly controlled
      by a test symbol parameter so non-live environments can still pass shallow
      deployment checks.
- [x] 5.5 Update `deploy/windows/test-database-bootstrap.ps1` or add a focused
      deployment script test that asserts health checks no longer hardcode only
      `http://127.0.0.1:9001`.
      Also added a Windows appliance migration for `k_extensions_tdx.volInStock`
      and bootstrap assertions so production deployments do not depend on
      TypeORM synchronize for the new structured extension field.
- [x] 5.6 Update `deploy/windows/README-Windows.md` with backend/datasource
      startup order, configured `TDX_BASE_URL`, normalized API probe, expected
      success output, and rollback guidance.
- [x] 5.7 Create or update backend integration documentation under
      `docs/backend-datasource-integration.md` if the project keeps general
      backend docs outside Windows deployment docs.

## 6. Verification Before Completion

- [x] 6.1 Run the targeted backend command:
      `env JEST_HASTE_MAP_FORCE_NODE_FS=1 pnpm exec jest apps/mist/src/sources/tdx/tdx-source.service.spec.ts apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts apps/mist/src/sources/tdx/tdx-raw-endpoint.guard.spec.ts --runInBand --watchman=false`.
      In the isolated worktree, `pnpm exec` attempted dependency installation,
      so verification used the original checkout's local Jest binary against
      this worktree. Result: 4 suites passed, 50 tests passed.
- [x] 6.2 Run the smallest collector test command that covers
      `CollectorService`, `TdxCollectionStrategy`, and
      `WebSocketCollectionStrategy`.
      Result: `collector.service`, `websocket-collection.strategy`, and
      `collector.module` specs passed, 23 tests passed.
- [x] 6.3 Run `uv run pytest -m "not live"` in `../mist-datasource` to verify the
      datasource normalized endpoints still pass.
      In the isolated datasource worktree, `uv run` needed network to create a
      fresh environment, so verification used the original datasource `.venv`
      with `PYTHONPATH` pointed at this worktree. Result: 325 passed, 6 live
      tests deselected.
- [x] 6.4 Run backend lint or focused TypeScript validation for touched backend
      files.
      Result: ESLint touched files passed; `tsc -p apps/mist/tsconfig.app.json
      --noEmit` passed.
- [x] 6.5 Run `openspec validate connect-backend-to-datasource --strict` from
      `mist/`.
- [x] 6.6 On Windows, start MySQL, the Python datasource service, and the Mist
      backend with matching `TDX_BASE_URL`.
- [x] 6.7 On Windows with TDX logged in, run `deploy/windows/health-check.ps1` and
      verify datasource `/health`, `/providers`, optional normalized API probe,
      backend `/app/hello`, and backend `/security/v1/all`.
- [x] 6.8 Capture the Windows smoke output or a short verification note in this
      OpenSpec change before marking implementation complete.
      Windows LAN live smoke on 2026-06-28 used backend
      `http://192.168.31.182:8001` and datasource
      `http://192.168.31.182:9001` after the user confirmed TDX was logged in.
      Results:
      - `GET /app/hello`: HTTP 200, data `Hello World!`.
      - `GET /security/v1/all`: HTTP 200; initial active security count was 0.
      - datasource `GET /health`: HTTP 200, `status=ok`,
        `tdxHttpReachable=true`, `tqInitialized=true`,
        `collectorState=not_started`, `eventQueueDepth=0`.
      - datasource `GET /providers`: HTTP 200, envelope `ok=true`,
        provider count 2.
      - datasource `POST /v1/bars/query` for `600519.SH`, period `1d`,
        count 1, requested `Open`, `High`, `Low`, `Close`, `Volume`,
        `Amount`, `ForwardFactor`, `VolInStock`: HTTP 200, envelope
        `ok=true`, returned 1 bar for `2026-06-26T00:00:00+08:00`.
      - backend write-path smoke created security `600519`, added TDX source
        `600519.SH`, then called `POST /v1/collector/collect` with
        `period=1440`, `source=tdx`, and the 2026-06-26 day window:
        HTTP 200, returned `count=1`.
      - `POST /indicator/k` for the same symbol, source, period, and window:
        HTTP 201, returned 1 saved K row with open `1199.00`, high `1199.00`,
        low `1168.10`, close `1168.63`, amount `592201.44`.
      - Follow-up Windows-local script output showed the deployed
        `F:\quant\MistAPI\health-check.ps1` passed MySQL, datasource
        `/health`, backend `/app/hello`, and backend `/security/v1/all`, but it
        did not execute the newer `/providers` or normalized bars probe lines;
        `Select-String` for `providers`, `bars/query`, `TdxTestSymbol`, and
        `TDX datasource URL` returned no matches, so the deployed script is
        older than this worktree's health-check update.
      - Windows-local manual补验 then passed the two missing probes:
        `Invoke-RestMethod http://127.0.0.1:9001/providers` returned
        provider count 2, and `POST http://127.0.0.1:9001/v1/bars/query` for
        `600519.SH` returned 1 bar with
        `barTime=2026-06-26T00:00:00+08:00` and `close=1168.63`.
