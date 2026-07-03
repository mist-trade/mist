# Evidence: continue-review-p3-backend-service-cleanups

## Selected Review IDs

| Review ID | Classification | Files / Evidence | Verification |
|---|---|---|---|
| CODE_REVIEW H2 | deferred | Cross-app source moves remain architecture work. | Deferred until shared library boundary pass. |
| CODE_REVIEW L3 | deferred | Datasource magic numbers/config cleanup spans datasource config. | Deferred until backend/datasource config batch. |
| CODE_SMELL_REVIEW D1.4 | deferred | `apps/mist/src/chan/entities/` schema usage needs DB decision. | Deferred until entity/schema cleanup. |
| CODE_SMELL_REVIEW R1.4 | implemented | `apps/mist/src/indicator/indicator.service.ts` | Removed redundant MACD `as number` assertions using a type guard. |
| CODE_SMELL_REVIEW R1.5 | already closed | `openspec/changes/continue-review-p3-backend-quick-wins/evidence.md` | Batch 1 simplified `calculateInitialExtreme`. |
| CODE_SMELL_REVIEW R1.6 | implemented | `apps/mist/src/chan/services/bi.service.ts` | Removed stale `isBiWideEnough` JSDoc parameter text. |
| CODE_SMELL_REVIEW R1.8 | deferred | backend security source mapping | Deferred until source mapping/type consolidation pass. |
| CODE_SMELL_REVIEW P1.1 | deferred | collector strategy hierarchy | Deferred until collector architecture refactor. |
| CODE_SMELL_REVIEW P1.2 | implemented | `libs/utils/src/security-code.ts`, collector services | Added shared `getSecurityFormatCode` and removed duplicated private helpers. |
| CODE_SMELL_REVIEW P1.3 | implemented | `apps/mist/src/sources/*/types.ts`, `source-fetcher.interface.ts` | Provider extension types now re-export shared extension interfaces. |
| CODE_SMELL_REVIEW P1.5 | implemented | `apps/mcp-server/src/utils/validation.helpers.ts`, MCP services | Centralized MCP validation error-code mapping. |
| CODE_SMELL_REVIEW T1.5 | deferred | `websocket-collection.strategy.ts` DI/lifecycle | Deferred until DI/null lifecycle refactor. |
| CODE_SMELL_REVIEW M1.2 | implemented | `apps/mist/src/sources/tdx/tdx-websocket.service.ts` | Extracted TDX intraday subscription periods constant. |
| CODE_SMELL_REVIEW M1.4 | already closed | `openspec/changes/continue-review-p3-backend-quick-wins/evidence.md` | Batch 1 named and documented the channel breakout threshold. |
| CODE_SMELL_REVIEW M1.6 | deferred | indicator parameter config | Deferred until indicator config/API design. |
| CODE_SMELL_REVIEW B1.2 | implemented | `libs/shared-data/src/entities/k-extension-ef.entity.ts` | Fixed `prevOpen` column comment from current-open to previous-open wording. |
| CODE_SMELL_REVIEW B1.4 | deferred | enum column style/schema migration | Deferred to avoid low-value schema churn. |
| CODE_SMELL_REVIEW B1.6 | deferred | MQMT extension route/table decision | Deferred until MQMT provider direction is decided. |
| CODE_SMELL_REVIEW N1.1 | deferred | `UnComplete` enum rename | Deferred because rename touches enum contracts/tests. |
| CODE_SMELL_REVIEW N1.2 | implemented | `apps/mist/src/chan/services/bi.service.ts` | Added `ThreeBiPattern` typed return instead of raw strings. |
| CODE_SMELL_REVIEW N1.4 | implemented | `apps/mist/src/chan/services/bi.service.ts`, spec | Narrowed `removeBiByIndex` to `BiVo[]` and updated test data. |
| CODE_SMELL_REVIEW N1.5 | implemented | `apps/mist/src/chan/services/trend.service.ts` | Renamed boolean method to `hasConsistentBiTrend`. |
| CODE_SMELL_REVIEW C1.1 | implemented | `apps/mist/src/chan/services/channel.service.ts` | Fixed `zg/zd` overlap comments to match candidate-set behavior. |
| CODE_SMELL_REVIEW C1.2 | already closed | `openspec/changes/continue-review-p3-backend-quick-wins/evidence.md` | Batch 1 removed the unused `addZeroToNumber` helper. |
| CODE_SMELL_REVIEW C1.3 | implemented | `apps/mist/src/chan/services/*.ts` | Cleaned selected stale/unclear comments in touched Chan services. |
| CODE_SMELL_REVIEW C1.4 | implemented | `apps/mist/src/chan/services/bi.service.ts` | Removed orphan `// 这个不应该存在` comment. |
| CODE_SMELL_REVIEW U1.3 | implemented | `apps/mist/src/chan/chan.controller.ts` | Centralized repeated query date parsing in a controller helper. |
| CODE_SMELL_REVIEW O1.2 | implemented | `apps/mist/src/chan/services/bi.service.ts` | Added `BiSourceTag` typed source tag for `getLastBi` flow. |
| CODE_SMELL_REVIEW O1.4 | already closed | `apps/mist/src/chan/services/bi-range.helper.ts` | Existing helper already centralizes merged-K range aggregation. |
| CODE_SMELL_REVIEW O1.5 | implemented | `apps/mist/src/indicator/indicator.service.ts` | Reused one OHLC indicator DTO for ADX and ATR. |

## Red Verification

- `node tools/test-ci-contracts.mjs` failed as expected with
  `CODE_SMELL O1.5 indicator OHLC DTO reuse must not include
  "interface RunADXDto"`.
- After adding P1.3 contracts, `node tools/test-ci-contracts.mjs` failed as
  expected with `CODE_SMELL P1.3 East Money extension type reuse must not
  include "export interface EfExtension"`.
- `pnpm run typecheck` caught a real intermediate miss:
  `Property 'getFormatCode' does not exist on type 'WebSocketCollectionStrategy'`.
- Focused Jest caught the test fixture after narrowing `removeBiByIndex`:
  `string[]` was no longer assignable to `BiVo[]`.

## Green Verification

- `node tools/test-ci-contracts.mjs` passed with `CI release contract checks
  passed.`
- `pnpm run typecheck` passed.
- `pnpm run lint:check` passed.
- Focused Jest passed for 11 suites, 128 tests:
  `indicator.service`, `collector.service`, `websocket-collection.strategy`,
  `tdx-websocket.service`, `tdx-source.service`, `east-money-source.service`,
  `bi.service`, `channel.service`, and selected MCP service specs.
- Focused Chan controller Jest passed: 1 suite, 20 tests.
- `openspec validate continue-review-p3-backend-service-cleanups --strict`
  passed.
- `git status --short` in `mist/` still shows the pre-existing, unrelated
  production-baseline files alongside Batch 1/2 changes:
  `docs/production-baseline-verification.md` and
  `openspec/changes/verify-mist-production-baseline/evidence/2026-07-03-production-baseline-rerun-5.md`.
