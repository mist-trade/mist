## 1. Scope and Evidence Ledger

- [x] 1.1 Record selected review IDs: CODE_REVIEW L5; INFRA_REVIEW D10,
      D11, S9, 共性2; CODE_SMELL_REVIEW M1.5, O1.1.
- [x] 1.2 Create `evidence.md` with columns for review ID, changed files, and
      test or substitute verification command.

## 2. Datasource Dependency Hygiene

- [x] 2.1 Add a failing metadata test proving `mist-datasource`
      `project.dependencies` excludes dev/test/lint tools and exposes them via
      dev-only dependency metadata.
- [x] 2.2 Move datasource `pytest`, `pytest-asyncio`, `httpx`, and `ruff`
      out of runtime dependencies into dev-only metadata, then update the lock.
- [x] 2.3 Run the datasource metadata test and dependency lock check.

## 3. Skills Locking

- [x] 3.1 Add or reuse a repository-local verification proving
      `mist-skills` has a lock file in sync with `pyproject.toml`.
- [x] 3.2 Generate and commit `mist-skills/uv.lock`.
- [x] 3.3 Run `mist-skills` lock verification and pytest.

## 4. Backend Package Script Contract

- [x] 4.1 Add a failing backend package contract test proving `test:e2e`
      cannot point at a missing Jest config.
- [x] 4.2 Remove or correct the fake `test:e2e` script while preserving normal
      unit/CI test scripts.
- [x] 4.3 Run the package contract test.

## 5. EF Configuration

- [x] 5.1 Add failing Jest tests proving `EastMoneySource` uses
      `AKTOOLS_BASE_URL` when configured and local default when absent.
- [x] 5.2 Inject `ConfigService` into `EastMoneySource` and use the configured
      base URL when creating the Axios client.
- [x] 5.3 Run the East Money source tests.

## 6. Chan Bi Removal Bug

- [x] 6.1 Add a failing regression test proving `removeBiByIndex` removes one
      middle item and preserves later items.
- [x] 6.2 Change `removeBiByIndex` to call `splice(index, 1)`.
- [x] 6.3 Run the Bi service tests.

## 7. Final Verification

- [x] 7.1 Run focused backend tests for package contract, EF source, and Bi
      service.
- [x] 7.2 Run focused datasource and skills tests/checks.
- [x] 7.3 Run `openspec validate continue-review-p1-cleanup --strict` and
      `openspec validate --specs --strict`.
- [x] 7.4 Complete `evidence.md` and summarize any residual risk.
