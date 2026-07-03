# Evidence: continue-review-p2-deploy-runtime-config-and-live-regression

## Red Tests

- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-compose-config.ps1`
  first failed because `web-gateway` still defaulted to
  `docker.m.daocloud.io/library/nginx:1.27-alpine` without a digest.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-docker-appliance.ps1`
  first failed because `deploy-docker-appliance.ps1` did not default
  `WebGatewayImage` to a digest-pinned reference.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-workflow-config.ps1`
  first failed because the deploy workflow had no `public_host_name` input/env
  handoff.
- `UV_CACHE_DIR=.uv-cache uv run --no-sync pytest tests/unit/test_tdx_live_replay.py -q`
  first failed because `tests/fixtures/tdx/live_market_snapshot_600519.json`
  did not exist.

## Final Verification

- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-compose-config.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-docker-appliance.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-workflow-config.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-appliance-diagnostics.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-health-check-docker-appliance.ps1`
  -> passed.
- `docker compose --env-file docker/.env.example -f docker/compose.yaml config --quiet`
  in `mist-deploy` -> passed.
- `UV_CACHE_DIR=.uv-cache uv run --no-sync pytest tests/unit/test_tdx_live_replay.py tests/unit/test_repository_hygiene.py -k "live_replay or live_test_collection" -q`
  -> 2 passed, 14 deselected.
- `UV_CACHE_DIR=.uv-cache uv run --no-sync pytest -m live --collect-only -q`
  -> 6 live tests collected, 410 deselected, 1 existing Starlette warning.
- `UV_CACHE_DIR=.uv-cache uv run --no-sync pytest tests/unit/test_tdx_live_replay.py tests/unit/test_tdx_provider.py -q`
  -> 57 passed.
- `UV_CACHE_DIR=.uv-cache uv run --no-sync pytest -m "not live" -q`
  -> 410 passed, 6 deselected, 1 existing Starlette warning.
- `UV_CACHE_DIR=.uv-cache uv run --no-sync ruff check .`
  -> all checks passed.
- `UV_CACHE_DIR=.uv-cache uv run --no-sync pyright`
  -> 0 errors, 0 warnings, 0 informations.
- `openspec validate continue-review-p2-deploy-runtime-config-and-live-regression --strict`
  -> valid.
- `git diff --check` in `mist`, `mist-deploy`, and `mist-datasource`
  -> no whitespace errors.

## Review Scope Mapping

| Review ID | Files | Evidence |
| --- | --- | --- |
| `INFRA_REVIEW M6.1` | `mist-deploy/.github/workflows/deploy-windows-docker-appliance.yml`, `mist-deploy/docker/.env.example`, `mist-deploy/docker/compose.yaml`, `mist-deploy/docker/nginx/templates/default.conf.template`, `mist-deploy/scripts/deploy-docker-appliance.ps1`, `mist-deploy/README.md` | Workflow env handoff and deploy script now carry `PUBLIC_HOST_NAME`; compose renders it through nginx's template path; env/template tests prove overrideable runtime defaults. |
| `INFRA_REVIEW S6` | `mist-deploy/scripts/test-deploy-docker-appliance.ps1`, `mist-deploy/scripts/test-docker-compose-config.ps1`, `mist-deploy/scripts/test-workflow-config.ps1`, `mist-deploy/scripts/test-docker-appliance-diagnostics.ps1` | Added temp env parsing and rendered config behavior checks in addition to existing source guards; diagnostics test follows the applied nginx template path. |
| `CODE_REVIEW L14` | `mist-deploy/docker/.env.example`, `mist-deploy/docker/compose.yaml`, `mist-deploy/scripts/deploy-docker-appliance.ps1`, `mist-deploy/.github/workflows/deploy-windows-docker-appliance.yml`, `mist-deploy/README.md` | Default gateway image is pinned to `docker.m.daocloud.io/library/nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10`; override path remains documented and tested. |
| `INFRA_REVIEW T9` | `mist-datasource/tests/unit/test_tdx_live_replay.py`, `mist-datasource/tests/fixtures/tdx/live_market_snapshot_600519.json`, `mist-datasource/tests/unit/test_repository_hygiene.py`, `mist-datasource/.github/workflows/ci.yml` | Added CI-safe live-shaped snapshot replay through `TdxDatasourceProvider`; kept `pytest -m live --collect-only` reporting intact without executing live TDX SDK calls. |
