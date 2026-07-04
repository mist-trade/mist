## Why

The first P3 remediation batch should remove low-risk backend clutter without
reopening the already-closed P0/P1/P2 work. The selected items are concentrated
in `mist` backend dead code, stale comments, structural contracts, and
review-governance decisions that can be verified locally.

## What Changes

- Select the first 30 backend-focused P3 entries: CODE_REVIEW H1, M1, M3,
  M4, L1, L2; INFRA_REVIEW I9, T5, T10, T11; and
  CODE_SMELL_REVIEW D1.1, D1.2, D1.3, D1.4, D1.6, R1.1, R1.2, R1.3, R1.4,
  R1.5, R1.6, R1.8, P1.1, P1.2, P1.3, P1.5, T1.4, T1.5, M1.2, and M1.4.
- Implement only low-risk code cleanup where the current code still contains a
  clear residue.
- Record P3 items that remain intentionally deferred, already closed by P2
  evidence, or better suited to later route/datasource/frontend batches.
- Add focused Jest or static contract checks before production-code changes.
- Keep public HTTP, MCP, database, and datasource behavior compatible.

## Capabilities

### New Capabilities

- `review-p3-backend-quick-wins`: Tracks the first P3 backend cleanup batch and
  its review-ID evidence.

### Modified Capabilities

- None.

## Impact

- Affected repository: `mist`.
- Likely affected files: backend Chan services/VOs, shared constants/utils,
  MCP service cleanup points, package/workflow contracts, tests, and OpenSpec
  artifacts.
- No external API, database migration, datasource protocol, frontend, deploy,
  monitoring, or skills repository change is intended in this batch.
