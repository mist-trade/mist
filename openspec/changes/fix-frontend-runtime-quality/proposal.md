## Why

The frontend live K-line viewer still has several user-visible runtime risks:
duplicate API clients, fixture data entering the client bundle, chart resize
gaps, async race conditions, production console noise, and large-data hot paths.
These issues are P1/P2 review items because they can show stale or wrong chart
data and make production bundles heavier than intended.

## What Changes

- Select review IDs CODE_REVIEW H6, H7, H8, H9, M5, M6, M7 and CODE_SMELL
  D3.1-D3.7, A3.1, A3.4, P3.5, T3.5, T3.8, X3.3.
- Remove the old runtime API functions in `app/api/fetch.ts`, preserving only
  types that are still needed by the current client.
- Ensure fixture/mock K-line data is not statically imported by client runtime
  code and is available only through an explicit development fallback path.
- Add request-race protection to chart data loading so stale async work cannot
  overwrite newer query results.
- Add `ResizeObserver`-driven ECharts resizing.
- Remove or guard production `console.*` calls in chart runtime code.
- Optimize large-data chart mapping/min-max paths with precomputed maps or
  single-pass utilities.
- Remove confirmed dead frontend test-statistics code and fix simple metadata,
  URL enum validation, formatter bounds, unsafe enum coercions, and localized
  route/global error boundaries.
- Add targeted frontend tests for API contract cleanup, mock bundle isolation,
  race protection, resize behavior, large-data helpers, and validation guards.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `frontend-live-kline-viewer`: strengthen runtime quality requirements for API
  ownership, fixture isolation, chart resize, async race prevention, large-data
  processing, and frontend validation/error guards.

## Impact

- Affected repository:
  - `mist-fe`
- Affected code areas:
  - `app/api/*`
  - `app/k/KLineLivePage.tsx`
  - `app/components/k-panel/hooks/*`
  - `app/components/k-panel/utils/*`
  - `app/components/k-panel/config/*`
  - `app/components/test-statistics*`
  - frontend tests under `app/**/__tests__`
- No backend, datasource, or deployment topology changes.
