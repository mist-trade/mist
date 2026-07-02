## Scope

Selected review IDs closed in this batch:

- `CODE_REVIEW H3`
- `CODE_SMELL_REVIEW D1.7`
- `CODE_SMELL_REVIEW R1.7`
- `CODE_SMELL_REVIEW R1.9`
- `CODE_SMELL_REVIEW P1.4`
- `CODE_SMELL_REVIEW T1.1`
- `CODE_SMELL_REVIEW T1.3`
- `CODE_SMELL_REVIEW M1.1`
- `CODE_SMELL_REVIEW B1.5`
- `CODE_SMELL_REVIEW U1.2`
- `CODE_SMELL_REVIEW U1.4`
- `CODE_SMELL_REVIEW O1.6`

## Red Evidence

The initial focused test/contract pass failed before implementation with these
expected failures:

- `PeriodMappingService.fromSourceFormat` was missing.
- `IndicatorService.findKData` converted `Period` through
  `String(query.period) as unknown as Period`.
- `TdxWebSocketService` had no configurable reconnect/heartbeat timing values.
- `ChanService.analyze` was missing, so MCP analysis could only call separate
  merge-dependent paths.
- `BiService.mergeTwoBis` dereferenced incomplete Bi values instead of throwing
  a clear invariant error.
- `KExtensionEf` nullable fields defaulted to `''`, `0`, or `0n`.
- `node tools/test-ci-contracts.mjs` failed on the `ISourceFetcher<any>`
  contract.

## Review-ID Mapping

| Review ID | Files | Verification |
| --- | --- | --- |
| `CODE_REVIEW H3` | `apps/mist/src/collector/collector.service.ts`, `tools/test-ci-contracts.mjs` | `pnpm run typecheck`, `node tools/test-ci-contracts.mjs`, `pnpm run test:ci` |
| `CODE_SMELL_REVIEW D1.7` | `libs/utils/src/services/period-mapping.service.ts`, `apps/mist/src/sources/tdx/tdx-websocket.service.ts`, `apps/mist/src/sources/tdx/tdx-source.service.ts` | `pnpm jest libs/utils/src/services/period-mapping.service.spec.ts apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts apps/mist/src/sources/tdx/tdx-source.service.spec.ts --runInBand --watchman=false`, `node tools/test-ci-contracts.mjs` |
| `CODE_SMELL_REVIEW R1.7` | `apps/mist/src/indicator/indicator.service.ts`, `apps/mist/src/indicator/indicator.service.spec.ts` | `pnpm jest apps/mist/src/indicator/indicator.service.spec.ts --runInBand --watchman=false`, `node tools/test-ci-contracts.mjs` |
| `CODE_SMELL_REVIEW R1.9` | `apps/mcp-server/src/services/data-mcp.service.ts`, `apps/mcp-server/src/services/data-mcp.service.spec.ts` | `pnpm jest apps/mcp-server/src/services/data-mcp.service.spec.ts --runInBand --watchman=false`, `node tools/test-ci-contracts.mjs` |
| `CODE_SMELL_REVIEW P1.4` | `apps/mcp-server/src/services/data-mcp.service.ts`, `apps/mcp-server/src/services/data-mcp.service.spec.ts` | `pnpm jest apps/mcp-server/src/services/data-mcp.service.spec.ts --runInBand --watchman=false`, `node tools/test-ci-contracts.mjs` |
| `CODE_SMELL_REVIEW T1.1` | `apps/mist/src/collector/strategies/websocket-collection.strategy.ts`, `apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts` | `pnpm jest apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts --runInBand --watchman=false`, `node tools/test-ci-contracts.mjs` |
| `CODE_SMELL_REVIEW T1.3` | `apps/mist/src/sources/tdx/tdx-websocket.service.ts`, `libs/config/src/validation.schema.ts`, `.env.example` | `pnpm jest apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts --runInBand --watchman=false`, `pnpm run typecheck` |
| `CODE_SMELL_REVIEW M1.1` | `apps/mist/src/chan/services/bi.service.ts`, `apps/mist/src/chan/services/bi.service.spec.ts` | `pnpm jest apps/mist/src/chan/services/bi.service.spec.ts --runInBand --watchman=false`, `node tools/test-ci-contracts.mjs` |
| `CODE_SMELL_REVIEW B1.5` | `apps/mist/src/chan/chan.service.ts`, `apps/mcp-server/src/services/chan-mcp.service.ts`, related specs | `pnpm jest apps/mist/src/chan/chan.service.spec.ts apps/mcp-server/src/services/chan-mcp.service.spec.ts --runInBand --watchman=false`, `node tools/test-ci-contracts.mjs` |
| `CODE_SMELL_REVIEW U1.2` | `apps/mist/src/sources/tdx/tdx-source.service.ts`, `apps/mist/src/sources/tdx/tdx-source.service.spec.ts`, WebSocket strategy specs | `pnpm jest apps/mist/src/sources/tdx/tdx-source.service.spec.ts apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts --runInBand --watchman=false` |
| `CODE_SMELL_REVIEW U1.4` | `libs/shared-data/src/entities/k-extension-ef.entity.ts`, `libs/shared-data/src/entities/extension-schema.spec.ts` | `pnpm jest libs/shared-data/src/entities/extension-schema.spec.ts --runInBand --watchman=false`, `node tools/test-ci-contracts.mjs` |
| `CODE_SMELL_REVIEW O1.6` | `tools/test-ci-contracts.mjs`, `openspec/changes/continue-review-p2-backend-runtime-sweep/*` | `node tools/test-ci-contracts.mjs`, `openspec validate continue-review-p2-backend-runtime-sweep --strict` |

## Green Evidence

- `pnpm jest libs/utils/src/services/period-mapping.service.spec.ts apps/mist/src/indicator/indicator.service.spec.ts apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts apps/mcp-server/src/services/data-mcp.service.spec.ts apps/mist/src/chan/chan.service.spec.ts apps/mcp-server/src/services/chan-mcp.service.spec.ts apps/mist/src/chan/services/bi.service.spec.ts libs/shared-data/src/entities/extension-schema.spec.ts apps/mist/src/sources/tdx/tdx-source.service.spec.ts --runInBand --watchman=false`
  - Result: 10 suites passed, 114 tests passed.
- `node tools/test-ci-contracts.mjs`
  - Result: `CI release contract checks passed.`
- `pnpm run lint:check`
  - Result: passed.
- `pnpm run typecheck`
  - Result: passed.
- `pnpm run test:ci`
  - Result: 48 suites passed, 474 tests passed.
- `openspec validate continue-review-p2-backend-runtime-sweep --strict`
  - Result: `Change 'continue-review-p2-backend-runtime-sweep' is valid`.

## Out Of Scope

The unrelated untracked production baseline evidence files under
`openspec/changes/verify-mist-production-baseline/evidence/` were intentionally
left unstaged for this backend P2 batch.
