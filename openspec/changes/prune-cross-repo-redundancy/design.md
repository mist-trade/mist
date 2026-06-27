## Context

The workspace root at `/Users/moyui/sean/mist` is not a Git repository. It contains five child repositories:

- `mist`: NestJS backend, OpenSpec state, Windows appliance build scripts, and backend test data.
- `mist-fe`: Next.js frontend, charting UI, synced backend result fixtures, and local mock K-line fixtures.
- `mist-datasource`: FastAPI TDX/QMT datasource bridge with legacy provider routes and normalized `/v1` routes.
- `mist-skills`: standalone skill scripts that call the Mist backend HTTP API.
- `mist-deploy`: private deployment runner for the public Windows appliance artifact, with an active linked worktree under `.worktrees/mist-deploy-tdx-guard`.

Current `master` differs from the earlier `cleanup-repo-redundancy` audit. In particular, `mist/docs/superpowers/` exists again, `mist/deploy/windows/backend/install-service.ps1` is a current WinSW script rather than the old wrapper path, and the backend TDX source client has already moved product bars and snapshots to datasource `/v1` endpoints.

Current dirty state that must be preserved or intentionally adopted:

- `mist-fe`: `app/page.tsx` has been changed from the default Next.js template to `redirect("/k")`, and default `public/*.svg` assets are deleted.
- `mist`: `openspec/changes/connect-backend-to-datasource/` is untracked, while current backend code already implements part of that plan.
- Other child repositories are clean after the latest pull.

## Goals / Non-Goals

**Goals:**

- Identify redundant files and code using current references, imports, scripts, tests, and cross-repository contracts.
- Separate safe local cleanup from tracked removals that require tests.
- Keep the plan focused on redundancy, stale planning artifacts, and contract drift between repositories.
- Produce tasks that can be executed in small diffs with clear rollback.

**Non-Goals:**

- Do not delete datasource legacy `/api/tdx/*` or QMT routes while they remain mounted and tested.
- Do not collapse `mist-deploy` into `mist`; `mist-deploy` owns runner-side deployment while `mist` owns the packaged appliance scripts.
- Do not remove active linked worktrees.
- Do not replace the frontend/backend test-data sync contract in this cleanup.
- Do not remove `mist-skills` endpoint scripts while they still match backend controllers.

## Decisions

### Decision 1: Treat redundancy candidates by risk class

Use four classes:

1. **Local-only cleanup**: ignored caches, build output, generated metadata, and root-level empty scaffolds not owned by a repository.
2. **Tracked safe removal**: tracked files with no imports or script references and no current contract role.
3. **Tracked migration candidate**: files that look redundant but require a replacement or compatibility window first.
4. **Keep with rationale**: files that look duplicated but are part of a current contract.

Alternative considered: remove everything that appears unreferenced in one repository. This is rejected because several workspace contracts are cross-repository and will not show as local imports.

### Decision 2: Keep boundary contracts before trimming local convenience

The active contracts are:

- Backend -> frontend: backend test results are synced into `mist-fe/test-data/results`, and `/k` imports `@/test-data/results/types`.
- Backend -> datasource: backend now consumes datasource `/v1` bars and snapshots, while legacy dividend factors remain on `/api/tdx/divid-factors`.
- Datasource legacy route surface: `/api/tdx/*` and `/api/qmt/*` remain mounted and tested for provider/debug compatibility.
- Build -> deploy: `mist/.github/workflows/windows-appliance.yml` assembles artifact scripts from `mist/deploy/windows`; `mist-deploy` downloads and installs that artifact.
- Skills -> backend: `mist-skills` calls current backend `security`, `indicator`, and `chan` endpoints.

Alternative considered: centralize all duplicated scripts and fixtures immediately. This would mix cleanup with architecture migration and increase risk.

### Decision 3: Tracked removals applied in this cleanup slice

The high-confidence tracked removals applied in this cleanup slice are:

