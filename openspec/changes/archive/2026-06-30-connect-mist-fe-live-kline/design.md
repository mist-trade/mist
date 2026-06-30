## Context

`mist-fe` currently treats `/k` as a fixture-driven chart page. The page sets `USE_MOCK_KLINE = true`, uses checked-in K-line test results, and leaves the live fetch branch unimplemented. The existing chart stack is still valuable: K-lines feed `KPanel`, while merge-k, bi, fenxing, and channel overlays are calculated through existing backend `/chan/*` endpoints.

The backend already owns the product datasource boundary. The main Mist backend on port `8001` exposes security management, manual collection, indicators, and Chan endpoints. The dedicated `chan-api` service on port `8008` exposes Chan and indicator-style analysis endpoints without the full security/collector surface. The backend TDX source already maps collection requests to the Python datasource normalized `/v1/bars/query` endpoint; the browser should not call the Python datasource or raw TDX debug endpoints directly.

The current deployed services expose different ports. If `mist-fe` calls `8001` and `8008` directly from the browser while being served from another origin, the MVP will inherit CORS and environment-specific URL problems. The production path therefore needs a same-origin web gateway, most likely Nginx, in front of the frontend and backend APIs.

One response-shape inconsistency also matters for this MVP: the main Mist backend wraps responses in the unified `{ success, data, ... }` envelope, while the dedicated chan app currently returns bare endpoint payloads. The frontend client needs a small response normalizer so it can call both surfaces safely.

## Goals / Non-Goals

**Goals:**

- Let users query K-line charts by stock code or stock name.
- Let users choose code, source, period, start date, and end date through URL-backed page state.
- Let users manually refresh K-line data from the backend datasource path using `POST /v1/collector/collect`.
- Render live backend K-line data with the existing KPanel and existing Chan overlays.
- Keep all datasource details behind the Mist backend.
- Serve production frontend and API requests through one browser origin.
- Preserve fixture data as an explicit development fallback only.

**Non-Goals:**

- Do not add realtime WebSocket quote or snapshot panels in this MVP.
- Do not add watchlists, alerts, auth, portfolio state, or saved layouts.
- Do not change the Python datasource `/v1/bars/query` contract.
- Do not require the browser to connect to `mist-datasource` on port `9001`, `mist-backend` on port `8001`, or `chan-api` on port `8008` directly in production.
- Do not redesign backend security initialization or source configuration.

## Decisions

1. **Use a backend-first flow: collect, then read.**

   The refresh action posts the selected query to `POST /v1/collector/collect`. After collection succeeds, the page reads the selected range from `POST /indicator/k` and calculates Chan overlays with existing `/chan/*` endpoints. This keeps datasource access inside NestJS, reuses existing persistence, and avoids adding a new browser-facing datasource contract.

   Alternative considered: have `mist-fe` call Python datasource `/v1/bars/query` directly. Rejected because it leaks provider topology, bypasses security/source configuration, and conflicts with the existing backend datasource integration boundary.

2. **Make search URL-backed and stock-table backed.**

   The MVP uses `GET /security/v1/all` to load available securities and filters by canonical code or name in the frontend. The selected stock updates `/k` search params. If the security list becomes large enough to affect load time, a later backend `GET /security/v1/search?q=` endpoint can replace client-side filtering without changing the page model.

   Alternative considered: query the TDX security universe directly from datasource. Rejected for the MVP because the existing backend security table already defines what Mist can collect and analyze.

