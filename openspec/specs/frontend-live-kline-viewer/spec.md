# frontend-live-kline-viewer Specification

## Purpose
Define the Mist frontend live K-line MVP, including query-backed chart
parameters, Mist-backed stock lookup, manual backend collection, existing Chan
overlays, and same-origin production web access.

## Requirements
### Requirement: Live K-line page uses query-backed chart parameters
The frontend SHALL let users select K-line chart parameters through `/k` URL search parameters instead of a hardcoded fixture dataset.

#### Scenario: Page opens without a selected stock
- **WHEN** the user opens `/k` without a `code` search parameter
- **THEN** the page SHALL show a stock selection state
- **AND** the page SHALL NOT render fixture K-line data as if it were live data

#### Scenario: Page opens with selected chart parameters
- **WHEN** the user opens `/k` with `code`, `source`, `period`, `startDate`, and `endDate` search parameters
- **THEN** the frontend SHALL use those parameters to request K-line data
- **AND** the selected parameters SHALL remain visible in the page controls

#### Scenario: User changes chart parameters
- **WHEN** the user selects a different stock, period, source, start date, or end date
- **THEN** the frontend SHALL update the `/k` URL search parameters
- **AND** subsequent K-line and Chan requests SHALL use the updated parameters

### Requirement: Stock query is backed by Mist securities
The frontend SHALL provide stock lookup from the Mist backend securities catalog.

#### Scenario: Securities load successfully
- **WHEN** the K-line page loads stock options
- **THEN** the frontend SHALL request securities from the Mist backend
- **AND** each option SHALL expose at least canonical `code`, display `name`, `type`, and `status` when available

#### Scenario: User searches by code or name
- **WHEN** the user enters a stock code fragment or stock name fragment
- **THEN** the frontend SHALL filter available securities by canonical code or name
- **AND** choosing an option SHALL set the selected chart `code`

#### Scenario: Securities cannot be loaded
- **WHEN** the Mist backend security request fails
- **THEN** the page SHALL show a recoverable error state for stock lookup
- **AND** the page SHALL keep any already selected URL parameters available for retry

### Requirement: Manual refresh collects K-line data through the backend
The frontend SHALL refresh live K-line data through the Mist backend collection API, not through direct datasource calls.

#### Scenario: User refreshes selected K-line data
- **WHEN** the user triggers refresh for a selected `code`, `source`, `period`, `startDate`, and `endDate`
- **THEN** the frontend SHALL call the Mist backend collection endpoint with those parameters
- **AND** the backend SHALL own communication with the configured datasource
- **AND** the frontend SHALL reload the chart data after collection succeeds

#### Scenario: Refresh is missing required parameters
- **WHEN** the user triggers refresh without a selected code or complete date range
- **THEN** the frontend SHALL block the refresh request
- **AND** the page SHALL identify the missing parameter to the user

#### Scenario: Collection fails
- **WHEN** the Mist backend returns a collection error
- **THEN** the page SHALL display the backend error message
- **AND** the page SHALL preserve the selected query so the user can retry

### Requirement: Chart rendering uses live K-lines and existing Chan overlays
The frontend SHALL render selected K-line data from backend APIs and calculate overlays using existing Chan endpoints.

#### Scenario: K-line data loads successfully
- **WHEN** the backend returns K-line data for the selected query
- **THEN** the frontend SHALL render the K-line chart using that data
- **AND** the frontend SHALL request merge-k, bi, fenxing, and channel overlays from existing Chan endpoints

#### Scenario: K-line data is empty
- **WHEN** the backend returns an empty K-line array for the selected query
- **THEN** the page SHALL show an empty data state
- **AND** the page SHALL NOT replace the result with fixture data unless an explicit development fallback is enabled

#### Scenario: Chan overlay request fails
- **WHEN** a Chan overlay request fails after K-line data has loaded
- **THEN** the page SHALL show an error for the affected analysis request
- **AND** the page SHALL avoid rendering stale overlay data for the selected query

### Requirement: Frontend API clients isolate backend topology
The frontend SHALL centralize Mist backend and Chan API URL selection and response normalization.

#### Scenario: Frontend requests backend-only APIs
- **WHEN** the frontend requests securities or K-line collection
- **THEN** it SHALL use the configured Mist backend API base URL
- **AND** it SHALL NOT use the Python datasource base URL

#### Scenario: Frontend requests analysis APIs
- **WHEN** the frontend requests K-line or Chan analysis data
- **THEN** it SHALL use the configured analysis API base URL
- **AND** the analysis API base URL SHALL default to the same-origin Chan gateway path when no dedicated Chan API base URL is configured

#### Scenario: Backend returns unified envelope
- **WHEN** a Mist backend endpoint returns `{ success, data, ... }`
- **THEN** the frontend API client SHALL unwrap and return the `data` payload to chart callers

#### Scenario: Backend returns bare payload
- **WHEN** a Chan API endpoint returns a bare array or object payload
- **THEN** the frontend API client SHALL return that payload to chart callers without requiring endpoint-specific response handling in chart components

### Requirement: Production web access is same-origin
The production deployment SHALL provide a same-origin web entrypoint for the frontend and required backend APIs.

#### Scenario: Gateway configuration is deployment-owned
- **WHEN** the same-origin web gateway is implemented
- **THEN** its Nginx configuration SHALL be tracked with deployment assets
- **AND** frontend application code SHALL consume gateway paths without owning backend route topology

#### Scenario: Browser loads the K-line page in production
- **WHEN** the browser loads the production K-line page
- **THEN** the page SHALL be served from the same origin used for API requests
- **AND** the browser SHALL NOT need to call backend port `8001` or Chan API port `8008` directly

#### Scenario: Frontend calls Mist backend APIs through the web gateway
- **WHEN** the frontend requests securities or K-line collection in production
- **THEN** the request SHALL use a same-origin path such as `/api/mist/...`
- **AND** the web gateway SHALL proxy the request to the Mist backend service

#### Scenario: Frontend calls Chan analysis APIs through the web gateway
- **WHEN** the frontend requests K-line or Chan analysis data in production
- **THEN** the request SHALL use a same-origin path such as `/api/chan/...`
- **AND** the web gateway SHALL proxy the request to the configured analysis service

#### Scenario: Datasource remains internal
- **WHEN** production web routing is configured
- **THEN** the web gateway SHALL NOT expose the Python datasource service as a browser-facing API path for this MVP

### Requirement: Fixture data is explicit development fallback only
The frontend SHALL not silently use fixture data for product live K-line requests.

#### Scenario: Live K-line request fails
- **WHEN** a live K-line request fails in normal runtime mode
- **THEN** the page SHALL show an error state
- **AND** the page SHALL NOT silently render fixture data

#### Scenario: Development fallback is enabled
- **WHEN** an explicit development fallback flag is enabled
- **THEN** the frontend MAY render fixture data
- **AND** the page SHALL make the fallback state distinguishable from live data
