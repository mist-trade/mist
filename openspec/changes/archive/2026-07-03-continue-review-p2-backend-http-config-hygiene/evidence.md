# Evidence: continue-review-p2-backend-http-config-hygiene

| Review ID | Changed files | Test / verification command |
|---|---|---|
| CODE_REVIEW M2 | `mist/apps/mist/src/sources/east-money/east-money-source.service.ts`, `mist/apps/mist/src/sources/east-money/east-money-source.service.spec.ts` | Existing red proof came from the P1 cleanup; this batch preserved and reran the focused regression. Green: `pnpm jest apps/mist/src/sources/east-money/east-money-source.service.spec.ts apps/mist/src/sources/tdx/tdx-source.service.spec.ts libs/utils/src/utils.service.spec.ts --runInBand --watchman=false` -> 32 passed; `pnpm run typecheck` -> passed. |
| CODE_SMELL_REVIEW T1.2 | `mist/libs/utils/src/utils.service.ts`, `mist/libs/utils/src/utils.service.spec.ts`, `mist/tools/test-ci-contracts.mjs` | Red: `node tools/test-ci-contracts.mjs` failed with `UtilsService must import AxiosInstance from axios`. Green: `node tools/test-ci-contracts.mjs` -> passed; `pnpm run typecheck` -> passed; focused Jest -> 32 passed. |
| CODE_SMELL_REVIEW M1.3 | `mist/apps/mist/src/sources/constants.ts`, `mist/apps/mist/src/sources/east-money/east-money-source.service.ts`, `mist/apps/mist/src/sources/east-money/east-money-source.service.spec.ts`, `mist/apps/mist/src/sources/tdx/tdx-source.service.ts`, `mist/apps/mist/src/sources/tdx/tdx-source.service.spec.ts`, `mist/tools/test-ci-contracts.mjs` | Red: focused Jest failed with TS2307 because the new shared timeout constant did not exist yet; the new contract also failed before implementation. Green: focused Jest -> 32 passed; `node tools/test-ci-contracts.mjs` -> passed; `pnpm run lint:check` -> passed; `pnpm run typecheck` -> passed; `pnpm run test:ci` -> 48 suites / 463 tests passed. |

## Residual Risk

No local residual risk for the selected scope. The datasource HTTP timeout is a
shared TypeScript constant rather than an environment variable by design for
this small P2 batch; a later config-factory pass can promote it to runtime
configuration if deployment needs require that.
