## 1. Red Tests

- [x] 1.1 Add a focused merged-K fixture builder for Bi algorithm unit tests.
- [x] 1.2 Add failing tests for shared range aggregation usage in complete,
      merged, and unfinished Bi construction paths.
- [x] 1.3 Add or extend public `getBi` characterization coverage for the same
      fixture.
- [x] 1.4 Run the targeted Bi service tests and confirm the new assertions fail
      for the intended reason.

## 2. Implementation

- [x] 2.1 Add a Chan-local range aggregation helper or helper module.
- [x] 2.2 Refactor `buildBiFromFenxings`, `mergeTwoBis`, and `mergeThreeBis`
      to use the shared range aggregation boundary.
- [x] 2.3 Refactor `buildUnCompleteBi` to use the shared boundary while
      preserving previous-Bi extension semantics.
- [x] 2.4 Keep `removeBiByIndex` and invariant guard behavior unchanged.

## 3. Verification And Evidence

- [x] 3.1 Re-run targeted Bi service tests.
- [x] 3.2 Run focused Chan service tests that cover public consumers.
- [x] 3.3 Run `pnpm run typecheck`.
- [x] 3.4 Run `openspec validate continue-review-p2-chan-algorithm-hygiene --strict`.
- [x] 3.5 Run `git diff --check`.
- [x] 3.6 Add evidence mapping selected review IDs to changed files and
      verification commands.
