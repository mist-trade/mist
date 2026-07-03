## 1. Scope And Business P2 Baseline

- [x] 1.1 Inspect archived monitoring P2 evidence and current
      `mist-monitoring` code for health/probe/metric leftovers.
- [x] 1.2 Inspect archived frontend P2 evidence and current `mist-fe` code for
      runtime-quality leftovers.
- [x] 1.3 Inspect current `mist-datasource` code for remaining route, WebSocket,
      and tooling P2 residue after previous datasource batches.
- [x] 1.4 Run current monitoring verification commands and record the result.
- [x] 1.5 Run current frontend verification commands and record the result.

## 2. Datasource Red Tests

- [x] 2.1 Add a failing repository hygiene test proving TDX legacy and QMT REST
      routes still duplicate bare adapter exception wrapping.
- [x] 2.2 Run the route error-wrapper test and confirm it fails on the intended
      route files.
- [x] 2.3 Add a failing repository hygiene test proving QMT route files still
      import `qmt.main` for runtime singletons.
- [x] 2.4 Run the QMT route singleton test and confirm it fails on
      `qmt/routes/ws.py`.
- [x] 2.5 Add a failing repository hygiene test proving adapter SDK exception
      wrapping still uses broad per-method `except Exception` handlers.
- [x] 2.6 Run the adapter SDK error-wrapper test and confirm it fails on the
      intended adapter methods.

## 3. Datasource Implementation

- [x] 3.1 Add shared `call_tdx_adapter` and `call_qmt_adapter` route helpers
      that preserve existing HTTP 500 behavior.
- [x] 3.2 Refactor TDX legacy REST routes to use the shared TDX adapter helper
      without changing response bodies or route paths.
- [x] 3.3 Refactor QMT REST routes to use the shared QMT adapter helper without
      changing response bodies or route paths.
- [x] 3.4 Refactor QMT WebSocket routing to read adapter and WebSocket manager
      dependencies from FastAPI app state.
- [x] 3.5 Update QMT WebSocket tests to inject adapter state through
      `app.state.qmt_adapter`.
- [x] 3.6 Centralize raw TDX/QMT SDK exception conversion in adapter call
      helpers while preserving method-level `AdapterError` context.

## 4. Verification And Evidence

- [x] 4.1 Re-run the targeted datasource repository hygiene tests and confirm
      they pass.
- [x] 4.2 Re-run QMT WebSocket contract tests and confirm they pass.
- [x] 4.3 Re-run the adapter SDK error-wrapper hygiene test and confirm it
      passes.
- [x] 4.4 Run datasource lint, typecheck, and non-live pytest.
- [x] 4.5 Run OpenSpec validation for `finish-business-p2-review`.
- [x] 4.6 Record final evidence mapping review scope to files and verification
      commands.
