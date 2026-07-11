## Context

`BiService` currently assigns candidate Bis to two arrays, `confirmed` and
`pending`, and reconstructs the Phase A result by concatenating and sorting
them. A later valid candidate can move a newer time range into `confirmed`
while an older branch remains in `pending`. Because tail lookup always prefers
`pending`, the next merge can skip the newer confirmed interval.

The full CSI 300 snapshot demonstrates the failure. Before candidate step 126,
`206 -> 222 up(valid)` remains pending while the complete `222 -> 282` range is
already confirmed. Phase A then selects `206 -> 222`, `282 -> 283`, and
`283 -> 287` as if they were adjacent, eventually produces
`206 -> 302 up(valid)`, and retains eight valid child Bis inside that range.

Phase B already performs variable-length invalid-span reduction to a fixed
point. Phase A therefore needs one responsibility: consume candidates in time
order and completely apply the existing adjacent three-Bi rewrite rule.

## Goals / Non-Goals

**Goals:**

- Make Phase A a single chronological stack with no cross-array source state.
- Repeatedly reduce the adjacent top three Bis after each candidate push until
  the local rewrite reaches a fixed point.
- Preserve every unmergeable Valid and Invalid Bi in its original time
  position for Phase B.
- Make ordering and continuity structural invariants rather than properties
  repaired by a final sort.
- Reproduce the current CSI 300 overlap with a full repo-local fixture before
  changing production code.
- Preserve the public two-phase response and existing Phase B implementation.

**Non-Goals:**

- Change `canMergeThreeBis`, `canMergeTwoBis`, fenxing detection, wide-Bi
  validation, or range aggregation rules.
- Redesign Phase B or decide whether any remaining long Phase B span is
  semantically desirable.
- Add a runtime switch or retain the dual-array algorithm as a fallback path.
- Change the HTTP response shape or frontend phase selector.

## Decisions

### 1. Use one chronological stack

Candidates enter one `BiVo[]` in fenxing time order. Every Complete Bi on the
stack MUST end where the next Complete Bi starts. A successful reduction
replaces exactly the top three adjacent entries with one Bi spanning the first
start fenxing through the third end fenxing, so the replacement preserves the
same outer boundary.

Before a candidate is pushed, Phase A verifies that its start fenxing shares
the current Complete stack tail's end `middleIndex`. It repeats the boundary
checks across the top three immediately before a reduction. The push check
covers short and all-Valid stacks that never enter the merge branch; the merge
check protects the rewrite boundary itself.

This removes `BiSourceTag`, cross-array tail lookup, source-dependent removal,
and post-hoc time sorting. Keeping those concepts in one array with a commit
marker was rejected because it preserves the rollback branch complexity under
different names.

### 2. Reduce the top three to a local fixed point

After pushing each candidate, Phase A evaluates the stack top as follows:

```text
while stack has at least three entries:
  read bi1, bi2, bi3 from the top
  assert bi1.end == bi2.start and bi2.end == bi3.start
  stop when all three are Valid
  stop when canMergeThreeBis(bi1, bi2, bi3) is false
  replace the three with mergeThreeBis(bi1, bi3)
  revalidate the replacement
  continue with the new stack top
```

Each successful rewrite reduces the stack length by two, so termination is
structural and needs no iteration cap. A one-rewrite-per-candidate alternative
was rejected because it can leave a triple that Phase A's own rule still knows
how to reduce merely because the input ended at that point.

### 3. Never accept or merge non-adjacent Bis

Before every push and reduction, Phase A checks the `middleIndex` boundary
shared by each neighboring pair. A mismatch is an internal invariant failure
and MUST be surfaced instead of silently accepted, merged, or repaired by
sorting. Initial candidates are adjacent by construction, and replacing
adjacent top-three entries with their outer span preserves the invariant
inductively.

This directly prevents the CSI 300 `206 -> 222` branch from skipping the
already accepted `222 -> 282` interval.

### 4. Revalidate every replacement

`mergeThreeBis` continues to create a Bi with Unknown status. Phase A applies
the existing `isCandidateBiValid` predicate after each rewrite and stores the
replacement as Valid or Invalid before reconsidering the new stack top. An
Invalid replacement can therefore participate in another adjacent reduction.

### 5. Keep the Phase A/Phase B boundary explicit

Phase A stops only when its adjacent three-Bi rule cannot make further
progress. Phase B still receives the complete Phase A sequence and applies its
different variable-length span rule. The two phases can coincidentally produce
the same result for a dataset; this does not collapse their responsibilities.

Read-only simulation produced these counts:

| Dataset | Stack Phase A | Existing Phase B after stack Phase A |
|---|---:|---:|
| CSI 300 | 31 | 31 |
| ChiNext | 27 | 21 |
| Kweichow Moutai | 34 | 30 |
| Existing case 1 | 10 | 4 |
| Existing case 2 | 4 | 4 |

### 6. Make the full CSI 300 snapshot the first red test

The backend test suite will own a complete copy of the 388 merged-K CSI 300
input instead of importing a sibling frontend checkout or using a crop. The
first regression test will run the current implementation and prove that Phase
A contains eight overlapping valid pairs, including `206 -> 302` containing
`222 -> 228`. Production code changes begin only after that test fails for the
expected structural reason.

Focused unit tests then characterize repeated top-three reduction, all-valid
and unmergeable stop conditions, replacement revalidation, leading Invalid
preservation, continuity enforcement, and unfinished-tail behavior. Existing
Phase B real-data cases remain the compatibility boundary.

## Risks / Trade-offs

- **[Risk] Phase A output changes substantially for snapshots with dual-array
  rollback artifacts.** -> Regenerate phase-aware frontend snapshots only after
  backend structural and real-data tests pass, and review Phase A/Phase B
  counts explicitly.
- **[Risk] Local fixed-point reduction can make Phase A and Phase B identical
  for some inputs.** -> Treat equality as valid when no variable-length Phase B
  reduction remains; do not add artificial stopping rules for visual contrast.
- **[Risk] A full CSI 300 fixture increases repository size.** -> Store one
  canonical repo-local fixture and reuse shared hydration/assertion helpers;
  do not duplicate it across test files.
- **[Risk] An invariant exception can expose a previously hidden ordering
  defect.** -> Fail early with the offending index ranges and cover the error
  path in focused tests rather than silently returning corrupted structure.
- **[Risk] Phase B may still generate a long but structurally continuous Bi.**
  -> Keep Phase B semantics out of this change and evaluate such spans in a
  separate change after Phase A input is trustworthy.

## Migration Plan

1. Add the full CSI 300 fixture and structural regression; confirm RED against
   the dual-array implementation.
2. Add focused single-stack tests, including a cascading reduction performed
   after one candidate push.
3. Replace the dual-array Phase A path and remove obsolete bookkeeping.
4. Run focused Phase A, Phase B, Channel, typecheck, lint, and full backend
   tests.
5. Regenerate the phase-aware `mist-fe` snapshots and inspect `/chan-tests`
   without changing its API or rendering logic.

The backend refactor and regenerated fixtures remain separable rollback
boundaries. Reverting the backend change restores the previous algorithm;
reverting the fixture refresh restores the previous visual baseline.

## Open Questions

None. Remaining Phase B span semantics are explicitly deferred.
