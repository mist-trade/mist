## 1. Red Tests And Contracts

- [x] 1.1 Add failing repository hygiene tests for selected review IDs and the
      explicit batch evidence requirement.
- [x] 1.2 Add failing tests for TDX route dependency helpers resolving providers
      from FastAPI app state instead of delayed `tdx.main` imports.
- [x] 1.3 Add failing tests for shared native key normalization, field naming
      serialization, and optional numeric empty-value semantics.
- [x] 1.4 Add failing tests for selected typed provider/model serializers and
      selected TDX/QMT adapter return annotations.
- [x] 1.5 Add failing tests for configurable formula timeout defaults and
      health error visibility.
- [x] 1.6 Run focused tests/static checks and record the expected red failures.

## 2. Route Dependency And Documentation Cleanup

- [x] 2.1 Add app-state provider/adapter dependency helpers for touched TDX
      routes.
- [x] 2.2 Replace selected delayed `import tdx.main` helpers in touched routes.
- [x] 2.3 Update datasource repository guidance so it describes app-state route
      dependencies instead of delayed main imports.

## 3. Normalization And Model Helpers

- [x] 3.1 Add shared native key normalization and field-name serialization
      helpers.
- [x] 3.2 Route selected provider normalization paths through the shared helpers.
- [x] 3.3 Make optional numeric conversion semantics explicit and keep required
      numeric zero defaults scoped to bar normalization.
- [x] 3.4 Add selected typed provider serializer/model boundaries without
      changing public normalized response shapes.

## 4. Adapter Typing, Timeout, And Health Semantics

- [x] 4.1 Narrow selected TDX adapter return annotations.
- [x] 4.2 Narrow selected QMT adapter return annotations.
- [x] 4.3 Move selected formula timeout defaults to config-driven settings.
- [x] 4.4 Preserve health response envelopes while surfacing provider health
      exceptions in the response payload.

## 5. Verification And Evidence

- [x] 5.1 Run focused datasource unit/integration tests for the touched areas.
- [x] 5.2 Run datasource lint/static checks used by this repository.
- [x] 5.3 Run `openspec validate continue-review-p2-datasource-model-hygiene --strict`.
- [x] 5.4 Record review-ID to changed-file to verification-command evidence.
- [x] 5.5 Confirm unrelated `verify-mist-production-baseline` document changes
      remain unstaged.
