## 1. Red Tests And Scope Evidence

- [x] 1.1 Add failing static contract checks for `JudgeTrendVo`,
      `ERROR_MESSAGES.BI_INVALID_DIRECTION`, selected stale DEBUG comments,
      `ChannelService.getChannel` returning `offsetIndex`, stale MCP
      unused-variable disables, and selected `Record<string, any>` boundaries.
- [x] 1.2 Add or extend focused Jest tests for the retained `UtilsService`
      HTTP helper and the public channel path that should not expose or rely on
      `offsetIndex`.
- [x] 1.3 Run focused contracts/tests and record the expected red failures.
- [x] 1.4 Create `evidence.md` with all 30 selected review IDs and initial
      classification columns.

## 2. Dead Code And Small Backend Cleanup

- [x] 2.1 Delete the unused `JudgeTrendVo` active source file after confirming
      no active imports remain.
- [x] 2.2 Remove `ERROR_MESSAGES.BI_INVALID_DIRECTION` and keep constants tests
      or typecheck green.
- [x] 2.3 Remove selected stale DEBUG/comment residue from active Chan source.
- [x] 2.4 Remove the unused `offsetIndex` return field from
      `ChannelService.getChannel` and preserve channel behavior.
- [x] 2.5 Remove unused `UtilsService` helpers after confirming
      `createAxiosInstance` remains the only actively used service method.

## 3. Scoped Style And Type Cleanup

- [x] 3.1 Remove selected stale MCP `eslint-disable-next-line
      @typescript-eslint/no-unused-vars` comments by using underscore-prefixed
      parameter names or deleting unused imports.
- [x] 3.2 Confirm selected `BaseMcpToolService` `Record<string, any>`
      boundaries are already guarded as `Record<string, unknown>`.
- [x] 3.3 Apply small safe backend style cleanups from selected R/N/C items when
      they are in touched files and covered by focused tests.

## 4. Decision Evidence For Deferred Or Already-Closed Items

- [x] 4.1 Record CODE_REVIEW M4 and INFRA_REVIEW T10/T11 as already closed by
      archived backend test-hygiene evidence.
- [x] 4.2 Record CODE_REVIEW H1, M3, L2 and CODE_SMELL D1.4, P1.1, T1.5 as
      deferred with reasons and later-batch ownership.
- [x] 4.3 Record remaining selected merge-fix IDs as implemented, already
      satisfied, or intentionally left for Batch 2 when they require broader
      Chan/service refactors.

## 5. Verification And Completion

- [x] 5.1 Re-run focused Jest suites and `node tools/test-ci-contracts.mjs`.
- [x] 5.2 Run `pnpm run lint:check` and `pnpm run typecheck`.
- [x] 5.3 Run the smallest relevant Jest CI command for touched backend files.
- [x] 5.4 Run `openspec validate continue-review-p3-backend-quick-wins --strict`.
- [x] 5.5 Confirm git status excludes unrelated production-baseline evidence
      from this batch and update `evidence.md` with final commands/results.
