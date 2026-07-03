## Context

`BiService` owns raw fenxing detection, alternating fenxing selection,
candidate Bi construction, rollback state-machine handling, Bi merging, width
checks, and unfinished Bi construction in one file. The current implementation
is working and already has a regression test for `removeBiByIndex`, but the
same merged-K range statistics are still hand-built in several paths:
`buildUnCompleteBi`, `mergeTwoBis`, `mergeThreeBis`, and
`buildBiFromFenxings`.

This batch should make the algorithm easier to reason about without changing
the public Chan output contract.

## Goals / Non-Goals

**Goals:**

- Add tests before production code changes for the selected review IDs.
- Extract the repeated range aggregation into one reusable boundary.
- Keep candidate, merge-two, merge-three, and unfinished-Bi construction using
  the same range statistics semantics.
- Preserve current public `getBi` and `getFenxings` output behavior.
- Reduce `BiService` complexity locally without trying to redesign the whole
  Chan algorithm.

**Non-Goals:**

- Do not rewrite the Chan algorithm or change its trading semantics.
- Do not split every private method out of `BiService` in this batch.
- Do not change `ChanService`, controller routes, DTOs, persistence entities, or
  frontend consumers.
- Do not revive archived exploratory Chan tests.

## Decisions

### Decision 1: Start with behavior characterization

The first tests should assert stable public and helper-level behavior using
small in-memory merged-K fixtures. This is safer than immediately extracting
logic from a large algorithm file because it proves the refactor preserves
observable Bi fields such as `highest`, `lowest`, `originIds`,
`originData`, `independentCount`, and fenxing endpoints.

Alternative considered: rely on the existing broad Chan fixture tests only.
Those tests are useful but too large to identify a range-aggregation regression
quickly.

### Decision 2: Extract range aggregation, not the full state machine

The duplicated calculation is narrow and high-confidence: slice merged-K data,
compute highest/lowest, collect unique origin IDs/data, and count independent
raw K lines. Pulling that into a helper gives `D1.7` a concrete fix while
keeping the rollback state machine in place.

Alternative considered: extract a full `BiStateMachine` class. That may be a
later cleanup, but it would increase review risk in this P2 batch.

### Decision 3: Keep the helper local to Chan

The helper should live under the Chan service area and use existing `KVo`,
`MergedKVo`, and `FenxingVo` types. No shared library promotion is needed until
another module needs the same algorithm primitive.

Alternative considered: move the helper to `libs/utils`. That would create a
shared abstraction before there is a second consumer.

## Risks / Trade-offs

- Range semantics can be subtly algorithmic -> cover candidate, merge, and
  unfinished construction with focused tests before refactoring.
- Private-method tests can be brittle -> use them only for internal algorithm
  invariants that have no public seam yet, and keep public `getBi` coverage as
  the higher-level guard.
- File size may remain large after this batch -> acceptable; the goal is a
  meaningful first boundary, not a broad rewrite.
