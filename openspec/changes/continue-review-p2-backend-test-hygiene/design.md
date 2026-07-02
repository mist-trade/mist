## Context

The backend Jest configuration currently collects coverage from every TS/JS
file and runs every `.spec.ts` under `apps/` and `libs/`. That makes coverage
numbers noisy and keeps July 2025 Chan diagnostic specs in the normal test
path. The cross-repo CI contract also still expects the old `mist-skills`
workflow after the previous P2 skills hygiene batch moved that repo to uv-based
quality gates.

## Goals / Non-Goals

**Goals:**

- Exclude spec files, entrypoints, and config files from backend coverage.
- Archive Chan one-off July diagnostic specs outside the normal Jest suite.
- Add contract checks that fail if coverage exclusions or archive ignores drift.
- Update the skills workflow contract to the uv/Ruff/Pyright/Black/Pytest gate.

**Non-Goals:**

- Do not change Chan runtime logic or public APIs.
- Do not delete historical diagnostic tests; preserve them under archive.
- Do not broaden this batch into unrelated frontend, datasource, or monitoring
  P2 items.

## Decisions

1. **Use `tools/test-ci-contracts.mjs` as the verification home.**
   This existing script already checks cross-repo CI and configuration
   invariants. Adding Jest coverage/archive and skills CI expectations there
   gives one local and CI-facing proof.

2. **Move diagnostic specs to `apps/mist/src/chan/test/archive/`.**
   The files remain available for manual forensics, but Jest will ignore this
   folder through `testPathIgnorePatterns`.

3. **Keep July diagnostic scope literal.**
   This batch archives `july-2025-*.spec.ts` plus the closely related
   `july-29-aug-01-check.spec.ts` and `wide-bi-july-2025.spec.ts` files that
   share the same diagnostic smell. Non-July market-data regression specs remain
   in the normal test suite.

## Risks / Trade-offs

- Archived specs no longer run in normal CI. Mitigation: keep files in the repo
  and rely on existing service-level Chan specs for normal regression coverage.
- Contract checks can fail when adjacent repos are absent. Mitigation: keep the
  existing optional-repo wrapper for cross-repo checks.
