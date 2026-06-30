## 1. Web Gateway and Deployment

- [x] 1.1 Add `mist-deploy/docker/nginx/nginx.conf` for the production web gateway.
- [x] 1.2 Configure the gateway to serve the frontend and proxy `/api/mist/` to `mist-backend:8001`.
- [x] 1.3 Add the `/api/chan/` proxy route to the same gateway, targeting `chan-api:8008` when deployed.
- [x] 1.4 Add or update Docker/Compose wiring in `mist-deploy/docker/compose.yaml` so `mist-fe`, `mist-backend`, `chan-api`, and the gateway run on the same Docker network.
- [x] 1.5 Add deployment docs for the single browser origin, route map, health checks, and local override URLs.
- [x] 1.6 Add deployment validation that checks the gateway route map and probes frontend, Mist backend, and Chan API paths through the gateway.

## 2. Frontend API Boundary

- [x] 2.1 Replace the single hardcoded frontend API base with separate Mist backend and Chan analysis path/base helpers.
- [x] 2.2 Default production frontend requests to same-origin relative paths such as `/api/mist` and `/api/chan`.
- [x] 2.3 Keep local development URL overrides for direct `8001` and `8008` access when the gateway is not running.
- [x] 2.4 Add a shared response normalizer that unwraps Mist unified envelopes and also accepts bare Chan API payloads.
- [x] 2.5 Add typed frontend API helpers for `GET /security/v1/all`, `POST /v1/collector/collect`, `POST /indicator/k`, and existing `/chan/*` requests.

## 3. Stock Query and URL State

- [x] 3.1 Add a stock query control on `/k` that loads securities from the Mist backend and filters by code or name.
- [x] 3.2 Add URL-backed chart parameters for `code`, `source`, `period`, `startDate`, and `endDate`.
- [x] 3.3 Preserve selected parameters across refresh, reload, and failed backend requests.
- [x] 3.4 Show a no-stock-selected state when `/k` has no selected code.
- [x] 3.5 Show recoverable stock-loading errors without clearing the current URL query.

## 4. Live K-line Flow

- [x] 4.1 Remove the default hardcoded fixture path from `/k` and replace it with live backend K-line loading.
- [x] 4.2 Add an explicit development fixture fallback flag and make fallback state visible when enabled.
- [x] 4.3 Add a manual refresh action that validates required parameters, calls backend collection, then reloads selected K-line data.
- [x] 4.4 Render empty K-line responses as an empty state instead of silently replacing them with fixture data.
- [x] 4.5 Keep Chan overlays wired to the selected live K-line data and avoid showing stale overlays after overlay request failures.

## 5. Tests and Verification

- [x] 5.1 Add frontend unit tests for API response normalization, API base/path resolution, and request payload shapes.
- [x] 5.2 Add frontend component tests for stock search, URL parameter updates, refresh validation, and empty/error states.
- [x] 5.3 Add or update deployment tests for Nginx route configuration and gateway health probes.
- [x] 5.4 Run `pnpm test` and `pnpm lint` in `mist-fe`.
- [x] 5.5 Confirm no backend code changed; targeted backend tests were not required.
- [x] 5.6 Run relevant `mist-deploy` script tests with `pwsh-preview` after gateway deployment changes.
