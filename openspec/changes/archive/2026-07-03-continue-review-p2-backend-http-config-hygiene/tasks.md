## 1. Tests First

- [x] 1.1 Add or update focused EF and TDX unit tests that expect the shared
      datasource HTTP timeout while preserving configurable base URLs.
- [x] 1.2 Add a failing CI contract check for `createAxiosInstance` returning
      `AxiosInstance` instead of `any`.
- [x] 1.3 Add a failing CI contract check that EF/TDX source Axios setup uses a
      shared datasource timeout constant rather than literal `30000`.
- [x] 1.4 Run focused tests/contracts and confirm the new checks fail against
      the current repository state.

## 2. Backend HTTP Config Hygiene

- [x] 2.1 Export a shared backend datasource HTTP timeout constant.
- [x] 2.2 Update `EastMoneySource` and `TdxSource` to use the shared timeout.
- [x] 2.3 Type `UtilsService.createAxiosInstance` as returning `AxiosInstance`.
- [x] 2.4 Keep existing EF/TDX base URL defaults and request behavior unchanged.

## 3. Verification

- [x] 3.1 Run focused EastMoneySource, TdxSource, and UtilsService-related
      checks.
- [x] 3.2 Run `node tools/test-ci-contracts.mjs`.
- [x] 3.3 Run lint, typecheck, and relevant Jest CI checks.
- [x] 3.4 Record review-ID to changed-file to verification-command evidence.

## 4. Completion

- [x] 4.1 Run `openspec validate continue-review-p2-backend-http-config-hygiene --strict`.
- [x] 4.2 Commit the completed batch without staging unrelated baseline
      evidence.
