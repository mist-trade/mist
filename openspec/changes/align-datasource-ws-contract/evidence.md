# Evidence: Align datasource WebSocket contract

## Review IDs

| Review ID | Changed files | Evidence |
| --- | --- | --- |
| CODE_REVIEW C5 | `mist-datasource/src/ws/protocol.py`, `mist-datasource/src/datasource/tdx_bridge.py`, `mist-datasource/tdx/routes/ws.py`, `mist-datasource/qmt/routes/ws.py`, `mist/apps/mist/src/sources/tdx/tdx-websocket.service.ts` | Added red tests proving TDX/QMT pong, error, subscription ack, and backend ack/error parsing use the canonical `WSMessage` `data` payload. |
| CODE_REVIEW H4 | `mist-datasource/docs/references/tdxquant-interface-coverage.md`, `mist-datasource/tests/unit/test_tdx_interface_coverage.py` | Added a static contract test proving normalized `/v1` remains the product-facing route family and old `/api/tdx/*` routes are migration-only, without adding a broad adapter ABC. |
| CODE_REVIEW H5 | `mist-datasource/docs/references/tdxquant-interface-coverage.md`, `mist-datasource/tests/unit/test_tdx_interface_coverage.py` | Documented old TDX routes as migration-only and added a test that locks the boundary. |
| CODE_SMELL D2.2 | `mist-datasource/src/ws/protocol.py`, `mist-datasource/tests/unit/test_ws_protocol.py` | Added protocol helper tests proving `WSMessage` timestamp/provider/data fields are used for pong, ready, error, subscription ack, and quote. |
| CODE_SMELL U2.3 | `mist-datasource/tdx/routes/ws.py`, `mist-datasource/qmt/routes/ws.py`, `mist-datasource/src/datasource/tdx_bridge.py`, `mist-datasource/tests/integration/test_tdx_ws.py`, `mist-datasource/tests/integration/test_qmt_ws.py` | Replaced route-local hand-written pong/error/subscription dicts with canonical helpers and route tests. |
| CODE_SMELL M2.2, O2.1 | `mist-datasource/tdx/main.py`, `mist-datasource/tests/integration/test_tdx_ws.py` | Added tests proving TDX snapshot quote output is serialized centrally and no longer emits duplicate aliases such as `Last`, `Max`, or `Min`. |
| CODE_SMELL R2.1, P2.1, P2.2, U2.1 | `mist-datasource/docs/references/tdxquant-interface-coverage.md`, `mist-datasource/tests/unit/test_tdx_interface_coverage.py` | Kept broad route/adapter cleanup scoped to migration boundary documentation and static contract tests for this child change. |

## Red Test Evidence

- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_ws_protocol.py tests/integration/test_tdx_ws.py tests/integration/test_qmt_ws.py tests/unit/test_tdx_interface_coverage.py` first failed during collection because `ws_error`, `ws_pong`, `ws_quote`, `ws_ready`, and `ws_subscription_ack` did not exist.
- After adding protocol helpers, the datasource target tests failed because:
  - TDX pong lacked `provider`, `timestamp`, and `data`;
  - TDX subscription acks still emitted top-level `stocks`;
  - TDX errors still used top-level `error`;
  - TDX snapshot quote emitted duplicate `Last`, `Max`, and `Min` aliases;
  - QMT pong, error, and subscription ack used provider-specific hand-written shapes;
  - the old `/api/tdx/*` migration boundary was not documented.
- `pnpm exec jest apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts --runInBand --watchman=false` failed before backend implementation because canonical `message.data` ack/error payloads were ignored.

## Green Verification

- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_ws_protocol.py tests/integration/test_tdx_ws.py tests/integration/test_qmt_ws.py tests/unit/test_tdx_interface_coverage.py` -> 36 passed, 1 warning.
- `env UV_CACHE_DIR=.uv-cache uv run ruff check .` -> passed.
- `env UV_CACHE_DIR=.uv-cache uv run pytest -m "not live"` -> 349 passed, 6 deselected, 1 warning.
- `pnpm exec jest apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts --runInBand --watchman=false` -> 29 passed.
- `pnpm run lint:check` -> passed.
- `pnpm run typecheck` -> passed.
- `pnpm run test:ci` -> 55 suites passed, 457 tests passed.
