## Review Mapping

| Review ID | Changed files | Verification |
| --- | --- | --- |
| INFRA_REVIEW T10 | `package.json`, `tools/test-ci-contracts.mjs` | `node tools/test-ci-contracts.mjs`; `pnpm exec jest apps/mist/src/chan/chan.service.spec.ts --coverage --coverageReporters=json-summary --runInBand --watchman=false --silent` |
| INFRA_REVIEW T11 | `package.json`, `tools/test-ci-contracts.mjs`, `apps/mist/src/chan/test/archive/*.archive` | `node tools/test-ci-contracts.mjs`; `node -e "... jest --listTests ..."`; focused Chan Jest suite |
| CODE_REVIEW M4 | `apps/mist/src/chan/test/archive/*.archive`, `package.json`, `tools/test-ci-contracts.mjs` | focused Chan Jest suite; `pnpm exec jest --runInBand --watchman=false --silent` |
| Skills CI contract follow-up | `tools/test-ci-contracts.mjs` | `node tools/test-ci-contracts.mjs` |

## Red Evidence

- `node tools/test-ci-contracts.mjs` failed before the backend Jest hygiene
  implementation with `mist jest.collectCoverageFrom must include !**/*.spec.ts`.
- The same contract check also exposed the completed `mist-skills` P2 tooling
  drift by expecting the old pip/pytest workflow before this batch aligned it to
  uv, Ruff, Pyright, Black check, and pytest.

## Green Evidence

- `node tools/test-ci-contracts.mjs`: passed with `CI release contract checks passed.`
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm exec jest apps/mist/src/chan/chan.service.spec.ts apps/mist/src/chan/services/bi.service.spec.ts apps/mist/src/chan/services/channel.service.spec.ts --runInBand --watchman=false --silent`: 3 suites / 18 tests passed.
- `pnpm exec jest apps/mist/src/chan/chan.service.spec.ts --coverage --coverageReporters=json-summary --runInBand --watchman=false --silent`: 1 suite / 15 tests passed.
- `pnpm exec jest --runInBand --watchman=false --silent`: 48 suites / 458 tests passed.
- `node -e "... jest --listTests ..."`: confirmed archived Chan diagnostic specs are not in the default Jest test list.
- `openspec validate continue-review-p2-backend-test-hygiene --strict`: passed.
