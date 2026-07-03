## Why

Backend production collection paths still use `console.*` while adjacent
strategies use NestJS `Logger`. This keeps logs inconsistent and makes the P2
review findings around production logging harder to enforce.

## What Changes

- Select and close CODE_REVIEW H11 and CODE_SMELL U1.1 for the `mist`
  backend.
- Add failing tests that require collection and datasource fallback logs to go
  through NestJS `Logger` rather than global `console`.
- Add a CI contract guard so production backend source files cannot reintroduce
  `console.*` in the selected paths.
- Replace `console.warn`, `console.log`, and `console.error` in
  `CollectorService` and `DataSourceService` with class-scoped loggers.

## Capabilities

### New Capabilities

- `review-p2-backend-logging-hygiene`: Tracks backend P2 logging remediation
  for production collection and datasource selection paths.

### Modified Capabilities

- None.

## Impact

- Affected repository: `mist`.
- Affected files: `apps/mist/src/collector/collector.service.ts`,
  `apps/mist/src/collector/collector.service.spec.ts`,
  `libs/utils/src/services/data-source.service.ts`,
  `libs/utils/src/services/data-source.service.spec.ts`, and
  `tools/test-ci-contracts.mjs`.
- No HTTP API, datasource protocol, database schema, or deployment behavior
  changes are intended.
