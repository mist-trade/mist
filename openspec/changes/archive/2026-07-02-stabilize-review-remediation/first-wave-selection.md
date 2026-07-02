# First Wave Selection

This parent change uses `REVIEW_ITEM_INVENTORY.md` as the active source ledger.
The first implementation wave selects P0/P1 items that reduce release, runtime,
database, deployment, contract, frontend, skills, and monitoring risk before
broader P2/P3 cleanup.

## Evidence Format

Every completed item must use this format in the child change summary:

```text
<review-id> -> <changed files> -> <test or verification command/result>
```

Code behavior fixes require targeted unit, integration, or contract tests.
Workflow, Docker, deployment, and script-only fixes require substitute
verification that proves the reviewed risk.

## Selected Child Changes

| Child change | Selected review IDs | Planned proof |
|---|---|---|
| `harden-release-ci` | CODE_REVIEW C1; INFRA I1, I2, I3, I5, I8, D9, 共性1 | CI contract test; repo-local lint/type/test commands; git tracking check for local env files |
| `fix-datasource-runtime-safety` | CODE_REVIEW C2, C3, C4; CODE_SMELL D2.6, U2.3, F2.1, F2.2 | Python unit tests for async SDK isolation, callback loop handoff, dirty-symbol queueing, and unsupported capability responses |
| `disable-typeorm-auto-sync` | CODE_REVIEW C7; CODE_SMELL B1.1, B1.3 | TypeORM config unit tests plus entity/migration/schema assertions |
| `harden-docker-deploy-path` | INFRA I4, I6, D1, D2, D3, D4, D5, D6, D8, S5; CODE_REVIEW L14 | Dockerfile/compose contract tests, script self-tests, image smoke where local Docker is available, Windows runner smoke when required |
| `align-datasource-ws-contract` | CODE_REVIEW C5, H4, H5; CODE_SMELL D2.2, R2.1, P2.1, P2.2, M2.2, U2.1, U2.3, O2.1 | Datasource WebSocket contract tests and backend consumer tests |
| `fix-mcp-skills-contracts` | CODE_REVIEW C6, C8, C9; CODE_SMELL D1.5, T1.4, T1.6, P4.1, P4.2, D4.2, U4.1 | Backend MCP unit tests, shared error helper tests, skills client response parsing tests |
| `fix-frontend-runtime-quality` | CODE_REVIEW H6, H7, H8, H9, M5, M6, M7; CODE_SMELL D3.1-D3.7, A3.1, A3.4, P3.5, T3.5, T3.8, X3.3 | Frontend Jest tests for API layer, mock isolation, request race cancellation, resize observer, and large-data utilities |
| `repair-monitoring-health-alerts` | CODE_REVIEW C10, M10, M11, L13, L15; CODE_SMELL D5.1-D5.6, P5.4, N5.2, C5.2 | Go/Python monitoring tests for datasource health parsing, probe errors, notifier timeout, and Prometheus rendering |

## Current Child Change In Progress

`harden-release-ci` starts first because it establishes the CI and release
gates that subsequent remediation changes will rely on.
