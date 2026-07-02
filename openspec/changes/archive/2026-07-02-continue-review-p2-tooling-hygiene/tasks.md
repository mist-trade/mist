## 1. Scope and Evidence

- [x] 1.1 Record selected review IDs: INFRA_REVIEW T3, D13, D14, T8;
      CODE_REVIEW L10.
- [x] 1.2 Create `evidence.md` with changed files and verification commands.

## 2. Backend Tooling Contracts

- [x] 2.1 Add failing contract checks for `.mjs` lint-staged coverage and
      tsconfig path/casing hygiene.
- [x] 2.2 Update `package.json` lint-staged and `tsconfig.json` to satisfy the
      contract.
- [x] 2.3 Run `node tools/test-ci-contracts.mjs` and `pnpm run typecheck`.

## 3. Datasource Repository Hygiene

- [x] 3.1 Add failing datasource hygiene tests for `.gitignore` cache entries
      and absence of a custom `event_loop` fixture.
- [x] 3.2 Update `.gitignore` and remove the deprecated fixture.
- [x] 3.3 Run the datasource hygiene test and an existing async datasource test.

## 4. Skills Index Lookup

- [x] 4.1 Add a failing `get_index_info` unit assertion that the backend call
      strips `.SH`/`.SZ`.
- [x] 4.2 Reuse `split_exchange_suffix` in `get_index_info.py`.
- [x] 4.3 Run the focused skills data-query tests.

## 5. Final Verification

- [x] 5.1 Run focused verification across all touched repositories.
- [x] 5.2 Run `openspec validate continue-review-p2-tooling-hygiene --strict`
      and `openspec validate --specs --strict`.
- [x] 5.3 Complete `evidence.md` and summarize residual risk.
