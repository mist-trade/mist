## Context

The first remediation wave intentionally selected high-risk P0/P1 items and
archived the completed changes with review-id evidence. The remaining P1 items
are smaller but still actionable: dependency hygiene, a fake backend e2e script,
one hard-coded EF source URL, and one real Chan array mutation bug.

The change spans three repositories under the workspace:

| Review IDs | Repository | Area | Proof |
|---|---|---|---|
| CODE_REVIEW L5, INFRA D10 | `mist-datasource` | Python dependency groups | Metadata test plus `uv lock --check`/pytest |
| INFRA D11, INFRA 共性2 | `mist-skills` | Lock file | `uv lock --check` and pytest |
| INFRA S9 | `mist` | `package.json` scripts | Contract test for `test:e2e` target |
| CODE_SMELL M1.5 | `mist` | `EastMoneySource` config | Jest unit test for `AKTOOLS_BASE_URL` |
| CODE_SMELL O1.1 | `mist` | `BiService.removeBiByIndex` | Jest regression test for single removal |

## Goals / Non-Goals

**Goals:**

- Complete the selected seven P1 review findings with targeted tests or
  substitute verification.
- Keep each fix scoped to the reviewed risk and avoid broad P2/P3 cleanup.
- Record `review-id -> changed files -> test/verification command` evidence.

**Non-Goals:**

- Rework datasource provider architecture or route contracts.
- Add a full backend e2e suite in this change; the fake script only needs to
  stop pointing to a missing path.
- Refactor Chan algorithms beyond the `splice(index)` bug.
- Revisit already archived first-wave remediation changes.

## Decisions

1. **Use dependency metadata tests for Python dependency grouping.**
   - The datasource issue is that test/lint tools are declared as runtime
     dependencies. A unit-style TOML metadata test proves the contract without
     requiring a live datasource runtime.
   - Alternative considered: rely only on `uv sync --no-dev`. That is useful
     but slower and less explicit about which packages are forbidden in runtime
     dependencies.

2. **Keep `mist-skills` on `uv.lock`.**
   - The workspace already uses `uv` in nearby Python projects, and
     `mist-datasource` already has `uv.lock`. Adding a skills lock file is the
     smallest deterministic dependency fix.
   - Alternative considered: introduce another lock tool. That would add tool
     diversity without benefit.

3. **Make `test:e2e` honest, not aspirational.**
   - Since `apps/mist/test/jest-e2e.json` does not exist, this change will
     either point to an existing config or remove the script. If no real e2e
     config exists, removal is safer than a failing fake command.

4. **Use existing `AKTOOLS_BASE_URL` configuration for EF.**
   - `libs/config/src/validation.schema.ts` already defines
     `AKTOOLS_BASE_URL`, so `EastMoneySource` should consume `ConfigService`
     rather than hard-coding `http://127.0.0.1:8080`.
   - Alternative considered: add a new EF-specific variable. That would
     duplicate the existing config surface.

5. **Test the private Chan helper through a focused regression harness.**
   - The bug lives in a private method, but the reviewed risk is exact array
     mutation. A narrow test can access the helper via bracket notation while
     keeping production visibility unchanged.

## Risks / Trade-offs

- Python lock regeneration may update transitive versions -> keep the generated
  lock file scoped to `mist-skills` and verify tests.
- Removing `test:e2e` may surprise callers -> package contract tests will prove
  no script points at a missing config, and ordinary `test:ci` remains intact.
- Injecting `ConfigService` into `EastMoneySource` changes constructor shape ->
  update only tests/modules that instantiate the provider.
