## Context

The current production shape is a hybrid Windows runtime:

- Docker Desktop runs MySQL, `mist-backend`, `chan-api`, `mist-fe`, and
  `web-gateway`.
- The Windows host runs `mist-tdx-datasource` as a WinSW service.
- The backend and Chan containers reach the datasource through
  `http://host.docker.internal:9001`.
- The browser enters through nginx, normally `http://www.moyui.mist/`, with
  `/api/mist/*` and `/api/chan/*` proxied through the same origin.
- Datasource recovery remains separate from normal Docker deployment.

Local tests can prove scripts and code paths, but they do not prove the current
Windows API machine is healthy. This change defines the evidence required to
call one deployed stack a known-good production baseline.

## Goals / Non-Goals

**Goals:**

- Define the evidence ledger for one known-good production deployment.
- Pin every repository and image ref used by that deployment.
- Capture deploy, health, smoke, backup restore, diagnostics, and Mac-side
  reachability evidence.
- Preserve enough evidence for later child specs to compare regressions against
  the baseline.
- Keep normal datasource management distinct from explicit TDX terminal
  recovery in the evidence.

**Non-Goals:**

- Trigger deployment automatically from this spec.
- Change deployment workflows, scripts, application code, datasource code, or
  frontend code.
- Validate new realtime behavior beyond the smoke checks already available.
- Replace observability or alerting work owned by a later monitoring child spec.

## Decisions

### Decision 1: Evidence is the deliverable

The implementation work for this change is to gather and record evidence, not
to change runtime code. The primary output should be a baseline evidence file
under this change, for example:

```text
openspec/changes/verify-mist-production-baseline/evidence/YYYY-MM-DD-production-baseline.md
```

The evidence file should contain command names, workflow run identifiers,
selected output snippets, refs, image tags, paths to generated backups and
diagnostics, and blockers if any check cannot complete.

### Decision 2: Refs must be immutable where possible

Production evidence must use commit SHAs and image tags that can be traced back
to exact commits. `latest` can be recorded only as an observed tag, not as the
baseline identity.

This makes rollback and later regression comparison possible.

### Decision 3: Windows and Mac evidence are both required

Windows-local success proves the API machine runtime, but it does not prove the
browser and operator path from the Mac. The baseline requires both:

- Windows runner or Windows-local deployment/health evidence.
- Mac-side gateway probes over LAN or configured local DNS/hosts.

### Decision 4: Datasource smoke stays opt-in for state-changing checks

The default runtime smoke should cover health, providers, bars, snapshots,
sector paths, calendar/security paths, and WebSocket ping/pong. Live
subscription-changing checks such as `-RequireLiveQuote` must be explicitly
recorded with whether `-AllowWebSocketSubscriptionChange` was used.

### Decision 5: Backup restore rehearsal is part of readiness

A deploy that creates a backup but never rehearses restore is not a full
production baseline. The baseline requires a non-production restore rehearsal
through the existing temporary MySQL container path.

## Risks / Trade-offs

- Windows machine is unreachable -> record the blocker and do not mark the
  baseline complete.
- GitHub Actions succeeds but LAN access fails -> keep the baseline incomplete
  until Mac-side probes pass or the network/hosts issue is explicitly accepted.
- Smoke checks mutate TDX subscriptions -> require opt-in flags and record
  whether the backend currently owns the subscription leader.
- Backup restore rehearsal fails -> keep deployment evidence but reject the
  known-good baseline until restore risk is resolved.
- Evidence file contains secrets -> redact tokens, passwords, cookies, and
  machine-local `.env` values before committing.

## Migration Plan

This change has no runtime migration. The expected application flow is:

1. Select backend, frontend, datasource, deploy, and optional monitoring refs.
2. Run or inspect the relevant image build outputs.
3. Run `Deploy Windows Mist Stack` with pinned backend and frontend tags.
4. Capture deploy output, backup path, diagnostics path, and health output.
5. Run datasource runtime smoke.
6. Run MySQL restore rehearsal against the selected backup.
7. Run Mac-side gateway and API probes.
8. Write the evidence file and update tasks.

Rollback remains the existing deployment rollback path: use previous backend
and frontend image tags for app containers, restore database manually from the
recorded backup only after operator decision, and do not reinstall or remove
`mist-tdx-datasource` during app rollback.

## Open Questions

- Whether monitoring refs should be required for the first baseline or recorded
  as optional until the monitoring deployment child spec is complete.
- Whether evidence should be copied into a permanent `docs/operations` location
  at archive time or kept in archived OpenSpec artifacts only.
- Which LAN hostname should be canonical in the evidence: raw Windows IP,
  `www.moyui.mist`, or both.
