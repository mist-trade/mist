## 1. Inventory

- [x] 1.1 Capture git status, tracked files, untracked files, ignored artifact summaries, and worktree state for every child repository.
- [x] 1.2 Capture root-level workspace artifact inventory and classify each root item as repository, local artifact, or active worktree.
- [x] 1.3 Search cross-repository references for root-level artifacts and known cleanup candidates.

## 2. Safe Local Artifact Cleanup

- [x] 2.1 Remove root-level `.DS_Store` and other OS-generated files.
- [x] 2.2 Remove root-level non-git scratch artifacts that are reproducible and not needed by current workflows.
- [x] 2.3 Remove generated dependency/cache/build artifacts inside child repositories only when they are ignored and reproducible.
- [x] 2.4 Preserve active linked worktrees reported by `git worktree list`.

## 3. Recurrence Prevention

- [x] 3.1 Update ignore rules or cleanup behavior for recurring local artifacts that appear after normal tests/builds.
- [x] 3.2 Verify ignored artifact candidates no longer appear as commit candidates.

## 4. Tracked Candidate Review

- [x] 4.1 Review `mist` tracked docs/specs/tests/generated fixture candidates for current references and keep/remove decisions.
- [x] 4.2 Review `mist-fe` tracked frontend fixtures/results and default public assets for current references and keep/remove decisions.
- [x] 4.3 Review `mist-datasource` tracked `.trae` docs, unused QMT/TDX route modules, deployment scripts, and fixtures for current references and keep/remove decisions.
- [x] 4.4 Review `mist-skills` tracked skill scripts/tests for current references and keep/remove decisions.
- [x] 4.5 Review `mist-deploy` tracked deployment workflow/scripts for current references and keep/remove decisions.

## 5. Apply Proven Tracked Removals

- [x] 5.1 Remove only tracked files or business logic proven unused by reference search and current workflow checks.
- [x] 5.2 Keep uncertain tracked candidates and document the reason.
- [x] 5.3 Update any imports, scripts, docs, or tests affected by proven removals.

## 6. Verification

- [x] 6.1 Run OpenSpec validation for `cleanup-repo-redundancy`.
- [x] 6.2 Run targeted verification commands for child repositories with tracked changes.
- [x] 6.3 Report final git status, removed artifacts, kept candidates, and any skipped verification.
