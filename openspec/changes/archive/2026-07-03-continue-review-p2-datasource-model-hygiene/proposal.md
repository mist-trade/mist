## Why

The next remaining P2 cluster is concentrated in `mist-datasource`: typed
provider boundaries, route/global dependency cleanup, field-name normalization,
and exception semantics. Previous remediation waves stabilized runtime
concurrency and WebSocket contracts; this batch tightens the Python datasource
model layer so future provider work has clearer types and fewer duplicate
conversion paths.

## What Changes

- Select and close CODE_REVIEW M9 and L6 plus CODE_SMELL_REVIEW R2.4, P2.4,
  T2.1, T2.2, T2.3, M2.1, M2.3, N2.4, C2.1, O2.4, and F2.3.
- Add failing unit/static tests before implementation for route app-state
  access, ruff hygiene, provider typed models, key normalization, timeout
  config, numeric empty-value semantics, health error visibility, and field
  naming conversion.
- Replace route-level delayed imports of `tdx.main` with FastAPI app-state
  helpers where this batch touches routes.
- Introduce narrow typed model/serializer helpers for selected provider outputs
  instead of returning or transforming ad hoc `dict[str, Any]`.
- Centralize repeated key and field-name normalization helpers.
- Move selected hard-coded datasource timeout defaults behind config.
- Keep external normalized HTTP and WebSocket response shapes compatible.

## Capabilities

### New Capabilities

- `review-p2-datasource-model-hygiene`: Tracks the selected P2
  `mist-datasource` model/type/normalization remediation batch.

### Modified Capabilities

- None.

## Impact

- Affected repository: `mist-datasource`.
- Affected areas: TDX/QMT provider and adapter typing, route helpers, config,
  key/field normalization helpers, health error handling, focused Python tests,
  and OpenSpec evidence in `mist`.
- No external route rename, provider protocol change, or Windows service
  deployment change is intended.
