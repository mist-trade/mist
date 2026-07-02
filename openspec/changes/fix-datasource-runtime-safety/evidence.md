# Evidence: Fix datasource runtime safety

## Review IDs

| Review ID | Changed files | Evidence |
| --- | --- | --- |
| CODE_REVIEW C2 | `src/adapter/tdx/client.py`, `src/adapter/qmt/client.py`, `tests/unit/test_tdx_adapter_runtime_safety.py`, `tests/unit/test_qmt_runtime_safety.py` | Added red tests proving blocking TDX/QMT SDK calls stall the event loop, then moved implemented SDK calls through `asyncio.to_thread` helpers. Green command: `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_tdx_adapter_runtime_safety.py tests/unit/test_qmt_runtime_safety.py`. |
| CODE_REVIEW C3 | `src/adapter/qmt/client.py`, `tests/unit/test_qmt_runtime_safety.py` | Added red test proving a QMT callback invoked from a non-asyncio thread cannot use callback-thread loop discovery. Fixed `subscribe_quote` to capture the running loop during subscription startup and use `call_soon_threadsafe`. |
| CODE_REVIEW C4 | `src/datasource/tdx_collector.py`, `tests/unit/test_tdx_collector.py`, `tests/integration/test_tdx_ws.py` | Added red test proving callback dirty-symbol updates are scheduled onto the loop side. Updated integration test to wait for loop-side scheduling before collector assertions. |
| CODE_SMELL D2.6 | `src/adapter/tdx/client.py`, `tests/unit/test_tdx_adapter.py` | Added red test proving `TDXAdapter.subscribe_quote` must raise `ProviderCapabilityUnsupported` with stable code/details. Fixed the dead direct-subscribe path to point callers to `subscribe_hq` plus `TdxSubscriptionClient`. |
| CODE_SMELL F2.1 / F2.2 | `src/datasource/tdx_provider.py`, `tests/unit/test_tdx_provider.py` | Added red test proving `get_price_volume` fails when the requested symbol is absent. Replaced broad `values` fallback with `TDX_SYMBOL_NOT_FOUND`. |
| CODE_SMELL U2.3 | `evidence.md` | No broad WS contract migration in this runtime-safety child. Existing `tests/unit/test_tdx_contracts.py` covers `TdxWsMessage` model usage, and remaining hand-built WS dictionaries stay documented for `align-datasource-ws-contract`. |

## Red Test Evidence

- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_qmt_runtime_safety.py` failed before implementation because the event loop tick waited about 0.2s and the callback thread never delivered a quote.
- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_tdx_adapter_runtime_safety.py` failed before implementation because the event loop tick waited about 0.2s.
- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_tdx_collector.py::test_callback_dirty_symbol_is_scheduled_on_event_loop ...` failed before implementation because `dirty_symbols` changed synchronously in the callback.
- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_tdx_adapter.py::TestSubscriptionMethods::test_direct_quote_subscription_raises_capability_error` failed before implementation with raw `NotImplementedError`.
- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_tdx_provider.py::test_get_price_volume_raises_when_requested_symbol_is_missing` failed before implementation because no exception was raised.

## Green Verification

- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_tdx_adapter_runtime_safety.py tests/unit/test_qmt_runtime_safety.py` -> 3 passed.
- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_tdx_collector.py::test_callback_dirty_symbol_is_scheduled_on_event_loop tests/unit/test_tdx_collector.py::test_subscription_callback_marks_dirty_without_collecting_bars tests/unit/test_tdx_collector.py::test_subscription_callback_accepts_official_json_string_payload tests/unit/test_tdx_provider.py::test_get_price_volume_raises_when_requested_symbol_is_missing tests/unit/test_tdx_adapter.py::TestSubscriptionMethods::test_direct_quote_subscription_raises_capability_error` -> 5 passed.
- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/integration/test_tdx_ws.py::test_ws_callback_marks_dirty_and_collector_emits_snapshot_quote` -> 1 passed, 1 existing Starlette deprecation warning.
- `env UV_CACHE_DIR=.uv-cache uv run ruff check .` -> all checks passed.
- `env UV_CACHE_DIR=.uv-cache uv run pytest -m "not live"` -> 341 passed, 6 deselected, 1 existing Starlette deprecation warning.
