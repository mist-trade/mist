## Why

Phase A currently splits candidates between `confirmed` and `pending`, which
can leave an older pending branch behind newer confirmed Bis. The full CSI 300
snapshot proves that the state machine can then select non-contiguous Bis,
produce a `206 -> 302` valid Bi, and retain eight valid Bis inside that same
range.

Now that Phase B owns residual invalid-span reduction, Phase A can use one
strictly ordered time stack and complete its own adjacent three-Bi reductions
without cross-array rollback state.

## What Changes

- Replace the Phase A `confirmed`/`pending` state machine with one chronological
  stack of complete candidate Bis.
- After each candidate is pushed, repeatedly reduce the top three adjacent Bis
  while at least one is Invalid and the existing three-Bi merge predicate
  succeeds.
- Stop local reduction when the stack has fewer than three Bis, all top three
  Bis are Valid, or the top three cannot merge.
- Revalidate every merged Bi and immediately reconsider the new stack top until
  Phase A reaches a local fixed point.
- Enforce index continuity before each three-Bi reduction and preserve every
  unmergeable Valid or Invalid Bi in time order for Phase B.
- Remove the dual-array source bookkeeping and final time sort made unnecessary
  by the stack invariant.
- Add a full CSI 300 merged-K regression fixture that first reproduces the
  current Phase A overlap, plus focused stack-reduction and existing Phase B
  regression coverage.
- Keep the public `{ phaseA, phaseB }` result shape and the standalone Phase B
  helper unchanged.

## Capabilities

### New Capabilities

- `chan-bi-phase-a-reduction`: Defines Phase A chronological-stack invariants,
  adjacent top-three fixed-point reduction, retained Invalid input for Phase B,
  and real-snapshot regression requirements.

### Modified Capabilities

None.

## Impact

- Backend implementation and focused tests under
  `apps/mist/src/chan/services/bi.service.ts` and its test fixtures.
- Phase-aware Chan snapshots in `mist-fe` will need regeneration after the
  backend behavior changes; no frontend API or rendering contract changes.
- No new runtime dependency, feature flag, database change, or HTTP response
  change.
