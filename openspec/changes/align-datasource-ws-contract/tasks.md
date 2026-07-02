# Tasks: Align datasource WebSocket contract

## 1. Select Scope And Baseline

- [x] 1.1 Record selected review IDs: CODE_REVIEW C5, H4, H5;
      CODE_SMELL D2.2, R2.1, P2.1, P2.2, M2.2, U2.1, U2.3, O2.1.
- [x] 1.2 Inspect current datasource `WSMessage`, TDX/QMT WS routes,
      snapshot publisher, old route exposure, and existing datasource tests.
- [x] 1.3 Inspect current backend `TdxWebSocketService` parsing and tests.
- [x] 1.4 Identify targeted tests/substitute verification for canonical WS
      envelope, TDX/QMT error shape, pong timestamp, subscription ack shape,
      snapshot serializer, backend parsing, and old-route migration boundary.

## 2. Add Failing Tests First

- [x] 2.1 Add datasource protocol unit tests proving `WSMessage` helper
      constructors emit timestamped pong, data-based error, subscription ack,
      ready, and quote messages.
- [x] 2.2 Add or update TDX WebSocket route tests proving ping, invalid JSON,
      subscription acknowledgement, duplicate-client error, and snapshot quote
      messages use the canonical `WSMessage` envelope.
- [x] 2.3 Add or update QMT WebSocket route tests proving ping, adapter
      unavailable error, subscription acknowledgement, and generic error
      messages use the canonical `WSMessage` envelope.
- [x] 2.4 Add datasource snapshot serializer tests proving TDX snapshot quote
      output is centralized and avoids duplicate aliases such as `Last` and
      `Max`.
- [x] 2.5 Add backend `TdxWebSocketService` tests proving canonical
      `data`-based error and subscription acknowledgement parsing works while
      legacy fallback still works.
- [x] 2.6 Add datasource route contract tests or static checks proving old
      routes are documented/marked as migration-only and `/v1` remains the
      product-facing route family.
- [x] 2.7 Run targeted tests and confirm the new assertions fail for the
      intended reasons before implementation.

## 3. Implement Datasource WS Contract

- [x] 3.1 Add canonical `WSMessage` helper constructors or factory functions
      in `src/ws/protocol.py`.
- [x] 3.2 Update `TdxBridge`, `tdx/routes/ws.py`, and duplicate-client/error
      paths to emit helpers instead of hand-written dicts.
- [x] 3.3 Update `qmt/routes/ws.py` to emit canonical pong, subscription ack,
      and error messages.
- [x] 3.4 Add a centralized TDX snapshot quote serializer and update
      `_publish_collector_snapshot` to use it.
- [x] 3.5 Add old-route migration documentation or deprecation metadata and
      keep normalized `/v1` routes as the product contract.
- [x] 3.6 Keep unsupported provider operations as structured capability
      failures; do not add a broad adapter ABC.

## 4. Implement Backend Consumer Alignment

- [x] 4.1 Update `TdxWebSocketService` subscription acknowledgement logging to
      prefer canonical `message.data`.
- [x] 4.2 Update `TdxWebSocketService` datasource error logging to prefer
      canonical `message.data`.
- [x] 4.3 Keep temporary legacy top-level parsing fallbacks for existing TDX
      payloads during the migration.
- [x] 4.4 Ensure quote/pong handling remains compatible with current
      snapshot-only streaming behavior.

## 5. Verify And Record Evidence

- [x] 5.1 Run targeted datasource WS protocol and route tests.
- [x] 5.2 Run `env UV_CACHE_DIR=.uv-cache uv run ruff check .` in
      `mist-datasource`.
- [x] 5.3 Run `env UV_CACHE_DIR=.uv-cache uv run pytest -m "not live"` in
      `mist-datasource`.
- [x] 5.4 Run targeted backend WebSocket tests in `mist`.
- [x] 5.5 Run `pnpm run lint:check`, `pnpm run typecheck`, and relevant test
      suites in `mist`.
- [x] 5.6 Run `openspec validate align-datasource-ws-contract --strict`.
- [x] 5.7 Record `review-id -> changed files -> test/verification command` in
      `evidence.md`.
- [x] 5.8 Update the parent `stabilize-review-remediation` tasks after this
      child change is created and verified.
