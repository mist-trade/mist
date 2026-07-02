# Evidence: continue-review-p2-skills-hygiene

## Red Tests

- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_contracts.py tests/test_repository_hygiene.py tests/test_kline_runner.py -q`
  - Failed before implementation because `shared.api_contracts` did not exist,
    `skills/` and `tests/` still contained 15 `sys.path.insert` occurrences,
    `pyproject.toml`/CI lacked quality gates, and K-line retry still collected
    based on missing-security message text.

## Review Item Evidence

| Review ID | Changed files | Test / verification command |
|---|---|---|
| CODE_REVIEW L9 | `mist-skills/shared/kline_runner.py`, `mist-skills/tests/test_kline_runner.py` | Red: targeted pytest showed `MistApiError("Security with code ...", 500)` still triggered collection (`client.post.call_count == 2`). Green: `env UV_CACHE_DIR=.uv-cache uv run pytest tests/test_kline_runner.py -q` covered retryable codes and non-retryable message text. |
| CODE_REVIEW L11 | `mist-skills/skills/**/scripts/*.py`, `mist-skills/tests/script_loader.py`, `mist-skills/tests/test_*`, `mist-skills/README.md`, `mist-skills/RUNBOOK.md` | Red: repository hygiene test failed with 15 `sys.path.insert` offenders. Green: `env UV_CACHE_DIR=.uv-cache uv run pytest tests/test_repository_hygiene.py::test_python_files_do_not_mutate_sys_path tests/test_data_query.py tests/test_technical_indicators.py tests/test_chan_theory.py -q` passed; `env PYTHONPATH=. UV_CACHE_DIR=.uv-cache uv run python skills/data-query/scripts/get_daily_kline.py --help`, `.../macd.py --help`, and `.../merge_k.py --help` all exited 0. |
| INFRA_REVIEW T12 | `mist-skills/tests/script_loader.py`, `mist-skills/tests/test_data_query.py`, `mist-skills/tests/test_technical_indicators.py`, `mist-skills/tests/test_chan_theory.py`, `mist-skills/tests/test_repository_hygiene.py` | Same no-`sys.path.insert` repository hygiene test plus script-loader based skill tests prove tests no longer hardcode script directories onto `sys.path`. |
| CODE_SMELL_REVIEW P4.3 | `mist-skills/skills/**/scripts/*.py`, `mist-skills/tests/test_repository_hygiene.py` | Same no-`sys.path.insert` repository hygiene test proves every skill script header no longer carries the path-injection sample. |
| CODE_SMELL_REVIEW M4.1 | `mist-skills/shared/api_contracts.py`, `mist-skills/shared/script_runner.py`, `mist-skills/shared/kline_runner.py`, skill scripts, `mist-skills/tests/test_api_contracts.py`, script/runner tests | Red: `shared.api_contracts` import failed before implementation. Green: `env UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_contracts.py tests/test_script_runner.py tests/test_kline_runner.py tests/test_data_query.py tests/test_technical_indicators.py tests/test_chan_theory.py -q` proves centralized endpoint/path/field constants still emit current backend-compatible requests. |
| INFRA_REVIEW T7 | `mist-skills/pyproject.toml`, `mist-skills/uv.lock`, `mist-skills/.github/workflows/ci.yml`, `mist-skills/tests/test_repository_hygiene.py` | Red: repository hygiene test failed on missing `ruff`/`pyright`/`black` config and CI steps. Green: `env UV_CACHE_DIR=.uv-cache uv run ruff check .`, `env UV_CACHE_DIR=.uv-cache uv run pyright`, `env UV_CACHE_DIR=.uv-cache uv run black --check .`, `env UV_CACHE_DIR=.uv-cache uv run pytest`, and `env UV_CACHE_DIR=.uv-cache uv lock --check` passed. |
| CODE_REVIEW H10 | No new files in this batch | Already covered by archived change `openspec/changes/archive/2026-07-02-fix-mcp-skills-contracts/evidence.md`, which maps CODE_SMELL P4.1/P4.2 to shared `script_runner`/`kline_runner` tests. This batch does not duplicate H10 implementation work. |

## Green Verification

- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_contracts.py tests/test_repository_hygiene.py::test_python_files_do_not_mutate_sys_path tests/test_kline_runner.py tests/test_data_query.py tests/test_technical_indicators.py tests/test_chan_theory.py -q`
  - 42 tests passed.
- `env UV_CACHE_DIR=.uv-cache uv run pytest tests/test_repository_hygiene.py -q`
  - 3 tests passed.
- `env UV_CACHE_DIR=.uv-cache uv run ruff check .`
  - Passed.
- `env UV_CACHE_DIR=.uv-cache uv run pyright`
  - 0 errors, 0 warnings, 0 informations.
- `env UV_CACHE_DIR=.uv-cache uv run black --check .`
  - 32 files would be left unchanged.
- `env UV_CACHE_DIR=.uv-cache uv run pytest`
  - 70 tests passed.
- `env UV_CACHE_DIR=.uv-cache uv lock --check`
  - Resolved 26 packages.
- `env PYTHONPATH=. UV_CACHE_DIR=.uv-cache uv run python skills/data-query/scripts/get_daily_kline.py --help`
  - Exited 0.
- `env PYTHONPATH=. UV_CACHE_DIR=.uv-cache uv run python skills/technical-indicators/scripts/macd.py --help`
  - Exited 0.
- `env PYTHONPATH=. UV_CACHE_DIR=.uv-cache uv run python skills/chan-theory/scripts/merge_k.py --help`
  - Exited 0.

## Residual Risk

No local residual risk for the selected P2 skills hygiene items. Production
AstrBot smoke still needs the user's live container/backend environment; this
change documents the required `PYTHONPATH=/AstrBot/data` runtime contract for
that smoke.
