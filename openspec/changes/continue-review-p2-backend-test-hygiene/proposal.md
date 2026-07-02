## Why

The remaining P2 backend test findings are about signal quality rather than
runtime behavior: coverage currently counts files that should not contribute to
application coverage, and one-off Chan diagnostic specs still run as normal
tests. While preparing this batch, the cross-repo CI contract also exposed a
drift from the completed `mist-skills` tooling change, so this batch keeps the
contract tests aligned.

## What Changes

- Select and close INFRA_REVIEW T10, INFRA_REVIEW T11, and CODE_REVIEW M4.
- Add CI contract coverage for Jest coverage exclusions and ignored archived
  diagnostic specs.
- Move July 2025 Chan diagnostic specs out of the normal Jest suite into an
  archive folder that Jest ignores.
- Align the cross-repo `mist-skills` CI contract with the current uv-based
  Ruff/Pyright/Black/Pytest workflow.

## Capabilities

### New Capabilities

- `review-p2-backend-test-hygiene`: Tracks backend P2 test hygiene remediation,
  including coverage scope, archived diagnostic tests, and CI contract drift.

### Modified Capabilities

- None.

## Impact

- Affected repository: `mist`.
- Affected files: `package.json`, `tools/test-ci-contracts.mjs`, Chan test
  archive paths, OpenSpec artifacts.
- No backend runtime API or datasource behavior changes are intended.
