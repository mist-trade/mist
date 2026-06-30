## Why

`mist-fe` currently renders the K-line page from checked-in fixture data and leaves the live API path unimplemented. The next useful frontend increment is a narrow live K-line viewer that lets a user search for a stock, refresh real K-line data through the existing backend datasource path, and render the existing Chan overlays against that data.

## What Changes

- Add a `mist-fe` K-line page flow that accepts stock, source, period, and date range parameters instead of using a hardcoded fixture dataset.
- Add a stock query/selection UI backed by Mist backend securities data.
- Add a frontend API client path that can trigger backend K-line collection through `POST /v1/collector/collect` before reading K-lines through `POST /indicator/k`.
- Keep Chan overlay rendering on the existing backend endpoints: `/chan/merge-k`, `/chan/bi`, `/chan/fenxing`, and `/chan/channel`.
- Add a same-origin Nginx reverse-proxy entrypoint for the frontend so browser requests do not depend on cross-origin backend ports.
- Keep fixture data only as an explicit development fallback, not the default product path.
- Exclude realtime quote/snapshot WebSocket panels, watchlists, and direct browser-to-datasource connections from this MVP.

## Capabilities

### New Capabilities
- `frontend-live-kline-viewer`: Covers the frontend live K-line query, refresh, stock selection, and chart rendering behavior.

### Modified Capabilities
- None.

## Impact

- Affects `mist-fe` page routing, API client code, K-panel data loading, and tests.
- Affects deploy configuration by introducing an Nginx/web-gateway route in front of `mist-fe`, `mist-backend`, and `chan-api`.
- Uses existing Mist backend endpoints: `GET /security/v1/all`, `POST /v1/collector/collect`, `POST /indicator/k`, and existing `/chan/*` endpoints.
- Preserves the existing production boundary: browser -> Mist backend/Chan API -> Python datasource -> TDX.
- Does not change the datasource `/v1/bars/query` contract or expose datasource host/port details to the browser.
