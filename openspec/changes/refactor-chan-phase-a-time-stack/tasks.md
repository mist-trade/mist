## 1. Establish the TDD regression boundary

- [ ] 1.1 Copy the complete 388-entry CSI 300 2024-2025 merged-K input into one repo-local backend fixture and add a shared hydration helper for real snapshot tests.
- [ ] 1.2 Add a full-snapshot Phase A integrity test that reports overlapping index ranges, asserts the `206 -> 302` / `222 -> 228` witness, and run it against the dual-array implementation to record the expected RED failure before production edits.
- [ ] 1.3 Add focused RED tests for cascading top-three reduction, all-Valid stop, unmergeable-Invalid stop, replacement revalidation, leading Invalid preservation, discontinuous-push and discontinuous-reduction failures, and trailing UnComplete behavior.

## 2. Replace Phase A with the chronological stack

- [ ] 2.1 Refactor candidate processing to push each candidate onto one chronological stack and repeatedly reduce the adjacent top three until fewer than three remain, all three are Valid, or the existing three-Bi predicate rejects them.
- [ ] 2.2 Revalidate every merged replacement, enforce shared `middleIndex` boundaries before both candidate push and reduction, and include offending index ranges in any invariant error.
- [ ] 2.3 Remove `BiSourceTag`, `confirmed`/`pending` tail selection, source-dependent removal, and final Complete-Bi sorting while preserving existing unfinished-tail construction.
- [ ] 2.4 Keep `mergeBiSegments`, the Phase B operation callbacks, `{ phaseA, phaseB }`, and Channel consumption of Phase B behaviorally unchanged.

## 3. Verify backend behavior

- [ ] 3.1 Run the full CSI 300 regression and confirm Phase A Complete Bis are contiguous, valid ranges do not overlap, and no mergeable adjacent three-Bi group remains.
- [ ] 3.2 Run `npx jest --runInBand --watchman=false --testPathPattern="bi-merge-cases"` and confirm all six existing real-data Phase B tests pass with their current long-down and long-up endpoints.
- [ ] 3.3 Run `npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a|bi-phase-b-merge|bi.service.spec|channel.service.spec"` and resolve any focused regression without changing the approved merge predicates.
- [ ] 3.4 Run `pnpm run typecheck`, `pnpm run lint:check`, and `pnpm run test:ci` in the backend repository.

## 4. Refresh and inspect phase-aware frontend fixtures

- [ ] 4.1 Run `pnpm run snapshots:generate` in `mist-fe` against the verified backend and review Phase A/Phase B count changes for CSI 300, ChiNext, and Kweichow Moutai before accepting the generated files.
- [ ] 4.2 Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm run test:ci` in `mist-fe`.
- [ ] 4.3 Inspect `/chan-tests` for all three reported datasets, confirming the Phase A overlap artifacts are absent and recording any remaining structurally continuous Phase B long span as separate follow-up evidence rather than changing Phase B in this change.

## 5. Validate and hand off the change

- [ ] 5.1 Run `openspec validate refactor-chan-phase-a-time-stack --strict` and record the backend, frontend, and visual verification evidence in the change artifacts.
- [ ] 5.2 Review the final diff to ensure unrelated roadmap, BigQMT, and archived preview work remains untouched and that backend logic and regenerated frontend fixtures are separable rollback boundaries.
