## Context

The review backlog now spans six repositories under the local workspace:
`mist`, `mist-datasource`, `mist-deploy`, `mist-fe`, `mist-monitoring`, and
`mist-skills`. The source findings have been normalized into two root-level
documents:

- `REVIEW_REMEDIATION_PLAN.md`: priority, strategy, and execution order.
- `REVIEW_ITEM_INVENTORY.md`: the complete item inventory, currently 289
  entries, with decision, priority, and handling summary.

The current production baseline is not a single container appliance. The active
path is a Docker stack for backend, Chan API, frontend/gateway, and MySQL plus a
host-side WinSW TDX datasource. Remediation must preserve that boundary: normal
app deployment and datasource service updates are separate, and TDX terminal
recovery is not the same workflow as ordinary datasource restart/update.

## Goals / Non-Goals

**Goals:**

- Convert the review inventory into governed, test-backed implementation work.
- Start with P0/P1 stabilization items that reduce security, release, database,
  runtime, Docker/deployment, and user-visible risk.
- Require every fixed item to include a unit test or explicit substitute
  verification.
- Keep a traceable link from review item ID to code change, test/verification,
  and completion status.
- Split implementation into focused child changes rather than one oversized
  cross-repository patch.

**Non-Goals:**

- Fix all 289 review findings in this parent change.
- Rewrite the whole monorepo structure or force every repository to adopt the
  same OpenSpec layout before remediation can begin.
- Remove the Windows Docker mirror workaround without checking the download
  failure source.
- Collapse host-side TDX datasource operations into Docker deployment.
- Treat style-only code smell items as blockers for production stabilization.

## Decisions

### Decision 1: Use this change as the parent governance change

This change owns the rules, acceptance criteria, and first batch plan. Actual
code edits should happen in child changes or tightly scoped implementation
branches grouped by risk area.

Alternative considered: one giant implementation change for all findings. That
would make review, rollback, and testing too difficult.

### Decision 2: P0/P1 items define the first implementation wave

The first wave should include:

- CI/release safety and `.env` tracking cleanup.
- Datasource event-loop, callback, and dirty-symbol safety.
- TypeORM `synchronize` shutdown plus high-risk DB schema fixes.
- Backend Dockerfile/compose/deploy rollback hardening.
- WebSocket and datasource route contract alignment.
- MCP/skills error and stub contract cleanup.
- Frontend runtime correctness for API duplication, mock bundle leakage,
  resize, request races, and large-data operations.
- Monitoring datasource health and probe/notification error visibility.

P2/P3 items remain in the inventory and may be repaired opportunistically when a
nearby file is touched.

### Decision 3: Completion requires proof, not just edits

Every completed item must list:

```text
<review-id> -> <test file or substitute verification> -> <command/result>
```

Unit tests are required when a behavior can be isolated. CI workflows,
Dockerfiles, PowerShell/bash scripts, and deployment-only changes may use
substitute verification such as workflow config tests, script self-tests,
compose config checks, image build smoke, or contract fixture tests.

### Decision 4: Child changes own capability modifications

This parent change introduces governance only. When implementation modifies an
existing runtime or deployment contract, the child change should add or modify
the relevant capability spec. Examples:

- `harden-release-ci`
- `fix-datasource-runtime-safety`
- `disable-typeorm-auto-sync`
- `harden-docker-deploy-path`
- `align-datasource-ws-contract`
- `fix-frontend-runtime-quality`
- `repair-monitoring-health-alerts`

### Decision 5: The inventory remains the source ledger

`REVIEW_ITEM_INVENTORY.md` should remain the human-readable checklist. When a
child change completes items, it should update or append completion evidence in
that child change and reference the inventory item IDs. The parent inventory
does not need to be rewritten after every child change unless priorities or
decisions change.

## Risks / Trade-offs

- Broad cross-repository work can drift into unrelated refactors -> require
  child changes with bounded scopes and explicit item IDs.
- Existing tests may not cover the actual risk -> require targeted tests or
  substitute verification for each completed item.
- CI and Docker changes may need network or runner-specific validation -> record
  local validation separately from Windows runner smoke and do not claim full
  production readiness from local checks alone.
- Some review findings are style-only -> keep them P3 and avoid blocking higher
  risk fixes.
- Datasource contract work can accidentally expose provider-specific payloads ->
  keep normalized Python datasource contracts as the product-facing boundary and
  raw provider access debug-only.

## Migration Plan

1. Keep the current review documents as the initial source ledger.
2. Use this OpenSpec change to approve remediation governance.
3. Create child changes for the first P0/P1 implementation wave.
4. For each child change, list selected review IDs before implementation.
5. Implement each selected item with unit tests or substitute verification.
6. Run repository-local verification before marking any item complete.
7. Use Windows runner or production smoke only when the item affects deployment
   or runtime health beyond local test coverage.
8. Archive child changes after their selected IDs are fixed and verified.

Rollback is per child change. This parent change does not alter runtime code and
has no runtime rollback path.

## Open Questions

- Whether to add OpenSpec directories to `mist-datasource`, `mist-fe`, and
  `mist-skills`, or keep their remediation tasks governed from the `mist`
  parent change until those repositories need independent specs.
- Whether the first implementation wave should be split by repository or by
  risk area. Risk-area split is currently preferred because some fixes span
  multiple repositories.

