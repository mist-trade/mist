## Why

The GLM review produced a large cross-repository remediation backlog, but the
work is too broad to execute safely as one unstructured cleanup pass. Mist needs
a governed remediation change that turns the reviewed issues into test-backed,
batchable work while preserving the current production baseline.

## What Changes

- Introduce a remediation governance capability for review-driven fixes across
  the Mist repository set.
- Treat `REVIEW_REMEDIATION_PLAN.md` and `REVIEW_ITEM_INVENTORY.md` as the
  source ledger for issue IDs, priority, scope, and completion criteria.
- Require every implemented remediation item to include a unit test or an
  explicitly documented substitute verification for CI, Docker, deployment, or
  script-only changes.
- Start implementation with P0/P1 stabilization work instead of attempting all
  289 reviewed items in one change.
- Group subsequent implementation into focused child changes by risk area:
  CI/release safety, datasource runtime safety, database schema safety,
  Docker/deployment safety, frontend runtime quality, MCP/skills contracts, and
  monitoring reliability.
- Keep normal datasource service updates separate from TDX terminal recovery and
  keep Docker-stack app deployment separate from host-side WinSW datasource
  operation.

## Capabilities

### New Capabilities

- `review-remediation-governance`: Defines how review findings are selected,
  implemented, tested, verified, and marked complete across the Mist
  repositories.

### Modified Capabilities

None. This change defines remediation governance and the first execution plan;
individual child changes will modify runtime, deployment, frontend, datasource,
monitoring, or skills capabilities when their implementations start.

## Impact

- Affected planning artifacts:
  - `REVIEW_REMEDIATION_PLAN.md`
  - `REVIEW_ITEM_INVENTORY.md`
  - `mist/openspec/changes/stabilize-review-remediation/*`
- Affected repositories during follow-up implementation:
  - `mist`
  - `mist-datasource`
  - `mist-deploy`
  - `mist-fe`
  - `mist-monitoring`
  - `mist-skills`
- Affected operational surfaces:
  - GitHub Actions CI/release workflows
  - TypeORM configuration and migrations
  - Python datasource event-loop and WebSocket contracts
  - Docker images and Windows deployment automation
  - Frontend K-line runtime behavior
  - MCP and skills error contracts
  - Monitoring probe and alert paths

