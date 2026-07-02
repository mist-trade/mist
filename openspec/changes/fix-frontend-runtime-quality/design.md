## Context

The live K-line frontend lives in `mist-fe`. The current production path uses a
same-origin gateway and `app/api/client.ts` for live Mist/Chan requests, but the
older `app/api/fetch.ts` still exports runtime fetch functions and imports
fixture data. The live page also imports fixture data directly, chart data
processing lacks cancellation, ECharts does not resize with its container, and
some data mapping paths repeatedly scan large arrays.

## Goals / Non-Goals

**Goals:**

- Keep a single runtime API client for live K-line and Chan requests.
- Keep fixture data out of normal client runtime bundles unless an explicit
  development fallback path loads it.
- Prevent stale async chart work from overwriting newer query results.
- Resize ECharts instances when the container changes size.
- Remove production chart console noise.
- Make large K-line mapping paths linear for large datasets.
- Add validation/bounds tests for selected P1/P2 frontend review items.
- Add localized route/global error boundaries for App Router error states.

**Non-Goals:**

- Redesign the K-line page UI or chart visual language.
- Replace ECharts.
- Rewrite all chart configuration hooks.
- Solve every P3 naming/export/style issue in the frontend.
- Change backend, datasource, or deployment routing.

## Decisions

### Decision 1: Move live data types out of `fetch.ts`

`app/api/client.ts` should keep the runtime request functions. Shared live data
types/enums move to a runtime-free module such as `app/api/types.ts`, and
frontend imports should point there. Once no runtime or type import needs
`fetch.ts`, delete it.

Alternative considered: keep `fetch.ts` as a type-only file. That name is too
easy to misuse and already caused duplicate runtime APIs, so a dedicated type
module is clearer.

### Decision 2: Load fixture data only through an explicit development helper

The live page should not statically import `@/test-data`. If the development
fallback flag is enabled, the page can dynamically import a small fallback
helper that itself imports fixture data. Tests should assert the live page and
API client source do not statically import test data.

Alternative considered: keep static imports and rely on the env flag. That does
not remove fixture data from client bundles.

### Decision 3: Guard async chart writes by request identity

Use cancellation flags or monotonically increasing request tokens in chart data
effects and page-level load flows. The latest query should be the only work
allowed to call `setChart`, `setData`, or clear loading state.

Alternative considered: rely on React effect order. That is not sufficient when
promises resolve out of order.

### Decision 4: Resize through `ResizeObserver`

Attach `ResizeObserver` to the chart container after ECharts initialization and
disconnect it during cleanup. Tests should mock `ResizeObserver` and verify
`chart.resize()` is called.

Alternative considered: window resize events. Container resize is the actual
thing that matters and also covers layout/sidebar changes.

### Decision 5: Precompute indexes for large data mapping

Repeated `findIndex`/`find` scans over K-line arrays should become shared maps
by timestamp and id, then reused by merge-k, bi, fenxing, and channel mapping.

Alternative considered: local helper wrapping `findIndex`. That reduces
duplication but not complexity.

## Risks / Trade-offs

- Dynamic fallback import may make dev fallback asynchronous in one more place
  -> cover with page tests and keep the user-visible fallback label.
- Moving types can break many imports -> migrate with typecheck and grep for
  `app/api/fetch` after deletion.
- Race tests can be brittle if they depend on timers -> prefer manually
  controlled promises.
- ResizeObserver is absent in jsdom -> test setup already mocks browser APIs,
  and targeted tests should provide a deterministic mock.

## Migration Plan

1. Add failing tests for every selected frontend review item.
2. Move types out of `fetch.ts`, update imports, and delete old runtime API
   functions.
3. Replace static fixture imports with explicit dev-only dynamic fallback.
4. Add chart race cancellation and ResizeObserver resize handling.
5. Optimize data mapping helpers and add validation/bounds guards.
6. Remove confirmed dead frontend statistics code and add route/global error
   boundaries.
7. Run frontend lint, typecheck, tests, targeted grep assertions, and OpenSpec
   validation.
