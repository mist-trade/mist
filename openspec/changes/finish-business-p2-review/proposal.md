## Why

The remaining business-facing P2 review work should close before deployment
script hygiene, but prior batches already fixed the main monitoring and frontend
P2 clusters. This change records that state and finishes the remaining
datasource route/runtime P2 cleanup still visible in current code.

## What Changes

- Verify that `mist-monitoring` P2 health/probe/metric items remain covered by
  the archived monitoring alert repair and current code.
- Verify that `mist-fe` P2 runtime/frontend quality items remain covered by the
  archived frontend runtime quality batch and current code.
- Close remaining `mist-datasource` route-layer P2 duplication by moving REST
  adapter exception wrapping into shared helpers.
- Close remaining datasource adapter SDK exception-wrapper duplication by
  centralizing raw SDK exception conversion in adapter call helpers.
- Move QMT WebSocket runtime singleton access from `qmt.main` globals to
  FastAPI `app.state` helpers.
- Add failing tests first for the remaining datasource P2 checks, then keep
  targeted and full non-live datasource verification green.

## Capabilities

### New Capabilities

- `review-p2-business-completion`: Tracks the business P2 completion pass for
  monitoring, frontend, and datasource repositories.

### Modified Capabilities

- None.

## Impact

- Affected repositories: `mist`, `mist-datasource`.
- Verification-only repositories: `mist-monitoring`, `mist-fe`.
- Affected datasource areas: TDX/QMT adapter call helpers, TDX legacy REST
  routes, QMT REST routes, QMT WebSocket dependency resolution, repository
  hygiene tests, and QMT WebSocket integration tests.
- No public route path, response envelope, Windows service, frontend runtime, or
  monitoring metric contract change is intended.
