# Evidence: continue-review-p3-backend-quick-wins

## Selected Review IDs

| Review ID | Classification | Files / Evidence | Verification |
|---|---|---|---|
| CODE_REVIEW H1 | deferred | Datasource abstraction merge remains broader architecture work. | Deferred to a later normalized-provider architecture batch. |
| CODE_REVIEW M1 | implemented | `libs/utils/src/utils.service.ts`, `libs/utils/src/utils.service.spec.ts` | Removed unused helpers instead of retaining the broken padding helper; `createAxiosInstance` remains covered. |
| CODE_REVIEW M3 | deferred | Redis dead config is low-risk and outside backend quick-win code paths. | Deferred until config cleanup batch. |
| CODE_REVIEW M4 | already closed | `openspec/changes/archive/2026-07-03-continue-review-p2-backend-test-hygiene/evidence.md` | Prior P2 evidence covers Chan diagnostic test archive. |
| CODE_REVIEW L1 | implemented | `apps/mcp-server/src/services/*.ts` | Removed selected stale no-unused-vars disables; focused lint and contract are green. |
| CODE_REVIEW L2 | deferred | App port defaults remain tied to config factory work. | Deferred until backend config factory batch. |
| INFRA_REVIEW I9 | implemented | `.github/workflows/docker.yml`, `.github/workflows/release.yml` | Removed misleading QEMU/matrix setup; Docker publish remains explicit `linux/amd64`. |
| INFRA_REVIEW T5 | deferred | ESLint rule tightening is intentionally gradual. | Deferred until lint-rules batch. |
| INFRA_REVIEW T10 | already closed | `openspec/changes/archive/2026-07-03-continue-review-p2-backend-test-hygiene/evidence.md` | Prior P2 evidence covers Jest coverage scope. |
| INFRA_REVIEW T11 | already closed | `openspec/changes/archive/2026-07-03-continue-review-p2-backend-test-hygiene/evidence.md` | Prior P2 evidence covers Chan diagnostic specs. |
| CODE_SMELL_REVIEW D1.1 | implemented | `apps/mist/src/chan/vo/judge-trend.vo.ts` | Deleted active dead VO and added a static contract preventing its return. |
| CODE_SMELL_REVIEW D1.2 | implemented | `libs/utils/src/utils.service.ts`, `apps/mist/src/chan/services/trend.service.ts` | Removed unused Utils helpers and the unused TrendService injection. |
| CODE_SMELL_REVIEW D1.3 | implemented | `libs/constants/src/errors.ts` | Removed unused `BI_INVALID_DIRECTION` constant. |
| CODE_SMELL_REVIEW D1.4 | deferred | `apps/mist/src/chan/entities/` | Deferred until entity/DB cleanup decision. |
| CODE_SMELL_REVIEW D1.6 | implemented | `apps/mist/src/sources/tdx/kcandle-aggregator.ts` | Removed selected stale DEBUG comment block and added static contract coverage. |
| CODE_SMELL_REVIEW R1.1 | implemented | `apps/mist/src/chan/services/channel.service.ts` | Applied property shorthand in touched `createChannel` result assembly. |
| CODE_SMELL_REVIEW R1.2 | implemented | `apps/mist/src/chan/services/channel.service.ts` | Removed the unused `offsetIndex` return field and added a focused public-path test. |
| CODE_SMELL_REVIEW R1.3 | implemented | `apps/mist/src/chan/services/channel.service.ts` | Removed duplicate overlap helper and routed validation through `hasOverlap`. |
| CODE_SMELL_REVIEW R1.4 | batch 2 | `apps/mist/src/indicator/indicator.service.ts` | Left for the broader indicator typing pass; file was not otherwise touched. |
| CODE_SMELL_REVIEW R1.5 | implemented | `apps/mist/src/chan/services/channel.service.ts` | Simplified the single-use initial-extreme variable path. |
| CODE_SMELL_REVIEW R1.6 | batch 2 | `apps/mist/src/chan/services/bi.service.ts` | Left for the wider Chan service cleanup batch. |
| CODE_SMELL_REVIEW R1.8 | batch 2 | backend security source mapping | Left for the wider backend type-mapping batch. |
| CODE_SMELL_REVIEW P1.1 | deferred | Collector strategy hierarchy. | Deferred until collector refactor batch. |
| CODE_SMELL_REVIEW P1.2 | batch 2 | backend format-code helpers | Requires shared helper extraction across files, outside this quick-win patch. |
| CODE_SMELL_REVIEW P1.3 | batch 2 | source extension interfaces | Requires source interface consolidation, outside this quick-win patch. |
| CODE_SMELL_REVIEW P1.5 | batch 2 | MCP validation helpers | Requires a shared MCP validation helper pass after the stale-disable cleanup. |
| CODE_SMELL_REVIEW T1.4 | already closed | `apps/mcp-server/src/base/base-mcp-tool.service.ts` | Existing P2 cleanup already removed selected `Record<string, any>` usage; P3 contract keeps it guarded. |
| CODE_SMELL_REVIEW T1.5 | deferred | WebSocket collection DI/null lifecycle. | Deferred until DI refactor batch. |
| CODE_SMELL_REVIEW M1.2 | batch 2 | subscription period constants | Left for the broader subscription-period constants extraction. |
| CODE_SMELL_REVIEW M1.4 | implemented | `apps/mist/src/chan/services/channel.service.ts` | Added a named breakout-threshold constant and short explanatory comment. |

## Red Verification

- `node tools/test-ci-contracts.mjs` failed as expected with
  `CODE_SMELL D1.1: JudgeTrendVo active source file must be removed`.
- `pnpm exec jest libs/utils/src/utils.service.spec.ts apps/mist/src/chan/services/channel.service.spec.ts --runInBand --watchman=false`
  failed as expected because `UtilsService.addZeroToNumber(10)` returned
  `"010"` instead of `"10"`. The new Channel public-path test passed.
- After the first cleanup wave, `node tools/test-ci-contracts.mjs` failed as
  expected with `INFRA_REVIEW I9 backend Docker workflow must not include
  "docker/setup-qemu-action"`.

## Green Verification

- `pnpm exec jest libs/utils/src/utils.service.spec.ts apps/mist/src/chan/services/channel.service.spec.ts --runInBand --watchman=false`
  passed: 2 suites, 5 tests.
- `node tools/test-ci-contracts.mjs` passed with `CI release contract checks
  passed.`
- `pnpm run lint:check` passed.
- `pnpm run typecheck` passed.
- `openspec validate continue-review-p3-backend-quick-wins --strict` passed.
- `git status --short` in `mist/` shows the Batch 1 backend files plus the
  pre-existing, unrelated production-baseline entries
  `docs/production-baseline-verification.md` and
  `openspec/changes/verify-mist-production-baseline/evidence/2026-07-03-production-baseline-rerun-5.md`.
