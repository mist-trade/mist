## Why

Mist now has working repositories for backend, datasource, deployment,
frontend, monitoring, and AstrBot skills, but the remaining work is spread
across multiple active changes and runtime-only verification paths. We need one
top-level roadmap spec so each follow-up can enter its own focused OpenSpec
change without losing the production dependency order.

## What Changes

- Add an overall production roadmap contract that defines the sequence for
  stabilizing Mist after the Docker + host datasource migration.
- Define how cross-repo work is split into independent follow-up specs for
  production verification, TDX realtime behavior, OpenSpec cleanup, Windows
  guard validation, monitoring/AstrBot operations, frontend console work, and
  engineering hygiene.
- Require every follow-up spec to name its owning repository, runtime impact,
  verification commands, Windows-only evidence, and archive condition.
- Keep this change as planning and governance only; it does not implement
  runtime code, deployment changes, UI changes, or service recovery behavior.
- Avoid turning the roadmap into one large implementation change. Each roadmap
  item must become a separate change before development or live validation.

## Capabilities

### New Capabilities

- `mist-production-roadmap`: Cross-repository roadmap, decomposition,
  verification evidence, and readiness-gate requirements for the next Mist
  production stabilization phase.

### Modified Capabilities

None. Existing runtime capabilities remain governed by their own specs and
follow-up changes.

## Impact

- Affects planning and verification across:
  - `mist`
  - `mist-datasource`
  - `mist-deploy`
  - `mist-fe`
  - `mist-monitoring`
  - `mist-skills`
- References existing active changes:
  - `add-tdx-desktop-guard`
  - `refactor-tdx-python-datasource`
  - `align-tdx-qmt-datasource-contracts`
- Produces no direct code or deployment changes.
- Follow-up changes may later modify backend datasource behavior, datasource
  WebSocket behavior, deployment workflows, monitoring deployment, AstrBot
  operations, frontend UX, and test/tooling configuration.
