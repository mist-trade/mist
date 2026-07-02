# Tasks: Harden release CI

## 1. Select scope and tests

- [x] 1.1 Record selected review IDs C1, I1, I2, I3, I5, I8, D9, and 共性1.
- [x] 1.2 Add a CI contract test that fails against the current weak gates.
- [x] 1.3 Verify the CI contract test fails before implementation.

## 2. Implement backend release and Docker gates

- [x] 2.1 Add backend `lint:check`, `typecheck`, `test:ci`, and
      `ci:contracts` scripts.
- [x] 2.2 Update backend build, Docker, and release workflows to run validation
      before packaging or publishing.
- [x] 2.3 Add `production-release` environment approval to the release job.
- [x] 2.4 Align backend package metadata and workflows on Node 24.
- [x] 2.5 Stop tracking `.env.development` and `.env.production` while keeping
      `.env.example`.

## 3. Implement frontend and missing repository CI

- [x] 3.1 Add frontend Node 24 metadata and CI scripts.
- [x] 3.2 Add frontend Docker workflow validation before image publishing.
- [x] 3.3 Add datasource CI for Ruff and non-live pytest.
- [x] 3.4 Add monitoring CI for gofmt/vet/test and Python contract tests.
- [x] 3.5 Add skills CI for pytest with dev dependencies.

## 4. Verify and record evidence

- [x] 4.1 Run `node tools/test-ci-contracts.mjs`.
- [x] 4.2 Run backend local validation commands or record any pre-existing
      failures that prevent a full green gate.
- [x] 4.3 Run repository-local validation for frontend, datasource, monitoring,
      and skills where dependencies are available.
- [x] 4.4 Record `review-id -> changed files -> test/verification command` in
      this change summary before marking selected IDs complete.
