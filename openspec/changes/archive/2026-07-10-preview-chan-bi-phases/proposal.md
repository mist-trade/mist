# Change: Preview Chan Bi Phase A and Phase B results

## Why

The Chan Bi merge fix now produces both the unreduced Phase A candidates and
the fixed-point Phase B result, but `/chan-tests` still renders a single legacy
snapshot.  Reviewers therefore cannot see whether the new reduction preserves
the leading invalid Bi or how it changes the final overlay.

## What Changes

- Store Chan test snapshots as a phase-aware Bi payload containing `phaseA` and
  `phaseB`, while treating existing array snapshots as the same array for both
  phases during migration.
- Add a Phase A / Phase B selector to `/chan-tests`, defaulting to Phase B, and
  display the count for each phase alongside the existing test statistics.
- Update the snapshot-generation path to preserve phase-aware Chan Bi API
  responses and record phase-specific counts without changing the K-line,
  merged-K, fenxing, or channel fixtures.
- Cover normalization, phase selection, and the two known regression outcomes
  so the visual test console remains a reliable review aid.

## Capabilities

### New Capabilities

- `chan-bi-phase-preview`: Phase-aware Chan regression snapshots and an
  inspectable `/chan-tests` overlay selection experience.

### Modified Capabilities

None. This is a regression-review surface separate from the live `/k` product
viewer; it does not change its user-facing requirements.

## Impact

- Affected repositories: `mist` (OpenSpec ownership) and `mist-fe` (snapshot
  loader, snapshot generator, `/chan-tests` page, and focused tests).
- The Chan Bi API's existing `{ phaseA, phaseB }` response is consumed by the
  development snapshot workflow; no production route, database schema, or
  KPanel public interface changes are introduced.
- Existing array-form snapshot fixtures remain readable during the transition.
