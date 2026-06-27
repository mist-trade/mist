## Why

The Mist workspace now has five independent repositories with overlapping test data, datasource contracts, deployment scripts, and historical planning artifacts. A fresh OpenSpec plan is needed because the earlier `cleanup-repo-redundancy` audit is stale against current `master`, and some current candidates affect cross-repository contracts rather than simple local clutter.

## What Changes

- Audit redundancy at repository boundaries: backend-to-frontend test data sync, backend-to-datasource TDX contracts, appliance build-to-deploy scripts, and `mist-skills` backend endpoint usage.
- Remove proven-unused tracked code and docs in small, independently verifiable changes.
- Finalize or revise the current `mist-fe` cleanup of the default Next.js homepage and default public SVG assets.
- Review frontend K-line fixture exports and remove old fixture files only when current imports, docs, and tests show they are not part of the active mock-data surface.
- Review backend `test-data` by role: preserve active Chan fixtures, remove only proven-unused pattern files, and fix stale generated-result path/docs before any frontend sync cleanup.
- Retire the old `test-integration/deep-test` harness because it mixes a `mist-datasource` README with an AKTools service manager and hardcoded runner config; modernized datasource integration tests will be handled in a later change.
- Remove unused legacy private parsers left in the backend TDX source client after the `/v1` datasource migration.
- Decide whether to adopt, refresh, or delete the untracked `connect-backend-to-datasource` OpenSpec change now that current backend code already implements much of that migration.
- Remove local-only redundant workspace artifacts such as the root-level empty OpenSpec scaffold when they are not referenced by the active `mist/openspec` project.
- Keep contract-bearing files that only look redundant, including synced frontend result fixtures, datasource legacy routes still covered by tests, `mist-deploy` deployment runner scripts, active linked worktrees, and `mist-skills` scripts that match backend controllers.
- No public HTTP API or datasource API breaking change is intended.

## Capabilities

### New Capabilities

- `cross-repo-redundancy-pruning`: Defines how redundant files and code are identified, removed, or preserved across the Mist multi-repository workspace.

### Modified Capabilities

None. No archived specs exist under `openspec/specs/`; this change introduces a cleanup planning capability rather than changing product behavior.

## Impact

- Affected repositories: `mist`, `mist-fe`, `mist-datasource`, `mist-skills`, and `mist-deploy`.
- Tracked removals in the applied cleanup slice: `mist/apps/mist/src/sources/tdx/tdx-source.service.ts` private legacy parsers, `mist/docs/superpowers/plans/2026-06-26-refactor-tdx-python-datasource.md`, unreferenced `mist/test-data/fixtures/patterns/zhongshu-*.json` files, unused `mist-fe/test-data/fixtures/k-line/*` files, and the intentionally retired `test-integration/deep-test` harness with its package scripts/docs.
- Current dirty work to account for: `mist-fe/app/page.tsx` redirect plus deleted default `public/*.svg` assets, and untracked `mist/openspec/changes/connect-backend-to-datasource/`.
- Candidate local-only cleanup: root `/Users/moyui/sean/mist/openspec/`, root `.pnpm-store`, ignored build outputs, TypeScript build info, and Python cache directories.
- Verification impact: focused TypeScript/Jest checks for backend and frontend, datasource non-live pytest when datasource contracts are touched, PowerShell script checks when deployment assumptions change, and OpenSpec validation for this plan.
