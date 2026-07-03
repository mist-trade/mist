## Review Mapping

| Review ID | Changed files | Verification |
| --- | --- | --- |
| CODE_REVIEW H11 | `apps/mist/src/collector/collector.service.ts`, `libs/utils/src/services/data-source.service.ts`, focused service specs, `tools/test-ci-contracts.mjs` | Red/green focused Jest; `node tools/test-ci-contracts.mjs`; lint/typecheck/full Jest |
| CODE_SMELL U1.1 | `apps/mist/src/collector/collector.service.ts`, `apps/mist/src/collector/collector.service.spec.ts`, `tools/test-ci-contracts.mjs` | Collector Logger branch tests; selected production console contract |

## Red Evidence

- `pnpm exec jest apps/mist/src/collector/collector.service.spec.ts libs/utils/src/services/data-source.service.spec.ts --runInBand --watchman=false` failed before implementation:
  - Collector success, empty-data, and failure tests expected `Logger` but observed existing `console.*` behavior.
  - DataSource invalid-default fallback test expected `Logger.warn` but observed existing `console.warn` behavior.
- `node tools/test-ci-contracts.mjs` failed before implementation with:
  - `apps/mist/src/collector/collector.service.ts must use NestJS Logger instead of console.*`

## Green Evidence

- `pnpm exec jest apps/mist/src/collector/collector.service.spec.ts libs/utils/src/services/data-source.service.spec.ts --runInBand --watchman=false`: 2 suites / 25 tests passed.
- `node tools/test-ci-contracts.mjs`: passed with `CI release contract checks passed.`
- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm exec jest --runInBand --watchman=false --silent`: 48 suites / 460 tests passed.
- `openspec validate continue-review-p2-backend-logging-hygiene --strict`: passed.
