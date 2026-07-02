## Why

After the remaining P1 cleanup, the next highest-value review items are small
tooling and hygiene gaps that can keep CI, pre-commit, or script behavior
misleading. Fixing these now removes low-level friction before larger P2
runtime refactors.

## What Changes

- Select a bounded P2/P3 tooling hygiene batch:
  INFRA_REVIEW T3, D13, D14, T8; CODE_REVIEW L10.
- Make backend lint-staged cover `.mjs` tool scripts and lock that behavior in
  the CI contract test.
- Remove stale/duplicate TypeScript path aliases and enable consistent casing
  checks.
- Ignore datasource local tool caches and test the ignore contract.
- Remove the deprecated datasource pytest `event_loop` fixture.
- Normalize `get_index_info.py` input so exchange suffixes are stripped before
  calling the backend.
- Record review-id evidence for each selected item.

## Capabilities

### New Capabilities

- `review-p2-tooling-hygiene`: Tracks completion criteria for this bounded
  tooling-focused P2/P3 review wave.

### Modified Capabilities

- `review-remediation-governance`: Extends follow-up remediation traceability
  to the selected P2 tooling hygiene batch.

## Impact

- Affected repositories: `mist`, `mist-datasource`, and `mist-skills`.
- Affected areas: package lint-staged config, TypeScript config, datasource
  repository hygiene, pytest configuration, and skills data-query behavior.
- No runtime API contract change is intended.