3. **Use Nginx as the production same-origin web gateway.**

   Production should expose a single browser origin that serves the frontend and proxies API paths to the right internal service. A concrete path split for the MVP:

   - `/` -> `mist-fe`
   - `/api/mist/` -> `mist-backend:8001`
   - `/api/chan/` -> `chan-api:8008` or `mist-backend:8001` if a dedicated chan service is not deployed

   The Nginx configuration belongs in `mist-deploy`, not `mist-fe`, because it is deployment topology rather than frontend application code. The intended tracked layout is `mist-deploy/docker/nginx/nginx.conf`, with `mist-deploy/docker/compose.yaml` adding a `web-gateway` service on the same Docker network as `mist-fe`, `mist-backend`, and `chan-api`.

   The frontend should call relative paths in production, such as `/api/mist/security/v1/all` and `/api/chan/chan/bi`. This avoids CORS, keeps backend container names private, and matches the existing Docker-stack plus host-datasource deployment style.

   Alternative considered: enable CORS on the Nest services and keep direct browser calls to `8001` and `8008`. Rejected because it creates environment-specific public API origins and does not solve production routing for a single web URL.

4. **Keep development base URLs configurable.**

   Local development can still point directly at backend ports when Nginx is not running. Recommended environment shape:

   - `NEXT_PUBLIC_MIST_API_BASE_PATH`, default `/api/mist`
   - `NEXT_PUBLIC_CHAN_API_BASE_PATH`, default `/api/chan`
   - `NEXT_PUBLIC_MIST_API_BASE_URL`, optional local override such as `http://127.0.0.1:8001`
   - `NEXT_PUBLIC_CHAN_API_BASE_URL`, optional local override such as `http://127.0.0.1:8008`
   - `NEXT_PUBLIC_API_BASE_URL`, legacy fallback for existing analysis calls until docs and code are migrated

   Alternative considered: keep one `NEXT_PUBLIC_API_BASE_URL`. Rejected because the current default points at `8008`, which cannot own securities and manual collection.

5. **Keep mutating refresh requests behind same-origin routes.**

   The refresh interaction mutates persisted K-line data by calling collection. In production, that request should go through the same-origin Nginx path. In local development without Nginx, a Next.js route handler or direct local backend URL can be used.

   Alternative considered: fetch backend endpoints directly from the client component. Rejected because the Nest backend does not currently enable browser CORS and deployment may keep APIs on different ports.

6. **Normalize backend envelopes at the frontend API client boundary.**

   Frontend API helpers should accept either a bare payload or the main backend envelope and return typed payload data to callers. Chart components should never need to know which backend entrypoint returned the data.

## Risks / Trade-offs

- Refresh can be slow for large date ranges -> Keep refresh explicit, show pending/error states, and do not auto-refresh on every page render.
- The security list may grow large -> Start with `GET /security/v1/all`; add server-side search later if load time becomes visible.
- Different backend entrypoints return different payload shapes -> Normalize bare and enveloped responses in one API helper.
- Multiple public service ports cause CORS and mixed-origin failures -> Put Nginx in front of the frontend and APIs, and make production frontend requests relative to that origin.
- K-line data may be absent before first refresh -> Show an empty state with a clear refresh action rather than silently falling back to fixtures.
- Collector writes may fail if a security lacks enabled source config -> Surface the backend error and keep the selected query in the URL for retry after source setup.

## Migration Plan

1. Add the Nginx/web-gateway config under `mist-deploy/docker/nginx/` and deployment wiring in `mist-deploy/docker/compose.yaml` for same-origin frontend, Mist backend, and Chan API routing.
2. Add new frontend API path/base configuration and response normalization without removing the legacy `NEXT_PUBLIC_API_BASE_URL`.
3. Add stock loading/search and URL-backed query state to `/k`.
4. Replace the hardcoded fixture path with live read behavior and explicit empty/error states.
5. Add the manual refresh action that calls backend collection and then reloads the selected chart.
6. Update README and `.env.example` with same-origin paths, local override URLs, and the MVP workflow.

Rollback is limited to `mist-fe`: restore the fixture-driven `/k` page or keep the fixture fallback enabled while backend issues are fixed. Backend datasource contracts are unchanged.

## Open Questions

- None for the MVP. A later change should decide whether to add backend server-side security search when the security table size makes client filtering too heavy.
