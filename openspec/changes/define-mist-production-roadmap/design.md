## Context

The Mist workspace is now a multi-repository system:

- `mist` owns the NestJS backend, Chan API, database migrations, backend Docker
  image, and central OpenSpec specs.
- `mist-datasource` owns the Python TDX/QMT datasource adapter, `/v1`
  normalized routes, WebSocket bridge, WinSW assets, and runtime smoke scripts.
- `mist-deploy` owns the Windows Docker stack deployment, datasource
  management workflow, TDX recovery workflow, monitoring deployment, and Mac
  watchdog deployment.
- `mist-fe` owns the Next.js frontend image and K-line viewer experience.
- `mist-monitoring` owns Windows exporter, Mac watchdog, metrics, alerts, and
  controlled action contracts.
- `mist-skills` owns AstrBot-facing skills that call Mist APIs.

The project has enough implementation to run meaningful tests and deployments,
but remaining work is split across active OpenSpec changes, repo-specific docs,
and Windows-only validation steps. The roadmap must preserve this separation
instead of hiding all follow-up work inside one broad implementation change.

## Goals / Non-Goals

**Goals:**

- Define the ordered production stabilization path for the next Mist phase.
- Make every follow-up item independently spec-able, testable, and archivable.
- Require each follow-up spec to state owner repositories, runtime impact,
  verification evidence, and archive criteria.
- Prioritize live production evidence before expanding product scope.
- Reconcile existing active changes before starting overlapping new work.

**Non-Goals:**

- Implement backend, datasource, deployment, frontend, monitoring, or skills
  code in this roadmap change.
- Replace existing capability specs such as `backend-datasource-integration`,
  `windows-docker-appliance`, `frontend-live-kline-viewer`, or
  `astrbot-integration`.
- Collapse all remaining work into one omnibus implementation change.
- Treat local unit tests as a substitute for Windows runtime validation when a
  task depends on TDX, Docker Desktop, WinSW, or the self-hosted runner.

## Decisions

### Decision 1: Store the roadmap in the `mist` OpenSpec tree

The overall roadmap change lives in `mist/openspec` because `mist` already holds
the central cross-repo capability specs and the active backend/datasource
coordination changes.

Alternative considered: initialize OpenSpec at the workspace root. That would
create a second planning authority outside the existing repo history and make
archiving unclear.

Alternative considered: store the roadmap in `mist-deploy`. That would fit
operations work but would underrepresent backend, datasource, frontend, and
AstrBot changes.

### Decision 2: Use this change as a parent roadmap, not an implementation plan

This change defines gates, decomposition rules, and evidence requirements. Each
roadmap item enters its own OpenSpec change before coding or live validation.

This keeps unrelated work from being merged together and lets production
verification, datasource realtime behavior, guard validation, monitoring,
frontend UX, and engineering hygiene progress independently.

### Decision 3: Make production evidence the first gate

The first follow-up spec should establish a known-good production evidence
ledger: pinned backend, frontend, datasource, deploy, and monitoring refs;
deploy output; health output; runtime smoke output; backup restore rehearsal;
and Mac-side gateway probes.

Without this baseline, later changes can pass local tests while still drifting
from the Windows API machine runtime.

### Decision 4: Reconcile active OpenSpec changes before overlapping work

The active changes `add-tdx-desktop-guard`,
`refactor-tdx-python-datasource`, and
`align-tdx-qmt-datasource-contracts` contain useful work but no longer map
perfectly to current code state. Follow-up specs that touch those areas must
first either update the existing change artifacts or archive completed portions
with explicit remaining work.

### Decision 5: Keep verification commands and archive criteria mandatory

Every child spec must name:

- local validation commands;
- live Windows validation commands when relevant;
- manual evidence required from the Windows API machine;
- expected clean git status;
- exact condition that allows the child change to be archived.

## Risks / Trade-offs

- Broad roadmap becomes stale -> keep tasks limited to child spec creation and
  readiness gates, not detailed implementation steps.
- Child specs duplicate existing active changes -> require an active-change
  reconciliation step before creating overlapping child changes.
- Production validation blocks on Windows access -> allow local work to be
  proposed, but do not mark Windows-dependent child changes complete without
  Windows evidence.
- Monitoring and recovery actions could mutate runtime state -> keep metrics
  read-only and route recovery through controlled action specs.
- Frontend scope could expand before data reliability is proven -> keep product
  UX work behind the production evidence and realtime datasource gates.

## Migration Plan

1. Create and validate this roadmap change.
2. Use its tasks list as the backlog for child OpenSpec changes.
3. For each child item, create a separate change with proposal, design when
   needed, specs, and tasks.
4. Apply, verify, and archive child changes independently.
5. Archive this roadmap only after every child item has either been completed,
   explicitly deferred, or replaced by a newer roadmap.

## Open Questions

- Whether the TDX realtime path should remain snapshot-only or publish
  normalized bar events as the product realtime contract.
- Whether `mist-datasource` should move back to `master` or keep a dedicated
  long-lived datasource contract branch.
- Whether frontend production builds should keep fetching Google Fonts at build
  time or switch to local fonts for offline repeatability.
- Which monitoring action backend should be implemented first for
  `mist恢复tdx`: runbook-only, GitHub Actions dispatch, or a local Windows
  authenticated endpoint.
