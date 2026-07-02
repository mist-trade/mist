# Evidence: harden-release-ci

## Red Checks Observed

- `node tools/test-ci-contracts.mjs` failed before implementation with
  `mist package.json engines.node must be >=24.0.0`.
- `pnpm run test:ci` initially failed on local Watchman permissions; the CI test
  command was changed to `jest --runInBand --watchman=false`.
- `pnpm run typecheck` in `mist-fe` exposed missing jest-dom matcher types.
- `pnpm run test:ci` in `mist-fe` exposed the old Node 22 workflow expectation.
- `env UV_CACHE_DIR=.uv-cache uv run ruff check .` in `mist-datasource` exposed
  two Ruff B009 findings in `tests/unit/test_tdx_provider.py`.

## Completion Evidence

| Review ID | Changed files | Test or verification command/result |
|---|---|---|
| C1 | `mist/.gitignore`; git index removal of `mist/.env.development` and `mist/.env.production`; `mist/tools/test-ci-contracts.mjs` | `git ls-files .env.development .env.production` returned no tracked files; `node tools/test-ci-contracts.mjs` passed. |
| I1 | `mist/package.json`; `mist/.github/workflows/build.yml`; `mist/.github/workflows/docker.yml`; `mist/.github/workflows/release.yml`; `mist/tools/test-ci-contracts.mjs` | `pnpm run lint:check` passed; `pnpm run typecheck` passed; `pnpm run test:ci` passed with 52 suites and 442 tests; `node tools/test-ci-contracts.mjs` passed. |
| I2 | `mist-fe/.github/workflows/docker.yml`; `mist-fe/package.json`; `mist-fe/tsconfig.json`; `mist-fe/Dockerfile`; `mist-fe/__tests__/docker-config.test.ts`; `mist-fe/.nvmrc` | `pnpm lint` passed; `pnpm run typecheck` passed; `pnpm run test:ci` passed with 6 suites and 52 tests; `node tools/test-ci-contracts.mjs` passed. |
| I3 | `mist-datasource/.github/workflows/ci.yml`; `mist-monitoring/.github/workflows/ci.yml`; `mist-skills/.github/workflows/ci.yml`; `mist/tools/test-ci-contracts.mjs`; `mist-datasource/tests/unit/test_tdx_provider.py` | `env UV_CACHE_DIR=.uv-cache uv run ruff check .` passed; `env UV_CACHE_DIR=.uv-cache uv run pytest -m "not live"` passed with 335 selected tests; `env UV_CACHE_DIR=.uv-cache uv run pytest tests/unit/test_tdx_provider.py -m "not live"` passed with 52 tests; `gofmt -l .` returned no files; `go vet ./...` passed; `go test ./...` passed; `/private/tmp/mist-monitoring-pytest-venv-20260702/bin/python -m pytest tests` passed with 9 tests; `.venv/bin/python -m pytest` in `mist-skills` passed with 49 tests. |
| I5 | `mist/.github/workflows/release.yml`; `mist/tools/test-ci-contracts.mjs`; `mist/tools/test-release-workflow.sh` | `node tools/test-ci-contracts.mjs` passed and checked `needs: validate` plus `environment: production-release`; `bash tools/test-release-workflow.sh` passed. |
| I8 | `mist/package.json`; `mist/tools/test-ci-contracts.mjs` | `node tools/test-ci-contracts.mjs` passed and checked `lint:check` has no `--fix`; `pnpm run lint:check` passed. |
| D9 | `mist/package.json`; `mist/.github/workflows/*.yml`; `mist-fe/.nvmrc`; `mist-fe/package.json`; `mist-fe/Dockerfile`; `mist-fe/.github/workflows/docker.yml`; `mist-fe/__tests__/docker-config.test.ts` | `node tools/test-ci-contracts.mjs` passed; `pnpm run test:ci` in `mist-fe` passed and includes the updated Docker config test. |
| 共性1 | All files listed above | The combined validation commands above prove the first-wave repositories now have explicit CI gates or contract checks instead of publish-only workflows. |

## Notes

- Monitoring Python contract tests required a temporary venv because the local
  system Python did not have pytest. The first `pip install pytest` attempt was
  blocked by the network sandbox; the approved retry installed pytest into
  `/private/tmp/mist-monitoring-pytest-venv-20260702`.
- Backend `.env.development` and `.env.production` remain available locally but
  are intentionally removed from git tracking.
