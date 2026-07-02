## MODIFIED Requirements

### Requirement: Fixture data is explicit development fallback only
The frontend SHALL not silently use fixture data for product live K-line
requests, and normal client runtime modules SHALL NOT statically import fixture
or test-data modules.

#### Scenario: Live K-line request fails
- **WHEN** a live K-line request fails in normal runtime mode
- **THEN** the page SHALL show an error state
- **AND** the page SHALL NOT silently render fixture data

#### Scenario: Development fallback is enabled
- **WHEN** an explicit development fallback flag is enabled
- **THEN** the frontend MAY render fixture data
- **AND** the page SHALL make the fallback state distinguishable from live data
- **AND** fixture data SHALL be loaded through an explicit fallback path rather
  than a normal client-runtime static import

#### Scenario: Client runtime source is inspected
- **WHEN** tests inspect live page and API client source files
- **THEN** those files MUST NOT contain static imports from `@/test-data`

## ADDED Requirements

### Requirement: Live K-line runtime has a single API client
The frontend SHALL expose live K-line runtime request functions from the current
API client only, while shared data types SHALL live in a runtime-free type
module.

#### Scenario: Old API runtime is removed
- **WHEN** frontend source imports live K-line request functions
- **THEN** imports MUST come from the current API client
- **AND** no live runtime code SHALL import request functions from the old
  `fetch.ts` module

#### Scenario: Shared data types are imported
- **WHEN** chart components and API clients need K-line, Chan, or enum types
- **THEN** they SHALL import those types from a runtime-free type module
- **AND** importing types MUST NOT pull request implementations or fixture data
  into the client bundle

### Requirement: Chart async work is race safe
The frontend SHALL prevent stale chart request or processing work from
overwriting data for a newer query.

#### Scenario: Chart query changes before old work resolves
- **WHEN** a previous chart load resolves after a newer chart load has started
- **THEN** the previous load MUST NOT update chart data, status, or loading
  state for the newer query

#### Scenario: Chart data processing effect is superseded
- **WHEN** `useChartData` receives newer promise inputs before older promises
  resolve
- **THEN** only the newest inputs MAY update processed chart data

### Requirement: ECharts resizes with its container
The K-line chart SHALL resize the ECharts instance when its container changes
size.

#### Scenario: Chart container is resized
- **WHEN** a `ResizeObserver` callback fires for the chart container
- **THEN** the ECharts instance MUST call `resize()`

#### Scenario: Chart component unmounts
- **WHEN** the chart component unmounts
- **THEN** the resize observer MUST disconnect
- **AND** the ECharts instance MUST be disposed

### Requirement: Chart data mapping handles large datasets efficiently
The frontend SHALL avoid repeated full-array scans in hot chart data mapping
paths when a precomputed index can be reused.

#### Scenario: Merge-k, bi, fenxing, and channel data are mapped
- **WHEN** chart mapping functions process K-line arrays and overlay arrays
- **THEN** lookup by timestamp or id MUST use precomputed indexes or equivalent
  single-pass helpers
- **AND** the result MUST remain identical for valid inputs

#### Scenario: Large dataset helper is tested
- **WHEN** tests create thousands of K-line rows and overlays
- **THEN** mapping helpers MUST complete without repeated `findIndex`-style
  scans over the same K-line array for each overlay item

### Requirement: Frontend validation guards unsafe runtime inputs
The frontend SHALL validate URL and backend-derived enum/bounds inputs before
using them in chart state.

#### Scenario: URL source parameter is invalid
- **WHEN** `/k` receives an unsupported `source` search parameter
- **THEN** the live page MUST fall back to the default source
- **AND** it MUST NOT coerce the invalid string into a `DataSourceValue`

#### Scenario: Backend enum payload is invalid
- **WHEN** test-data transformer receives invalid trend, status, type, or level
  strings
- **THEN** it MUST reject or normalize the value through an explicit guard
- **AND** it MUST NOT rely on direct `as Enum` coercions

#### Scenario: Formatter receives empty or stale params
- **WHEN** tooltip/formatter helpers receive an empty params array or an
  out-of-range data index
- **THEN** they MUST return a stable empty or fallback string
- **AND** they MUST NOT throw

### Requirement: Frontend production runtime avoids noisy debug artifacts
The frontend SHALL remove confirmed dead test-statistics runtime code and avoid
unconditional production console logging in chart runtime paths.

#### Scenario: Chart data processes live overlays
- **WHEN** chart overlays are processed in production runtime paths
- **THEN** the code MUST NOT call unconditional `console.log` for each item

#### Scenario: Dead test-statistics code is inspected
- **WHEN** frontend source is searched for the removed test-statistics panel and
  duplicate statistics types
- **THEN** no runtime imports or component code SHALL remain

### Requirement: Frontend route errors have localized boundaries
The frontend SHALL provide localized App Router error boundaries for route-level
and root-level failures.

#### Scenario: Route error occurs
- **WHEN** a route-level error boundary renders after a page error
- **THEN** the user SHALL see a localized error state
- **AND** the error state SHALL provide a reset action

#### Scenario: Root layout error occurs
- **WHEN** the global error boundary renders after a root-level error
- **THEN** the replacement document SHALL keep `lang="zh-CN"`
- **AND** it SHALL provide a localized reset action and digest display when a
  digest is available
