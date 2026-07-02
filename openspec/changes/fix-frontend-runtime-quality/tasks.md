# Tasks: Fix frontend runtime quality

## 1. Select Scope And Baseline

- [x] 1.1 Record selected review IDs: CODE_REVIEW H6, H7, H8, H9, M5,
      M6, M7; CODE_SMELL D3.1-D3.7, A3.1, A3.4, P3.5, T3.5, T3.8,
      X3.3.
- [x] 1.2 Inspect current `mist-fe` API modules, live page, chart hooks,
      data processors, transformer, formatters, metadata, test-statistics
      code, and frontend tests before editing.
- [x] 1.3 Identify targeted tests for API runtime removal, mock bundle
      isolation, chart request races, ResizeObserver resize, large-data
      processing, enum/URL/formatter guards, and dead-code cleanup.

## 2. Add Failing Tests First

- [x] 2.1 Add API source tests proving live runtime code no longer imports
      request functions from `app/api/fetch.ts`.
- [x] 2.2 Add source or bundle-isolation tests proving live page/API client
      code does not statically import `@/test-data`.
- [x] 2.3 Add live page tests proving development fallback still works only
      when explicitly enabled and remains labeled as fallback.
- [x] 2.4 Add race tests proving stale `loadChart` results cannot overwrite
      a newer query.
- [x] 2.5 Add `useChartData` tests proving stale promise inputs cannot update
      processed chart state after newer inputs arrive.
- [x] 2.6 Add `useChartRender` tests proving `ResizeObserver` calls
      `chart.resize()` and disconnects on cleanup.
- [x] 2.7 Add large-data dataProcessor tests proving timestamp/id lookups are
      reused and valid outputs remain unchanged.
- [x] 2.8 Add transformer tests proving invalid backend enum values are
      rejected or normalized without direct unsafe coercion.
- [x] 2.9 Add URL parameter tests proving invalid `source` falls back to the
      default source.
- [x] 2.10 Add formatter tests proving empty params and out-of-range indexes
      do not throw.
- [x] 2.11 Add dead-code/source tests proving test-statistics panel/types have
      no runtime imports after cleanup.
- [x] 2.12 Run targeted frontend tests and confirm new assertions fail for
      intended reasons before implementation.

## 3. Implement API And Fixture Isolation

- [x] 3.1 Move K-line/Chan data types and enums from `app/api/fetch.ts` into
      a runtime-free type module.
- [x] 3.2 Update `app/api/client.ts`, chart components, tests, and
      transformers to import data types from the new type module.
- [x] 3.3 Delete old runtime request functions in `app/api/fetch.ts` and remove
      the obsolete file once no imports remain.
- [x] 3.4 Replace static live-page fixture imports with an explicit
      development fallback loader that dynamically imports test data.
- [x] 3.5 Remove no-op client try/catch rethrows while touching the API client.

## 4. Implement Chart Runtime Safety

- [x] 4.1 Add request identity or cancellation protection to page-level chart
      loading so stale requests cannot update chart state.
- [x] 4.2 Add cancellation protection to `useChartData` async processing.
- [x] 4.3 Remove unconditional chart runtime `console.log` output.
- [x] 4.4 Add `ResizeObserver` handling to `useChartRender`.
- [x] 4.5 Keep chart disposal behavior intact.

## 5. Implement Data, Validation, And Cleanup Fixes

- [x] 5.1 Add shared timestamp/id index helpers for chart data processing.
- [x] 5.2 Refactor merge-k, bi, fenxing, and channel mapping to reuse the
      shared indexes or single-pass helpers.
- [x] 5.3 Add URL source validation instead of `as DataSourceValue` coercion.
- [x] 5.4 Add explicit transformer enum guards for trend, bi type/status,
      channel level/type, and channel trend.
- [x] 5.5 Add formatter bounds guards for empty params and stale indexes.
- [x] 5.6 Remove confirmed dead test-statistics panel/types and dependent
      imports.
- [x] 5.7 Update frontend metadata/lang/default text and add route/global
      error boundaries covered by M7/D3.7.

## 6. Verify And Record Evidence

- [x] 6.1 Run targeted frontend tests added in this change.
- [x] 6.2 Run `pnpm lint`, `pnpm run typecheck`, and `pnpm run test:ci` in
      `mist-fe`.
- [x] 6.3 Run grep/source checks proving no runtime import remains for
      `app/api/fetch` or `@/test-data` in live client modules.
- [x] 6.4 Run `openspec validate fix-frontend-runtime-quality --strict`.
- [x] 6.5 Record `review-id -> changed files -> test/verification command` in
      `evidence.md`.
- [x] 6.6 Update the parent `stabilize-review-remediation` tasks after this
      child change is created and verified.
