## 1. Baseline And Decisions

- [x] 1.1 Capture current `git status --short --branch` and ignored artifact summaries for `mist`, `mist-fe`, `mist-datasource`, `mist-skills`, and `mist-deploy`.
- [x] 1.2 Capture root-level workspace artifacts and classify `/Users/moyui/sean/mist/openspec/`, `.pnpm-store/`, `.codex/`, and `.worktrees/`.
- [x] 1.3 Compare `openspec/changes/connect-backend-to-datasource/` tasks against current backend code and decide whether to refresh, adopt, or remove that untracked change.
- [x] 1.4 Record keep/remove rationale for every candidate in this OpenSpec change before applying tracked removals.

## 2. Backend Redundancy Cleanup

- [x] 2.1 Remove unused private legacy parser `parseMarketDataResponse` from `apps/mist/src/sources/tdx/tdx-source.service.ts`.
- [x] 2.2 Remove unused private legacy parser `parseSnapshot` from `apps/mist/src/sources/tdx/tdx-source.service.ts`, leaving the WebSocket service parser untouched.
- [x] 2.3 Confirm `fetchDividFactors` remains on the legacy route intentionally until normalized dividend-factor migration is specified.
- [x] 2.4 Run targeted backend verification for `apps/mist/src/sources/tdx/tdx-source.service.spec.ts`.

## 3. Frontend Redundancy Cleanup

- [x] 3.1 Adopt or revert the current `app/page.tsx` redirect-to-`/k` change explicitly; if adopted, keep the root page as a minimal redirect.
- [x] 3.2 Remove default Next.js public SVG assets only after confirming no remaining imports or references.
- [x] 3.3 Audit `test-data/fixtures/k-line/csi-300-2023-real.ts` and `csi-300-2025-full-year.ts`; if they are only re-exported, remove them and update `test-data/index.ts` plus docs.
- [x] 3.4 Preserve active mock fallback data and synced backend result fixtures used by `app/api/fetch.ts` and `app/k/page.tsx`.
- [x] 3.5 Run frontend import search and targeted Jest or TypeScript verification after fixture/page cleanup.

## 4. Planning And Local Artifact Cleanup

- [x] 4.1 Remove or relocate `docs/superpowers/plans/2026-06-26-refactor-tdx-python-datasource.md` if OpenSpec is the authoritative current plan and no external references exist.
- [x] 4.2 Remove the root-level empty OpenSpec scaffold at `/Users/moyui/sean/mist/openspec/` if no tool or workflow references it.
- [x] 4.3 Clean ignored generated artifacts such as backend `dist/`, backend `test-results/`, frontend `tsconfig.tsbuildinfo`, datasource `dist/`, `.pytest_cache/`, `.ruff_cache/`, and Python `__pycache__/` directories when disk cleanup is desired.
- [x] 4.4 Leave `node_modules/`, datasource `.venv/`, and active `.worktrees/mist-deploy-tdx-guard` in place unless explicitly cleaning local disk state.

## 5. Backend Test Data Review

- [x] 5.1 Preserve `test-data/fixtures/k-line/*` files currently imported by Chan regression specs.
- [x] 5.2 Preserve `test-data/fixtures/patterns/k-line-fixtures.ts` while `chan.controller.spec.ts` and `chan.service.spec.ts` import `KLineFixtures`.
- [x] 5.3 Audit `test-data/fixtures/patterns/zhongshu-*.json`; if they remain unreferenced by code, docs, and scripts, remove them with a targeted test run.
- [x] 5.4 Choose one canonical generated-result path: either update Chan specs to write `test-data/test-results/raw/` or update `tools/sync-test-data.mjs`, `tools/generate-type-definitions.mjs`, and docs to consume root `test-results/`.
- [x] 5.5 Update `test-data/README.md` so it describes backend fixtures and generated backend results rather than frontend-only files.
- [x] 5.6 Update `test-data/SYNC_WORKFLOW.md` after the canonical generated-result path is chosen.
- [x] 5.7 Treat root `test-results/` as ignored local output and clean it only after result-path drift is resolved.

## 6. Deep Integration Test Review

- [x] 6.1 Decide whether `test-integration/deep-test` should be modernized or retired: retire this old harness now; modernize around `mist-datasource` later.
- [x] 6.2 Modernization branch is deferred to a future `mist-datasource` deep-test change.
- [x] 6.3 Old unused config files are removed with the retired harness; future config should be introduced with the new runner.
- [x] 6.4 Remove `test:deep` and `test:deep:watch` scripts, root docs references, and the `test-integration/deep-test` directory in the same diff.
- [x] 6.5 Verify the retirement path with package-script/docs reference searches, package JSON parsing, OpenSpec validation, and `git diff --check`.

## 7. Cross-Repo Contract Protection

- [x] 7.1 Verify `mist-deploy` runner scripts still match the artifact shape assembled by `mist/.github/workflows/windows-appliance.yml`; do not delete runner scripts as duplicate packaged scripts.
- [x] 7.2 Verify datasource legacy `/api/tdx/*` and `/api/qmt/*` routes remain mounted and tested; do not remove them in this cleanup.
- [x] 7.3 Verify `mist-skills` scripts still map to current backend `security`, `indicator`, and `chan` controllers; do not remove them while the endpoints match.
- [x] 7.4 Record the `deploy/windows/health-check.ps1` hardcoded datasource URL as a remaining integration drift item for `connect-backend-to-datasource` or a follow-up change, not as a redundant-file deletion.

## 8. Final Verification And Report

- [x] 8.1 Run `openspec validate prune-cross-repo-redundancy --strict` from `mist/`.
- [x] 8.2 Run `git diff --check` for each child repository touched by tracked cleanup.
- [x] 8.3 Run repository-specific tests listed in the relevant task groups or report why a verification step was skipped.
- [x] 8.4 Summarize final git status, removed tracked files, local-only cleanup, preserved candidates, and follow-up migration candidates.
