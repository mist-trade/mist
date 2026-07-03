## Context

The selected Batch 2 IDs are still backend-centered, but they are less uniform
than Batch 1. Several are legitimate quick cleanups in Chan services and MCP
helpers. Others are P3 deferrals in the inventory itself (`H2`, `D1.4`, `P1.1`,
`T1.5`, `B1.4`, `B1.6`, `N1.1`, `M1.6`) and should be documented instead of
forced into risky schema or architecture churn.

## Decisions

1. **Prefer small, guarded cleanup over broad rewrites.**
   For Chan/service files, remove redundant helpers, unclear comments, repeated
   format helpers, and unnecessary assertions only when the surrounding tests
   and typecheck cover the change.

2. **Do not force deferred P3 architecture decisions.**
   Cross-app source moves, unused entity directories, collector base classes,
   websocket DI lifecycle, enum/schema migrations, and MQMT route decisions
   remain explicit deferrals unless the current code already proves a safe
   deletion.

3. **Use static contracts for shape-only findings.**
   Where a finding is about a repeated helper, literal string, stale comment, or
   duplicate DTO shape, extend `tools/test-ci-contracts.mjs` so the cleanup
   stays guarded.

4. **Do not touch Batch 1 production-baseline user changes.**
   The existing dirty `docs/production-baseline-verification.md` and rerun
   evidence remain out of scope.

## Risks

- Chan internals are algorithmic and easy to subtly change. Keep behavior
  changes local and covered by focused tests.
- Some P3 findings are style-level, so tests may not fail naturally. Static
  contracts make the expected shape explicit.
- Reusing Batch 1 evidence is acceptable only for IDs that Batch 1 actually
  implemented, such as `R1.5`, `M1.4`, and `C1.2`.
