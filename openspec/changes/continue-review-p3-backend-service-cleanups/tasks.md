## 1. Red Contracts And Scope Evidence

- [x] 1.1 Add static contract checks for the selected Batch 2 shape cleanups
      before implementing them.
- [x] 1.2 Add or extend focused Jest coverage for touched Chan/service behavior
      before changing behavior-adjacent code.
- [x] 1.3 Run focused contracts/tests and record expected red failures.
- [x] 1.4 Create `evidence.md` mapping all 30 selected review IDs.

## 2. Backend/Chan Quick Cleanups

- [x] 2.1 Remove redundant `indicator.service.ts` `as number` assertions where
      type guards already narrow the values.
- [x] 2.2 Fix stale or misleading Chan comments and JSDoc for selected `R/C/B`
      items.
- [x] 2.3 Remove or rename ambiguous Chan helpers/return tags where the change
      is local and testable.
- [x] 2.4 Extract or reuse small backend helpers for repeated format,
      validation, date parsing, or DTO shapes when scoped to touched files.
- [x] 2.5 Confirm Batch 1 already-closed IDs (`R1.5`, `M1.4`, `C1.2`) remain
      covered and do not duplicate implementation.

## 3. Deferred Or Already-Closed Decisions

- [x] 3.1 Record `H2`, `D1.4`, `P1.1`, `T1.5`, `B1.4`, `B1.6`, `N1.1`, and
      `M1.6` as deferred when they require architecture/schema/DI decisions.
- [x] 3.2 Record any selected item that is already satisfied by Batch 1 with a
      pointer to the prior change evidence.
- [x] 3.3 Record any selected item moved to Batch 3/4/5 because it belongs to
      datasource, frontend, deploy, monitoring, or skills.

## 4. Verification And Completion

- [x] 4.1 Re-run focused Jest suites and `node tools/test-ci-contracts.mjs`.
- [x] 4.2 Run `pnpm run lint:check` and `pnpm run typecheck`.
- [x] 4.3 Run `openspec validate continue-review-p3-backend-service-cleanups --strict`.
- [x] 4.4 Confirm git status separates Batch 2 changes from unrelated
      production-baseline files and update `evidence.md` with final results.
