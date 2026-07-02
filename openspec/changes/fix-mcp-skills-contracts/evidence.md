# Evidence: fix-mcp-skills-contracts

## Red Tests

- `pnpm exec jest apps/mcp-server/src/base/base-mcp-tool.service.spec.ts apps/mcp-server/src/mcp-server.module.spec.ts apps/mcp-server/src/services/data-mcp.service.spec.ts --runInBand --watchman=false`
  - Failed before implementation on non-`Error` throws, registered `SegmentMcpService`, and `sanitizeString(...)!` leaking a `null` symbol into repository lookup.
- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/test_mist_client.py tests/test_script_runner.py tests/test_kline_runner.py tests/test_technical_indicators.py tests/test_chan_theory.py`
  - Failed before implementation because `shared.script_runner` and `shared.kline_runner` did not exist.

## Review Item Evidence

| Review ID | Changed files | Unit/substitute verification |
| --- | --- | --- |
| CODE_REVIEW C6 | `apps/mcp-server/src/base/base-mcp-tool.service.ts`, `apps/mcp-server/src/base/base-mcp-tool.service.spec.ts` | Targeted MCP Jest proves string/object/null/undefined throws return stable failed responses and `McpError` code/recovery survives. |
| CODE_REVIEW C8 | `mist-skills/shared/mist_client.py`, `mist-skills/tests/test_mist_client.py` | `test_success_without_data_raises_api_error` proves `success: true` without `data` raises `MistApiError`, not `KeyError`. |
| CODE_REVIEW C9 | `apps/mcp-server/src/mcp-server.module.ts`, deleted `apps/mcp-server/src/services/segment-mcp.service.ts`, `apps/mcp-server/src/mcp-server.module.spec.ts` | Module metadata test proves Segment placeholder tools are not registered as ordinary MCP providers. |
| CODE_SMELL D1.5 | Deleted `apps/mcp-server/src/services/segment-mcp.service.ts`, `apps/mcp-server/src/mcp-server.module.ts` | Same module metadata test covers placeholder MCP tool exposure. |
| CODE_SMELL T1.4 | `apps/mcp-server/src/base/base-mcp-tool.service.ts`, `libs/constants/src/mcp-errors.ts`, `apps/mcp-server/src/base/base-mcp-tool.service.spec.ts` | Typecheck and lint prove metadata/next-tool params no longer rely on `Record<string, any>` in the base MCP contract. |
| CODE_SMELL T1.6 | `apps/mcp-server/src/services/data-mcp.service.ts`, `apps/mcp-server/src/services/data-mcp.service.spec.ts` | Data MCP unit test proves a sanitized-away symbol returns `INVALID_SYMBOL` before repository lookup. |
| CODE_SMELL P4.1 | `mist-skills/shared/script_runner.py`, indicator/Chan scripts, `mist-skills/tests/test_script_runner.py`, `mist-skills/tests/test_technical_indicators.py`, `mist-skills/tests/test_chan_theory.py` | Shared simple POST runner tests prove normalized body building, expected endpoints, and script delegation. |
| CODE_SMELL P4.2 | `mist-skills/shared/kline_runner.py`, `get_kline_data.py`, `get_daily_kline.py`, `mist-skills/tests/test_kline_runner.py`, `mist-skills/tests/test_data_query.py` | Shared K-line runner tests prove intraday and daily collect/retry bodies remain period-specific. |
| CODE_SMELL D4.2 | `mist-skills/shared/script_runner.py`, `mist-skills/shared/kline_runner.py`, refactored scripts | Full `mist-skills` pytest covers duplicated request and collect/retry behavior through shared helpers. |
| CODE_SMELL U4.1 | `mist-skills/shared/script_runner.py`, CLI entrypoints in skill scripts, `mist-skills/tests/test_script_runner.py` | `run_cli` unit tests prove `MistConnectionError` and `MistApiError` are printed consistently and exit with status 1. |

## Green Verification

- `pnpm exec jest apps/mcp-server/src/base/base-mcp-tool.service.spec.ts apps/mcp-server/src/mcp-server.module.spec.ts apps/mcp-server/src/services/data-mcp.service.spec.ts --runInBand --watchman=false`
  - 3 suites passed, 25 tests passed.
- `pnpm run lint:check`
  - Passed.
- `pnpm run typecheck`
  - Passed.
- `pnpm run test:ci`
  - 56 suites passed, 463 tests passed.
- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/test_mist_client.py tests/test_script_runner.py tests/test_kline_runner.py tests/test_technical_indicators.py tests/test_chan_theory.py`
  - 41 tests passed.
- `env UV_CACHE_DIR=.uv-cache uv run pytest`
  - 64 tests passed.
