## 1. Contract Tests First

- [x] 1.1 Add failing unit tests for CollectorService Logger warning, success, and failure paths.
- [x] 1.2 Add failing unit test for DataSourceService invalid-default fallback Logger warning.
- [x] 1.3 Add failing CI contract check that selected production files do not contain `console.*`.
- [x] 1.4 Run focused tests/contracts and confirm they fail against the current repository state.

## 2. Backend Logging Hygiene

- [x] 2.1 Replace CollectorService production `console.*` calls with a class-scoped NestJS Logger.
- [x] 2.2 Replace DataSourceService fallback `console.warn` with a class-scoped NestJS Logger.
- [x] 2.3 Keep existing collection counts, fallback behavior, and error rethrow semantics unchanged.

## 3. Verification

- [x] 3.1 Run focused CollectorService and DataSourceService unit tests.
- [x] 3.2 Run `node tools/test-ci-contracts.mjs`.
- [x] 3.3 Run lint, typecheck, and relevant Jest CI checks.
- [x] 3.4 Record review-ID to changed-file to verification-command evidence.

## 4. Completion

- [x] 4.1 Run `openspec validate continue-review-p2-backend-logging-hygiene --strict`.
- [x] 4.2 Commit the completed batch.
