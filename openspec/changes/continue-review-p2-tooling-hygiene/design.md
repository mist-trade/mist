## Context

The remaining review backlog has many P2 items, but not all are equally safe to
batch. This change focuses on low-risk tooling defects that are easy to test
and reduce future cleanup drag.

| Review IDs | Repository | Area | Proof |
|---|---|---|---|
| INFRA T3 | `mist` | `lint-staged` `.mjs` coverage | CI contract test |
| INFRA D14 | `mist` | `tsconfig.json` stale paths/casing | CI contract test + typecheck |
| INFRA D13 | `mist-datasource` | ignored local cache dirs | metadata test |
| INFRA T8 | `mist-datasource` | deprecated pytest `event_loop` fixture | metadata test + pytest |
| CODE_REVIEW L10 | `mist-skills` | `get_index_info.py` suffix handling | existing data-query unit test |

## Goals / Non-Goals

**Goals:**

- Complete the selected tooling hygiene review IDs with targeted tests or
  substitute verification.
- Keep the batch small and avoid provider, MCP, monitoring, or deployment
  refactors.
- Preserve existing commands while making their contracts more honest.

**Non-Goals:**

- Remove all `sys.path.insert` usage from skills scripts.
- Add pyright/ruff to every Python repo in this batch.
- Refactor backend source collection logic.
- Rework datasource app lifecycle or DI.

## Decisions

1. **Use existing contract-style tests for config-only backend changes.**
   - `tools/test-ci-contracts.mjs` already guards CI/release contracts. Extending
     it to cover lint-staged and tsconfig avoids adding another test harness.

2. **Use Python metadata tests for repository hygiene.**
   - Datasource `.gitignore` and pytest fixture checks do not require live TDX
     services. A small test can prove the repository policy directly.

3. **Reuse the existing `split_exchange_suffix` helper for `get_index_info`.**
   - Other skills already strip exchange suffixes through shared helpers. Using
     the same helper avoids another one-off parser.

## Risks / Trade-offs

- Enabling `forceConsistentCasingInFileNames` may expose casing drift -> run
  `pnpm run typecheck` before committing.
- Removing the custom `event_loop` fixture relies on pytest-asyncio defaults ->
  run the datasource metadata test and an existing async test to confirm the
  test runner still works.
- Extending lint-staged to `.mjs` may format tool scripts on future commits ->
  this is intended because `.mjs` now participates in tooling contracts.
