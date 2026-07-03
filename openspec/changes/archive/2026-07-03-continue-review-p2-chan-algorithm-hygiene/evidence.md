# Evidence: continue-review-p2-chan-algorithm-hygiene

## Red Test

- `pnpm exec jest apps/mist/src/chan/services/bi.service.spec.ts --runInBand --watchman=false`
  first failed after the new characterization tests were added because
  `BiService` did not contain the shared `collectMergedKRange` boundary and
  still repeated `rangeKs.forEach` range aggregation in multiple construction
  paths.

## Review ID Mapping

| Review ID | Changed files | Tests / verification |
| --- | --- | --- |
| `CODE_REVIEW H3` | `apps/mist/src/chan/services/bi.service.ts`, `apps/mist/src/chan/services/bi-range.helper.ts`, `apps/mist/src/chan/services/bi.service.spec.ts` | Focused tests lock public `getBi` output, `removeBiByIndex`, and invariant guard behavior while moving repeated range logic out of the large service file. |
| `CODE_SMELL_REVIEW D1.7` | `apps/mist/src/chan/services/bi-range.helper.ts`, `apps/mist/src/chan/services/bi.service.ts`, `apps/mist/src/chan/services/bi.service.spec.ts` | Source contract and behavior tests prove complete, merged, and unfinished Bi construction paths now share `collectMergedKRange`. |

## Green Verification

- `pnpm exec jest apps/mist/src/chan/services/bi.service.spec.ts --runInBand --watchman=false`
  -> 1 suite passed, 6 tests passed.
- `pnpm exec jest apps/mist/src/chan/services/bi.service.spec.ts apps/mist/src/chan/chan.service.spec.ts --runInBand --watchman=false`
  -> 2 suites passed, 22 tests passed.
- `pnpm run lint:check`
  -> ESLint passed.
- `pnpm run typecheck`
  -> `tsc --noEmit` passed.
- `openspec validate continue-review-p2-chan-algorithm-hygiene --strict`
  -> valid.
- `git diff --check`
  -> passed.

## Residual Risk

This batch intentionally does not claim broader Chan P3 cleanup items such as
full state-machine extraction, duplicate overlap helper consolidation, old
JSDoc cleanup, or archived exploratory test revival.
