## Context

`mist-datasource` already has normalized `/v1` routes, runtime-safety tests, and
canonical WebSocket message helpers from earlier remediation waves. The
remaining datasource P2 items are mostly local hygiene issues: route helpers
still import `tdx.main` lazily, provider normalization repeats key and field
name logic, selected provider/adapter methods expose broad `Any` or raw dict
contracts, and timeout/empty-value semantics are split across modules.

The batch must preserve the external normalized HTTP/WebSocket payloads because
NestJS and the deployment smoke tests already depend on them.

## Goals / Non-Goals

**Goals:**

- Close the selected datasource P2 review IDs with red/green tests and
  evidence.
- Make route access to the TDX provider come from FastAPI app state, with
  compatibility fallback only where tests or legacy app setup still need it.
- Add small shared helpers for normalized key lookup, field naming conversion,
  optional numeric conversion, and formula timeout defaults.
- Introduce typed model/serializer boundaries for selected provider outputs,
  especially snapshot and formula-ish normalization paths where raw dict
  handling currently spreads.
- Tighten selected adapter annotations without changing the provider protocol.
- Keep live SDK behavior behind existing adapters and avoid adding new runtime
  dependencies.

**Non-Goals:**

- Do not delete the legacy `/api/tdx/*` route family in this batch.
- Do not rewrite every provider method or every SDK wrapper.
- Do not change normalized `/v1` response envelopes.
- Do not require live TDX/QMT terminals for ordinary unit verification.

## Decisions

1. **Use local helper extraction before broad class reshaping.**
   The provider file is large, but a full split would mix risk with cleanup.
   This batch creates focused helpers and model serializers that tests can pin
   down, then replaces selected duplicated patterns.

2. **Use `request.app.state` for route dependencies.**
   New route helper behavior should prefer app state and raise a clear HTTP
   error when missing. A narrow fallback to module globals is acceptable only
   for compatibility during this transition, and static tests prevent new
   delayed `import tdx.main` helpers in touched routes.

3. **Centralize key normalization once.**
   A helper such as `normalize_native_key()` owns
   underscore/space/case-insensitive key matching. Provider normalization code
   calls that helper instead of reimplementing string replacement loops.

4. **Keep empty numeric semantics explicit.**
   Existing bar normalization uses `normalize_number()` where missing numeric
   fields become `0.0`; optional provider fields should become `None`. This
   batch names and tests that distinction rather than forcing one global rule.

5. **Config owns formula timeout defaults.**
   Request models can keep validation defaults, but the operational default
   used by provider calls should come from settings so future deployments do
   not require code edits.

## Risks / Trade-offs

- **Risk: Static contracts can become brittle** -> Keep them scoped to selected
  route/helper patterns rather than full-file style policing.
- **Risk: App-state migration breaks tests that monkeypatch module globals** ->
  Update tests to set app state where practical and keep a transition fallback
  for untouched legacy paths.
- **Risk: Typed model boundaries become too broad** -> Start with selected
  snapshot/formula/field serialization helpers and leave full provider typing
  for later batches.
- **Risk: QMT type tightening conflicts with optional SDK availability** -> Use
  protocols and narrow aliases only around public method returns; keep import
  behavior lazy.
