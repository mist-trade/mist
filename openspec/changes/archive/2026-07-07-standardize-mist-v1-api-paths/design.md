## Context

The Mist backend exposes several path styles today:

- `/v1/collector/*` for collection operations.
- `/security/v1/*` for security management.
- `/indicator/*` for technical indicators.
- `/chan/*` for Chan Theory analysis.

The strategy platform roadmap selects `/v1/<resource>` for new product APIs.
This change prepares the existing backend surface by adding standardized `/v1`
aliases while keeping current clients working.

## Goals / Non-Goals

**Goals:**

- Add version-first aliases for security, indicator, and Chan endpoints.
- Preserve legacy endpoint compatibility during client migration.
- Keep gateway prefixes `/api/mist` and `/api/chan` unchanged.
- Add tests that verify both standardized and legacy routes are registered.
- Update docs to describe the preferred path style for new APIs.

**Non-Goals:**

- Remove or deprecate legacy routes in code.
- Rename datasource normalized routes.
- Rename `/v1/collector/*`.
- Change request or response payload shapes.
- Change MySQL schema or TypeORM entities.
- Migrate `mist-fe` and `mist-skills` callers in this first compatibility
  change.

## Decisions

### Decision 1: Add aliases instead of moving routes

Controllers should expose new `/v1` paths while preserving existing paths.
Security requires a small compatibility controller because the new resource
names differ from the old path names. Indicator and Chan can use multi-path
controllers because their method suffixes remain unchanged.

Alternative considered: change the existing controller paths directly. That
would break frontend, skills, smoke, and operator docs in one step.

### Decision 2: Keep gateway prefixes out of backend controllers

`/api/mist` and `/api/chan` are nginx/web-gateway routing concerns. Backend
controllers should continue to define service-local paths such as
`/v1/securities` or `/v1/chan/merge-k`.

Alternative considered: include gateway prefixes in backend routes. That would
couple deployment topology to application controllers and break direct backend
use.

### Decision 3: Use route metadata tests for aliases

The first proof should verify that controllers register both old and new route
metadata. Existing unit tests still cover behavior. This keeps the change small
and avoids introducing e2e infrastructure just for path aliases.

Alternative considered: add full HTTP e2e tests for every route. That is useful
later, but the repository currently relies on focused controller/service tests
and smoke plans rather than a full backend e2e harness.

## Risks / Trade-offs

- Alias drift from legacy handlers -> Delegate alias methods to the same
  service methods or share the same controller methods where suffixes match.
- Client migration stalls -> Document preferred paths and add later tasks for
  `mist-fe`, `mist-skills`, README, and smoke inventory migration.
- Route ordering conflicts -> Keep explicit paths such as `/v1/securities`
  separate from old `/security/v1/:code` so catch-all parameters do not shadow
  aliases.
- Swagger duplicates endpoints -> Accept duplicates during compatibility; use
  tags and docs to identify `/v1` as preferred.

## Migration Plan

1. Add standardized aliases in backend controllers.
2. Add route registration tests for old and new paths.
3. Update README endpoint tables to show preferred `/v1` paths and legacy
   compatibility.
4. Validate this OpenSpec change.
5. Later child changes may migrate `mist-fe`, `mist-skills`, and smoke
   inventories to preferred paths.

## Follow-up Client Migration Backlog

This compatibility change does not migrate callers, but it defines the next
client migration work:

- `mist-fe`: replace direct `/security/v1/*`, `/indicator/*`, and `/chan/*`
  calls with `/v1/securities*`, `/v1/security-sources`,
  `/v1/indicators/*`, and `/v1/chan/*`.
- `mist-skills`: update tool endpoint configuration and contract tests to
  prefer `/v1` paths while accepting legacy paths during rollout.
- Smoke inventories: replace backend-local endpoint examples with preferred
  `/v1` paths, keeping production gateway prefixes in deployment-level docs
  only.
- README endpoint tables: list preferred `/v1` paths first and legacy paths as
  compatibility routes.
- OpenSpec references: update later strategy platform child changes to use
  `/v1/<resource>` paths and avoid `strategy/v1` or other feature-local
  version placement.
