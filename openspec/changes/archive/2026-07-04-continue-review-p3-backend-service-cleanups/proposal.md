## Why

Batch 1 closed the easiest backend P3 quick wins and established the evidence
format. Batch 2 should continue through backend-local Chan/service cleanup
items that are small enough to verify without changing datasource protocols,
database schema, or frontend behavior.

This batch selects 30 P3 review IDs:

- CODE_REVIEW: H2, L3
- CODE_SMELL_REVIEW: D1.4, R1.4, R1.5, R1.6, R1.8, P1.1, P1.2, P1.3, P1.5,
  T1.5, M1.2, M1.4, M1.6, B1.2, B1.4, B1.6, N1.1, N1.2, N1.4, N1.5,
  C1.1, C1.2, C1.3, C1.4, U1.3, O1.2, O1.4, O1.5

## What Changes

- Implement safe backend/Chan service cleanups in touched files, especially
  redundant assertions, repeated helpers, stale comments, naming clarity, and
  low-risk constants.
- Add or extend static contract checks where a P3 finding can regress without a
  product behavior change.
- Keep explicit evidence for selected items that are already closed by Batch 1
  or intentionally deferred because they require schema, DI, or architecture
  work.

## Validation

- Focused Jest tests for touched Chan/backend services.
- `node tools/test-ci-contracts.mjs`.
- `pnpm run lint:check`.
- `pnpm run typecheck`.
- `openspec validate continue-review-p3-backend-service-cleanups --strict`.
