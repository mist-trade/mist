# Evidence: continue-review-p1-cleanup

| Review ID | Changed files | Test / verification command |
|---|---|---|
| CODE_REVIEW L5 | `mist-datasource/pyproject.toml`, `mist-datasource/uv.lock`, `mist-datasource/tests/unit/test_dependency_metadata.py` | Red: `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_dependency_metadata.py` failed while dev tools were runtime deps. Green: `env UV_CACHE_DIR=.uv-cache uv run --no-sync pytest tests/unit/test_dependency_metadata.py` -> 2 passed; `env UV_CACHE_DIR=.uv-cache uv lock --check` -> resolved. |
| INFRA_REVIEW D10 | `mist-datasource/pyproject.toml`, `mist-datasource/uv.lock`, `mist-datasource/tests/unit/test_dependency_metadata.py` | Same datasource metadata test and lock check as CODE_REVIEW L5 prove runtime/dev dependency split. |
| INFRA_REVIEW D11 | `mist-skills/uv.lock` | Red: `env UV_CACHE_DIR=.uv-cache uv lock --check` failed because `uv.lock` was missing. Green: `env UV_CACHE_DIR=.uv-cache uv lock --check` -> resolved; `env UV_CACHE_DIR=.uv-cache uv run pytest` -> 64 passed. |
| INFRA_REVIEW S9 | `mist/package.json`, `mist/tools/test-ci-contracts.mjs` | Red: `node tools/test-ci-contracts.mjs` failed on missing `./apps/mist/test/jest-e2e.json`. Green: `node tools/test-ci-contracts.mjs` -> passed. |
| INFRA_REVIEW 共性2 | `mist-datasource/uv.lock`, `mist-skills/uv.lock` | `env UV_CACHE_DIR=.uv-cache uv lock --check` passed in both Python repositories touched by this change. |
| CODE_SMELL_REVIEW M1.5 | `mist/apps/mist/src/sources/east-money/east-money-source.service.ts`, `mist/apps/mist/src/sources/east-money/east-money-source.service.spec.ts` | Red: focused Jest failed because configured `AKTOOLS_BASE_URL` was ignored. Green: `pnpm jest apps/mist/src/sources/east-money/east-money-source.service.spec.ts apps/mist/src/chan/services/bi.service.spec.ts --runInBand --watchman=false` -> 16 passed; `pnpm run typecheck` -> passed. |
| CODE_SMELL_REVIEW O1.1 | `mist/apps/mist/src/chan/services/bi.service.ts`, `mist/apps/mist/src/chan/services/bi.service.spec.ts` | Red: focused Jest showed `splice(index)` dropped the tail. Green: `pnpm jest apps/mist/src/sources/east-money/east-money-source.service.spec.ts apps/mist/src/chan/services/bi.service.spec.ts --runInBand --watchman=false` -> 16 passed. |

## Residual Risk

No local residual risk. Datasource metadata verification uses `uv run --no-sync`
after `uv lock --check` because the test only parses `pyproject.toml`; a full
sync attempted to download the build backend in this sandbox and is not needed
to prove the reviewed dependency-grouping risk.
