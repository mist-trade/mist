## Context

The backend Chan Bi implementation produces two ordered sequences: Phase A is
the candidate-preserving state-machine result and Phase B is the fixed-point
invalid-span reduction.  The regression console at `mist-fe/app/chan-tests`
currently consumes static `bi.json` arrays produced before that response shape
existed, then passes one Bi array to the shared `KPanel`.

The development proxy still reaches a legacy backend, so the review console
must remain reproducible from committed TDX snapshots rather than requiring a
new backend deployment.  The page is a diagnostic aid, not the production
live-chart experience.

## Goals / Non-Goals

**Goals:**

- Make both algorithm phases inspectable for every committed Chan test case.
- Preserve legacy snapshots during migration and keep a deterministic snapshot
  generation path.
- Let a reviewer compare the two phases without changing shared chart
  rendering behavior.
- Make the Phase A leading-invalid preservation and Phase B long-span merge
  visible in the Shanghai regression case.

**Non-Goals:**

- Changing `KPanel`, ECharts series, or the public live `/k` chart contract.
- Adding a live refresh control, a backend deployment requirement, or any
  frontend implementation of Chan merging.
- Changing Phase A/Phase B algorithm rules, adding nested merges, or modifying
  the `mist-skills` consumer.

## Decisions

### Canonical snapshots carry both Bi phases

`bi.json` SHALL be written as `{ phaseA: Bi[], phaseB: Bi[] }`.  The snapshot
loader will normalize a legacy array as both phases, while object payloads must
contain arrays for both keys.

This makes the on-disk contract match the current backend result and permits a
gradual fixture migration.  Requiring both object fields avoids silently
rendering a partial or malformed algorithm result.  Storing two separate
files was rejected because a single data boundary keeps a test case atomic and
would make the generator and loader easier to drift apart.

### One chart has a selectable phase

`ChanTestsPage` will keep phase selection in local state, default it to
`phaseB`, and pass only the selected `IFetchBi[]` to `KPanel`.  It will expose
two accessible buttons, `Phase A 原始` and `Phase B 归约`, using
`aria-pressed` for the active state.  Changing test cases preserves the chosen
phase.

One chart makes the comparison compact and avoids modifying the production
chart component.  Two charts or dual overlays were rejected because they would
either duplicate a costly chart or expand KPanel's surface beyond this review
tool.

### Counts make the reduction measurable

Snapshot metadata will keep `biCount` as the Phase B count for compatibility,
and add `phaseABiCount` and `phaseBBiCount`.  The statistics panel will show
both counts, falling back to `biCount` when phase-specific legacy metadata is
absent.

This ensures the reduction stays visible even when the selected overlay is
switched.  Inferring counts only at render time was rejected because retained
metadata remains useful for inspecting snapshot provenance and generator
output.

### The generator normalizes backend shapes, with a deterministic local path

The snapshot generator will accept either legacy array or phase-aware API
responses and always write the canonical object.  It should prefer a locally
running current Chan backend configured through `SNAPSHOT_BACKEND_URL`.  If a
database-backed endpoint is unavailable, the supported fallback is to
recalculate only the Bi phases from the committed `merge-k.json` using the
current `BiService`; all other snapshot layers remain unchanged.

This keeps the console useful before deployment.  Falling back to the remote
legacy response alone was rejected because it cannot demonstrate the new
algorithm.

## Risks / Trade-offs

- [Existing snapshot formats vary] → Normalize legacy arrays in one loader and
  test both formats; reject malformed objects through the existing unavailable
  snapshot path.
- [A local backend lacks database data] → Use the deterministic merge-K
  fallback only for the Bi phase data and retain committed input layers.
- [The visual difference is subtle] → Show both phase counts and assert the
  known Shanghai Phase A/Phase B endpoints in fixtures and tests.
- [Selector changes could regress the chart] → Keep KPanel's prop shape
  unchanged and test which Bi array the page provides it.

## Migration Plan

1. Add loader and generator support that accepts legacy arrays and canonical
   phase objects.
2. Regenerate the registered fixtures into canonical form using the current
   backend or deterministic local algorithm path.
3. Add the selector and phase-specific statistics, with Phase B as the
   default.
4. Verify focused unit/component tests, typecheck, lint, build, and the local
   `/chan-tests` browser view.

Rollback is isolated to the frontend preview branch: reverting the snapshot
and page commits restores the legacy array view.  It does not require reverting
the backend Phase A preservation or Phase B helper commits.

## Open Questions

None.  The approved review behavior is snapshot-driven with Phase B selected
by default.
