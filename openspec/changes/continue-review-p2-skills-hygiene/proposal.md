## Why

The remaining P2 `mist-skills` review findings are concentrated around fragile
runtime contracts: scripts mutate `sys.path`, K-line auto-collection depends on
backend error text, API paths and fields are hardcoded in multiple places, and
the repository lacks lint/type gates. Fixing these now reduces regression risk
before the next manual smoke run.

## What Changes

- Select and close the P2 `mist-skills` findings CODE_REVIEW L9/L11,
  INFRA_REVIEW T7/T12, and CODE_SMELL_REVIEW P4.3/M4.1.
- Record CODE_REVIEW H10 as already covered by the archived
  `fix-mcp-skills-contracts` change, without duplicating implementation work in
  this batch.
- Centralize Mist API endpoint and payload-field constants in the shared skills
  layer.
- Replace message-string K-line retry decisions with structured backend status
  code checks.
- Remove per-script and per-test `sys.path.insert` path mutation and adjust
  imports/tests/docs around package-based loading.
- Add `ruff`, `pyright`, and `black` configuration plus CI steps for
  `mist-skills`.

## Capabilities

### New Capabilities

- `review-p2-skills-hygiene`: Tracks the selected P2 `mist-skills` hygiene
  remediations, their behavior contracts, and verification evidence.

### Modified Capabilities

- None.

## Impact

- Affected repository: `mist-skills`.
- Affected artifacts: shared Python helper modules, skill script entrypoints,
  Python tests, `pyproject.toml`, `uv.lock`, CI workflow, and AstrBot runbook
  docs.
- Runtime compatibility note: direct script execution must rely on an installed
  package or configured `PYTHONPATH`, not per-script `sys.path` mutation.
