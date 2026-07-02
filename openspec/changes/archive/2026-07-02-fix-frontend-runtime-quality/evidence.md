# Evidence: fix-frontend-runtime-quality

## Verification Commands

- `pnpm exec jest app/api/__tests__/runtime-source.test.ts app/api/__tests__/chan-test-data.transformer.test.ts app/k/__tests__/KLineLivePage.test.tsx app/components/k-panel/hooks/__tests__/useChartData.test.tsx app/components/k-panel/hooks/__tests__/useChartRender.test.tsx app/components/k-panel/utils/__tests__/formatters.test.ts app/components/k-panel/__tests__/dataProcessor.test.ts --runInBand --watchman=false` -> 7 suites, 39 tests passed.
- `pnpm exec jest app/__tests__/route-error-boundaries.test.tsx --runInBand --watchman=false` -> 1 suite, 2 tests passed.
- `pnpm lint` -> passed.
- `pnpm run typecheck` -> passed.
- `pnpm run test:ci` -> 12 suites, 75 tests passed.
- `rg -n "from\s+[\"'](?:@/app/api/fetch|.*\/fetch)[\"']" app test-data` -> no matches.
- `rg -n "from\s+[\"']@/test-data[\"']" app/api/client.ts app/k/KLineLivePage.tsx` -> no matches.
- `rg -n "console\.(log|warn|error|debug|info)\s*\(" app/components/k-panel app/k app/api/client.ts` -> no matches.
- `rg --files app/api` -> no `app/api/fetch.ts`.
- `openspec validate fix-frontend-runtime-quality --strict` -> valid.
- `openspec validate stabilize-review-remediation --strict` -> valid.

## Review ID Mapping

| Review ID | Changed files | Tests / verification |
| --- | --- | --- |
| CODE_REVIEW H6 | `app/api/types.ts`, deleted `app/api/fetch.ts`, `app/api/client.ts`, chart imports | `app/api/__tests__/runtime-source.test.ts`; old fetch import grep |
| CODE_REVIEW H7 | `app/k/KLineLivePage.tsx`, `app/api/client.ts` | `app/k/__tests__/KLineLivePage.test.tsx`; static `@/test-data` grep |
| CODE_REVIEW H8 | `app/k/KLineLivePage.tsx`, `app/components/k-panel/hooks/useChartData.ts`, `app/components/k-panel/hooks/useChartRender.ts` | `KLineLivePage.test.tsx`, `useChartData.test.tsx`, `useChartRender.test.tsx` |
| CODE_REVIEW H9 | `app/components/k-panel/hooks/useChartData.ts`, `app/components/k-panel/utils/dataProcessor.ts`, deleted `app/api/fetch.ts` | `runtime-source.test.ts`; console grep |
| CODE_REVIEW M5 | `app/components/k-panel/utils/dataProcessor.ts`, `app/components/k-panel/utils/formatters.ts` | `dataProcessor.test.ts`, `formatters.test.ts` |
| CODE_REVIEW M6 | deleted `app/components/test-statistics-panel/index.tsx`, deleted `app/api/types/test-statistics.types.ts` | `runtime-source.test.ts` |
| CODE_REVIEW M7 | `app/layout.tsx`, `app/error.tsx`, `app/global-error.tsx` | `route-error-boundaries.test.tsx`; `pnpm run typecheck` |
| CODE_SMELL D3.1 | `app/components/k-panel/hooks/useChartData.ts` | `runtime-source.test.ts`; console grep |
| CODE_SMELL D3.2 | `app/components/k-panel/utils/dataProcessor.ts` | `runtime-source.test.ts`; console grep |
| CODE_SMELL D3.3 | deleted `app/api/fetch.ts` | `runtime-source.test.ts`; old fetch file check |
| CODE_SMELL D3.4 | deleted `app/api/fetch.ts`, `app/api/types.ts` | `runtime-source.test.ts`; old fetch import grep |
| CODE_SMELL D3.5 | `app/components/k-panel/utils/dataProcessor.ts` | `dataProcessor.test.ts` |
| CODE_SMELL D3.6 | `app/components/k-panel/utils/dataProcessor.ts` | `dataProcessor.test.ts`; `pnpm run typecheck` |
| CODE_SMELL D3.7 | `app/layout.tsx`, `app/error.tsx`, `app/global-error.tsx` | `route-error-boundaries.test.tsx`; `pnpm run typecheck` |
| CODE_SMELL A3.1 | `app/components/k-panel/hooks/useChartData.ts`, `app/k/KLineLivePage.tsx` | `useChartData.test.tsx`, `KLineLivePage.test.tsx` |
| CODE_SMELL A3.4 | `app/components/k-panel/hooks/useChartRender.ts` | `useChartRender.test.tsx` |
| CODE_SMELL P3.5 | `app/components/k-panel/utils/dataProcessor.ts` | `dataProcessor.test.ts` |
| CODE_SMELL T3.5 | `app/api/transformers/chan-test-data.transformer.ts` | `chan-test-data.transformer.test.ts` |
| CODE_SMELL T3.8 | `app/k/KLineLivePage.tsx` | `KLineLivePage.test.tsx` |
| CODE_SMELL X3.3 | `app/components/k-panel/utils/formatters.ts` | `formatters.test.ts` |