- `mist/apps/mist/src/sources/tdx/tdx-source.service.ts`: removed unused private legacy methods `parseMarketDataResponse` and `parseSnapshot`; current `fetchK` and `fetchSnapshot` parse normalized `/v1` envelopes directly.
- `mist/docs/superpowers/plans/2026-06-26-refactor-tdx-python-datasource.md`: removed because current planning lives in OpenSpec and the file had no references outside itself and cleanup notes.
- `mist-fe/app/page.tsx` plus default `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, and `public/window.svg`: adopted the existing redirect-to-`/k` cleanup after reference verification.
- `mist-fe/test-data/fixtures/k-line/csi-300-2023-real.ts` and `csi-300-2025-full-year.ts`: removed because they were only re-exported from `test-data/index.ts` and documented in README, with no app or test usage.

### Decision 4: Current tracked migration candidates

- `mist/openspec/changes/connect-backend-to-datasource/`: do not delete blindly. Compare tasks against current code; either refresh it to only remaining deploy/verification work, or remove it if it is fully superseded by committed code and this plan.
- `mist/apps/mist/src/sources/tdx/fetchDividFactors`: keep for now because datasource dividend-factor behavior still has a legacy route and backend persistence stores `forwardFactor`. Plan a separate normalized dividend-factor migration before removal.
- datasource legacy `/api/tdx/*` routes: keep until backend, docs, tests, and operator workflows no longer require them.

### Decision 5: Current local-only candidates

- Root `/Users/moyui/sean/mist/openspec/` is an empty scaffold with only `config.yaml`; active OpenSpec state is under `mist/openspec`.
- Root `.pnpm-store`, backend `dist/`, backend `test-results/`, frontend `tsconfig.tsbuildinfo`, datasource `dist/`, `.pytest_cache/`, `.ruff_cache/`, and Python `__pycache__/` directories are ignored and reproducible.
- `node_modules/` and datasource `.venv/` are ignored but useful for local verification, so remove only when disk cleanup is desired.

### Decision 6: Keep current non-candidates explicitly

- Keep `mist/test-data` and `mist-fe/test-data/results` because scripts and `/k` imports depend on them.
- Keep `mist-datasource/tests/unit/test_config.py` references to `AKTOOLS_*`; they verify unrelated env values are ignored.
- Keep `mist-deploy` scripts and the active `.worktrees/mist-deploy-tdx-guard` worktree.
- Keep `mist-skills` scripts unless backend controller routes change.

### Decision 7: Split backend test data cleanup by role

Do not delete `mist/test-data` as a directory. It currently contains active backend fixtures and a stale sync contract:

- Keep `test-data/fixtures/k-line/*` because Chan regression specs import `csi300Data2025`, `shanghaiIndexData2024`, and `shanghaiIndexData2024_2025`.
- Keep `test-data/fixtures/patterns/k-line-fixtures.ts` because `chan.controller.spec.ts` and `chan.service.spec.ts` import `KLineFixtures`.
- Review `test-data/fixtures/patterns/zhongshu-*.json` as tracked removal candidates because current code search finds no imports or path references.
- Treat root `test-results/` as ignored generated output. It can be deleted locally, but the result-generation path must be standardized first.
- Update or remove stale docs under `test-data/README.md` and `test-data/SYNC_WORKFLOW.md`: `README.md` currently describes frontend files, and `SYNC_WORKFLOW.md` says results live under `test-data/test-results/raw/`, while current Chan specs write to root `test-results/`.

Alternative considered: remove the backend test-data sync surface because the generated result directory is absent. This is rejected for now because `tools/sync-test-data.mjs`, `tools/generate-type-definitions.mjs`, package scripts, and frontend synced-result workflows still describe that contract.

### Decision 8: Retire the obsolete deep integration harness

The old `test-integration/deep-test` harness should be retired in this cleanup. A modernized deep integration test runner for `mist-datasource` can be introduced later as a separate, clean change.

The retired harness had drift:

- `runner.mjs` hardcodes `TEST_CONFIG`, while `test-config.json` and `templates/config-template.json` are not read by the runner.
- `service-manager.mjs` still starts `python -m aktools` on port 8080, while current datasource direction is the `mist-datasource` TDX/QMT bridge.
- The README says `mist-datasource` is required, but the service manager actually starts AKTools.
- Generated reports and logs go to ignored root `test-results/`, so those outputs are local artifacts rather than tracked cleanup candidates.

Retirement removes `pnpm run test:deep`, `pnpm run test:deep:watch`, root docs references, and the `test-integration/deep-test` directory together. This keeps the later datasource modernization from inheriting stale AKTools-era assumptions.

## Risks / Trade-offs

- Deleting frontend fixture exports could break undocumented imports -> search all frontend source/docs/tests and run Jest plus TypeScript checks.
- Removing legacy backend parsers could hide a rollback path -> confirm normalized `/v1` tests cover the current behavior before deletion.
- Deleting the untracked datasource integration OpenSpec could lose useful remaining deployment tasks -> reconcile it before removal.
- Cleaning local dependency directories could slow follow-up verification -> prefer leaving `node_modules/` and `.venv/` unless disk space matters.
- OpenSpec validation does not interpret checkbox completion -> final reporting must clearly state which tasks are planned versus already performed.

## Migration Plan

1. Snapshot current git status and ignored artifact inventory for all child repositories.
2. Reconcile `connect-backend-to-datasource` against current backend and deployment code.
3. Apply high-confidence tracked removals in isolated repository diffs.
4. Review and remove frontend unused fixtures only after confirming no imports outside the public test-data index.
5. Resolve backend `test-data` drift: active fixture imports, unused `zhongshu-*.json`, generated result path, and stale sync docs.
6. Decide whether deep integration tests should be modernized around `mist-datasource` or retired with their package scripts and docs.
7. Clean local-only artifacts that are ignored and reproducible, leaving dependencies installed unless explicitly requested.
8. Run targeted verification commands per touched repository.
9. Update this OpenSpec change with execution notes before marking implementation complete.

Rollback is standard git revert for tracked changes. Local artifact cleanup is reversible by reinstalling dependencies or rerunning build/test commands. If a candidate proves uncertain during implementation, keep it and record the reason.

## Execution Notes

Execution on 2026-06-27 completed the current safe cleanup slice:

- Baseline captured: `mist` has tracked cleanup edits and untracked OpenSpec changes; `mist-fe` has adopted root redirect/default SVG cleanup and fixture cleanup; `mist-datasource`, `mist-skills`, and `mist-deploy` have no tracked edits.
- `connect-backend-to-datasource` is retained as an untracked OpenSpec change. Current backend code already covers much of its HTTP `/v1` and WebSocket work, while deployment health-check drift remains a follow-up item.
- Removed unused `TdxSource` private legacy parsers `parseMarketDataResponse` and `parseSnapshot`.
- Kept `fetchDividFactors` on `/api/tdx/divid-factors`; normalized dividend-factor migration remains outside this cleanup.
- Adopted the existing frontend `app/page.tsx` redirect to `/k` and default public SVG deletions after reference search found no usage.
- Removed unused frontend K-line fixtures `csi-300-2023-real.ts` and `csi-300-2025-full-year.ts`, and updated frontend test-data exports/docs.
- Removed stale tracked planning doc `docs/superpowers/plans/2026-06-26-refactor-tdx-python-datasource.md` because current planning now lives in OpenSpec.
- Removed unreferenced backend `test-data/fixtures/patterns/zhongshu-*.json`.
- Standardized generated Chan result output to `test-data/test-results/raw/`, aligning the regression tests with `tools/sync-test-data.mjs`, `tools/generate-type-definitions.mjs`, and sync docs.
- Retired `test-integration/deep-test`, its package scripts, and root docs references. Future deep integration tests should be introduced as a fresh `mist-datasource`-oriented change.
- Removed root `/Users/moyui/sean/mist/openspec/` scaffold and ignored generated artifacts: backend `dist/`, backend root `test-results/`, backend generated `test-data/test-results/`, frontend `tsconfig.tsbuildinfo`, datasource `dist/`, datasource pytest/ruff caches, and datasource Python `__pycache__/` directories.
- Left dependencies and useful local state in place: backend/frontend `node_modules/`, root `.pnpm-store/`, datasource `.venv/`, and active `.worktrees/mist-deploy-tdx-guard`.
- Verified `mist-deploy` remains a separate deployment runner for the artifact produced by `mist/.github/workflows/windows-appliance.yml`.
- Verified datasource legacy `/api/tdx/*` and `/api/qmt/*` routes remain mounted and covered by tests, so they remain protected.
- Verified `mist-skills` scripts still target current backend `security`, `indicator`, and `chan` routes.
- Recorded `deploy/windows/health-check.ps1` hardcoded `http://127.0.0.1:9001/health` datasource probe as remaining integration drift for `connect-backend-to-datasource` or a follow-up change.

Verification notes:

- `pnpm exec jest apps/mist/src/sources/tdx/tdx-source.service.spec.ts --runInBand --watchman=false` passed.
- `pnpm exec jest apps/mist/src/chan/chan.controller.spec.ts apps/mist/src/chan/chan.service.spec.ts --runInBand --watchman=false` passed.
- `pnpm exec jest shanghai-index-2024-2025 --runInBand --watchman=false` passed and wrote the result to `test-data/test-results/raw/`.
- Initial Jest runs without `--watchman=false` failed because watchman could not `fchmod` `/usr/local/var/run/watchman/moyui-state`; this was an environment permission issue.
- Frontend `./node_modules/.bin/tsc --noEmit` currently fails in pre-existing `app/components/k-panel/__tests__/channel.test.ts` fixtures that are missing `displayStartId` and `displayEndId`, unrelated to the deleted test-data exports.

## Open Questions

- Should `connect-backend-to-datasource` be adopted as the authoritative remaining integration plan, or removed because current code already covers most tasks?
- Should a later change deprecate datasource legacy provider routes after backend and operator workflows rely only on `/v1`?
