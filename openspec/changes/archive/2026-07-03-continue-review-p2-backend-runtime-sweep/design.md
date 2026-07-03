## Context

The selected findings all live in the NestJS backend and can be verified with
Jest, typecheck, and static contracts. Some items are direct one-line risks
(`ISourceFetcher<any>`, `String(...) as unknown as Period`, nullable defaults),
while others are duplication/refactor risks that need contract checks to keep
the boundary from drifting back.

## Goals / Non-Goals

**Goals:**

- Close exactly the selected 12 backend P2 review IDs with evidence.
- Keep runtime behavior compatible unless the reviewed item describes a bug.
- Prefer local helper extraction over broad architecture changes.
- Add tests or contract checks for every review ID in this batch.

**Non-Goals:**

- Do not split the large Chan services into many files in this sweep.
- Do not change Python datasource provider types or routes.
- Do not alter frontend, deploy, monitoring, or skills repositories.
- Do not introduce a database migration; EF extension defaults are TypeScript
  semantics and schema metadata only.

## Decisions

1. **Use static contracts for structural P2 items.**
   Items such as `R1.9`, `P1.4`, and `T1.1` are best proven by preventing the
   exact weak pattern from returning. `tools/test-ci-contracts.mjs` already owns
   backend invariants, so this batch adds a `assertBackendRuntimeSweep` section.

2. **Keep period mapping in `PeriodMappingService`.**
   TDX WebSocket currently has local string parsing for realtime bar periods.
   Add a helper on `PeriodMappingService` to reverse source format back to
   `Period`, and use it from the WebSocket bridge. This closes the duplicate
   mapping risk without introducing a new global mapper.

3. **Refactor without changing data shapes.**
   MCP K-line responses, WebSocket saved KData, and collector success/error
   behavior should stay byte-for-byte compatible at the public boundary. Tests
   focus on existing payload shape plus new helper guarantees.

4. **Guard Chan invariants at merge boundaries.**
   The Bi algorithm can still use the same state machine. The risk is hidden
   `!` assumptions when merge helpers receive incomplete Bi values. Add a small
   assertion helper and tests that prove incomplete inputs fail with a clear
   invariant error instead of generic null dereferences.

## Risks / Trade-offs

- This is a larger backend batch, so contract tests are intentionally narrow and
  review-ID scoped. Broad algorithmic rewrites are deferred.
- Some cleanup is structural, so tests prove both behavior and absence of known
  weak patterns. This can be slightly brittle if files move, but that is
  acceptable for a review-remediation contract.
