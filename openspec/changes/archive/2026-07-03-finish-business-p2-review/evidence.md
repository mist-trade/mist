# Evidence: finish-business-p2-review

## Red Tests

- `UV_CACHE_DIR=/Users/moyui/sean/mist/mist-datasource/.uv-cache uv run pytest tests/unit/test_repository_hygiene.py -k shared_adapter_error_wrappers -q`
  first failed with 65 offending TDX legacy and QMT REST route files/handlers.
- `UV_CACHE_DIR=/Users/moyui/sean/mist/mist-datasource/.uv-cache uv run pytest tests/unit/test_repository_hygiene.py -k qmt_routes_do_not_import_qmt_main -q`
  first failed on `qmt/routes/ws.py`.
- `UV_CACHE_DIR=/Users/moyui/sean/mist/mist-datasource/.uv-cache uv run pytest tests/unit/test_repository_hygiene.py -k adapter_sdk_error_wrapping_is_centralized -q`
  first failed with 65 offending TDX/QMT adapter methods.

## Final Verification

- `UV_CACHE_DIR=/Users/moyui/sean/mist/mist-datasource/.uv-cache uv run pytest tests/unit/test_repository_hygiene.py -k "qmt_routes_do_not_import_qmt_main or shared_adapter_error_wrappers" -q`
  -> `2 passed, 12 deselected`.
- `UV_CACHE_DIR=/Users/moyui/sean/mist/mist-datasource/.uv-cache uv run pytest tests/integration/test_qmt_ws.py -q`
  -> `3 passed, 1 warning`.
- `UV_CACHE_DIR=/Users/moyui/sean/mist/mist-datasource/.uv-cache uv run pytest tests/unit/test_repository_hygiene.py -k adapter_sdk_error_wrapping_is_centralized -q`
  -> `1 passed, 14 deselected`.
- `UV_CACHE_DIR=/Users/moyui/sean/mist/mist-datasource/.uv-cache uv run ruff check .`
  -> `All checks passed!`.
- `UV_CACHE_DIR=/Users/moyui/sean/mist/mist-datasource/.uv-cache uv run pyright`
  -> `0 errors, 0 warnings, 0 informations`.
- `UV_CACHE_DIR=/Users/moyui/sean/mist/mist-datasource/.uv-cache uv run pytest -m "not live" -q`
  -> `409 passed, 6 deselected, 1 warning`.
- `GOCACHE=/private/tmp/mist-monitoring-gocache sh scripts/verify.sh` in
  `mist-monitoring` -> Python contract/package tests, runtime metric validation,
  OpenSpec specs, `go vet`, and `go test ./...` passed.
- `CI=true pnpm lint` in `mist-fe` -> passed.
- `CI=true pnpm run typecheck` in `mist-fe` -> passed.
- `CI=true pnpm run test:ci` in `mist-fe` -> `12 passed` suites and
  `77 passed` tests.
- `openspec validate finish-business-p2-review --strict` -> valid.

## Review Scope Mapping

| Scope | Files | Evidence |
| --- | --- | --- |
| monitoring P2 verification | `mist-monitoring/.github/workflows/ci.yml` | `scripts/verify.sh`; package-structure test now enforces non-mutating `gofmt -l .` CI gate |
| frontend P2 verification | no code changes | `pnpm lint`, `pnpm run typecheck`, `pnpm run test:ci` under `CI=true` |
| datasource REST route exception dedupe | `tdx/routes/dependencies.py`, `tdx/routes/legacy/*`, `qmt/routes/dependencies.py`, `qmt/routes/{etf,financial,market,sector,stock}.py` | repository hygiene test forbids per-route bare `Exception` wrappers |
| datasource QMT WS app-state dependency | `qmt/routes/dependencies.py`, `qmt/routes/ws.py`, `tests/integration/test_qmt_ws.py` | repository hygiene test forbids `qmt.main` route imports; QMT WS contract tests pass |
| datasource adapter SDK exception dedupe | `src/adapter/tdx/client.py`, `src/adapter/qmt/client.py`, `tests/unit/test_repository_hygiene.py` | repository hygiene test forbids broad per-method SDK `Exception` wrappers |
