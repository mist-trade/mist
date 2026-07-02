## Why

The remaining `mist` backend P2 findings are concentrated around runtime
safety, type narrowing, duplicated query/save paths, and a few Chan/extension
invariants. Earlier P2 batches closed logging, test hygiene, and datasource
HTTP config. This sweep closes the next backend-only set without crossing into
Python datasource, frontend, deploy, or monitoring work.

## What Changes

- Select and close CODE_REVIEW H3 and CODE_SMELL_REVIEW D1.7, R1.7, R1.9,
  P1.4, T1.1, T1.3, M1.1, B1.5, U1.2, U1.4, and O1.6.
- Add focused Jest tests and CI contract checks before implementation.
- Replace selected weak typing and double casts with explicit backend types.
- Centralize TDX WebSocket timing values and period mapping helpers.
- Extract repeated WebSocket save and MCP query builder paths into local helper
  methods.
- Add invariant guards where Chan merge code currently depends on non-null
  assertions.
- Align EF extension nullable fields so TypeScript defaults do not imply
  non-null database values.

## Capabilities

### New Capabilities

- `review-p2-backend-runtime-sweep`: Tracks backend P2 runtime/type/refactor
  remediation for the selected `mist` backend findings.

### Modified Capabilities

- None.

## Impact

- Affected repository: `mist`.
- Affected files: backend collector services, TDX WebSocket service, MCP data
  service, indicator/period mapping, Chan Bi service, EF extension entity,
  focused Jest specs, CI contract tests, OpenSpec artifacts.
- No external API, datasource protocol, or database migration change is
  intended.
