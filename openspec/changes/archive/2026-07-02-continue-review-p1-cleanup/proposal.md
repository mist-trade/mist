## Why

The first remediation wave closed the highest-risk review items, but seven
P1 findings remain as real defects or release-quality gaps. Fixing them now
keeps the review backlog moving while the context and test conventions are
still fresh.

## What Changes

- Select the remaining P1 review IDs not covered by the first wave:
  CODE_REVIEW L5; INFRA_REVIEW D10, D11, S9, 共性2; CODE_SMELL_REVIEW M1.5,
  O1.1.
- Split datasource runtime dependencies from development/test tooling and
  keep the dependency check test-backed.
- Add or enforce a deterministic lock file for `mist-skills`.
- Remove or replace the backend `test:e2e` script that points to a missing
  directory.
- Move the EF/AKTools base URL out of hard-coded source and into configuration.
- Fix `removeBiByIndex` so it removes exactly one item and add a regression
  test.
- Record each review ID with changed files and verification commands.

## Capabilities

### New Capabilities

- `review-p1-cleanup`: Tracks completion criteria for the remaining P1 review
  findings after the first remediation wave.

### Modified Capabilities

- `review-remediation-governance`: Extends the governed review-remediation
  ledger with a second small wave of selected P1 fixes.

## Impact

- Affected repositories: `mist`, `mist-datasource`, and `mist-skills`.
- Affected areas: Node package scripts, datasource Python dependency metadata,
  skills dependency locking, backend EF source configuration, Chan utility
  behavior, and review remediation evidence.
- No public API breaking change is intended.
