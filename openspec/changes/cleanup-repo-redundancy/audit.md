## Audit Summary

### Workspace root

- `mist`, `mist-fe`, `mist-datasource`, `mist-skills`, `mist-deploy`: kept as child git repositories.
- `.worktrees/mist-deploy-tdx-guard`: kept because `git worktree list` reports it as an active `mist-deploy` linked worktree.
- `.DS_Store`, `.pnpm-store`, `old-service-wrapper/`, `worktrees/`, `.worktrees/old-service-wrapper`: removed as local artifacts. `old-service-wrapper/` and `worktrees/.../old-service-wrapper` contained the test stub text `test old-service-wrapper`, not a real deployable legacy service wrapper artifact.

### `mist`

- Kept source, tests, fixtures, OpenSpec changes, deploy scripts, lockfiles, env examples, and active local assistant config.
- Removed `docs/superpowers/` because it was historical agent planning/spec output, had no references outside itself, and current planning is now represented by OpenSpec.
- Renamed `libs/config/src/agnets.config.ts` to `libs/config/src/agents.config.ts` and `AngentsConfig` to `AgentsConfig`; updated imports in `libs/config/src/index.ts`, `apps/saya/src/agents/agents.service.ts`, and `apps/saya/src/role/role.service.ts`.
- Removed ignored local build/test output: `dist/`, `test-results/`, `.DS_Store`, and empty `.worktrees/`.
- Kept `node_modules/` because it is ignored and not a GitHub commit candidate, but is useful for local verification.

### `mist-fe`

- Kept app source, chart components, tests, synced backend fixtures/results, lockfiles, and config.
- Replaced the default Next.js root page with a redirect to `/k`; the previous page was boilerplate and not part of the current charting workflow.
- Removed default `public/*.svg` assets because they were only referenced by the removed boilerplate root page.
- Kept `node_modules/` after lockfile install for verification; it is ignored and not a GitHub commit candidate.

### `mist-datasource`

- Kept TDX/QMT source trees, adapter abstractions, route modules, tests, SDK reference docs, Windows deployment scripts, lockfile, and env examples.
- Removed `.trae/` and `docs/superpowers/` because they were obsolete tool-process docs with no current references outside themselves.
- Removed `aktools/` placeholder instance and `AKTOOLS_*` datasource settings because current project positioning is TDX/QMT bridge; AKTools was documented as not part of the Windows appliance path and its wrapper only logged future instructions.
- Updated `scripts/test_windows_scripts.ps1` so its legacy service wrapper test stub is created under `.test-windows-scripts/` instead of the workspace parent directory.
- Removed the old service-wrapper deployment path: the datasource service helper, the long-running service entrypoint, the service registration branch in `scripts/deploy_windows.ps1`, and the old executable resolver in `scripts/windows-common.ps1`.
- Removed ignored local caches: `.pytest_cache/`, `.ruff_cache/`, Python `__pycache__/`, and `.DS_Store`.
- Kept `.venv/` because it is ignored and not a GitHub commit candidate, but is needed for current local verification.

### `mist-skills`

- Kept all tracked skill code and tests. No tracked cleanup was proven safe.
- Removed Python `__pycache__/` if present.

### `mist-deploy`

- Kept tracked deployment workflow and scripts. No tracked cleanup was proven safe.
- Kept `.worktrees/mist-deploy-tdx-guard` as an active linked worktree, outside the main repo status.
- Updated active deployment docs/tests to refer only to the current WinSW path and generic legacy service cleanup; removed old wrapper wording from the main `mist-deploy` checkout and the active `mist-deploy-tdx-guard` linked worktree.

### Legacy service-wrapper removal

- Removed package workflow installation and packaging of the old wrapper executable from `mist/.github/workflows/windows-appliance.yml`.
- Deleted `mist/deploy/windows/backend/install-service.ps1` and `mist/deploy/windows/backend/uninstall-service.ps1` because they only implemented the old wrapper path.
- Updated `mist/deploy/windows/install-all.ps1` so it no longer installs backend or datasource services through that path; it now prepares runtime dependencies and tells operators to start processes before running `health-check.ps1`.
- Updated `mist/deploy/windows/uninstall-all.ps1` to clean legacy service names through `sc.exe` instead of a third-party wrapper.
- Rewrote active OpenSpec references from the removed wrapper name to generic legacy-service wording so future implementation work does not reintroduce it by following stale specs.
- Verified the removed wrapper name, executable path, resolver/helper names, and deleted helper filenames return no matches outside ignored dependency/build directories.

### Verification

- `mist`: `openspec validate cleanup-repo-redundancy` passed.
- `mist`, `mist-fe`, `mist-datasource`: `git diff --check` passed.
- `mist`: targeted Jest for `apps/saya/src/agents/agents.service.spec.ts` and `apps/saya/src/role/role.service.spec.ts` passed.
- `mist`: `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File deploy/windows/test-database-bootstrap.ps1` passed after updating expectations for the removed service-wrapper path.
- `mist`: `tsc --noEmit` still fails on the pre-existing missing `body-parser` declaration in `apps/chan/src/main.ts`; no config tests exist under `libs/config`.
- `mist-fe`: lockfile install completed after rerunning with `CI=true pnpm install --frozen-lockfile --ignore-scripts`; the first install returned `ERR_PNPM_IGNORED_BUILDS` for `sharp` and `unrs-resolver`.
- `mist-fe`: `pnpm exec eslint app/page.tsx` passed, and `pnpm exec jest --runInBand --no-watchman` passed.
- `mist-fe`: full `tsc --noEmit` still fails on pre-existing channel test mocks missing `displayStartId` and `displayEndId`; full `pnpm lint` still fails on generated `test-data/results/types/*` `any` types.
- `mist-datasource`: `.venv/bin/python -m pytest -m "not live"` passed with `98 passed, 6 deselected, 1 warning`.
- `mist-datasource`: targeted `ruff check src/core/config.py tests/unit/test_config.py` passed.
- `mist-datasource`: `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_scripts.ps1` passed.
- `mist-datasource`: full `ruff check .` still reports existing lint debt outside the changed Python files.
- `mist-deploy`: `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-appliance.ps1` passed in the main checkout and in `.worktrees/mist-deploy-tdx-guard`.

### Kept despite looking removable

- `mist/test-data` and `mist-fe/test-data`: kept because tests, sync scripts, and `/k` page use them.
- `mist-datasource/qmt/routes/*` and `tdx/routes/*`: kept because `main.py` includes them and integration tests exercise them.
- `mist` AKTools-related backend config: kept because EastMoney source/deep integration tests still reference AKTools behavior in the backend repo.
- Active OpenSpec changes: kept because archiving/deleting them is a product decision, not automatic cleanup.
