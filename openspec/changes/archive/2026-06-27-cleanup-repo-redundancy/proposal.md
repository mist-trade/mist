## Why

The workspace contains multiple independent repositories plus root-level local artifacts, generated output, historical worktrees, and stale specification files accumulated during iteration. This creates uncertainty about what should be committed to GitHub and makes current business code harder to review safely.

## What Changes

- Audit each repository and root-level workspace directory using explicit categories: source, tests, documentation/specification, deployment assets, generated output, dependency/cache, local assistant config, and historical worktree artifacts.
- Remove ignored/local generated artifacts that are not required for current development, packaging, or tests.
- Remove or isolate stale tracked files only when references and current workflows show they are unused.
- Update `.gitignore` rules where necessary so recurring generated artifacts do not reappear as commit candidates.
- Keep existing user changes intact; do not revert or overwrite modified or untracked work unless the cleanup specifically adopts it.
- Preserve active OpenSpec changes and worktrees unless they are explicitly identified as obsolete and cleanly removable.

## Capabilities

### New Capabilities
- `repository-cleanup`: Defines how the project audits, removes, and prevents redundant files across the multi-repository workspace.

### Modified Capabilities

## Impact

- Affected repositories: `mist`, `mist-fe`, `mist-datasource`, `mist-skills`, and `mist-deploy`.
- Affected root-level workspace artifacts: `.DS_Store`, `.pnpm-store`, `old-service-wrapper/`, `worktrees/`, and `.worktrees/`.
- Potentially affected files: `.gitignore` files, historical OpenSpec/superpowers docs, generated outputs, local config folders, test fixtures, deployment scripts, and unused code paths.
- Verification impact: cleanup must be backed by repository status checks and targeted test/build/lint commands appropriate to each subrepository.
