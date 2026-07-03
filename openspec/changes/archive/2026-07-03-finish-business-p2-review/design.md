## Context

The original review classified monitoring, frontend, and datasource work as
business-facing P2 before deploy-script cleanup. Since that review, two large
business batches have already been archived: `repair-monitoring-health-alerts`
closed the monitoring health/probe/metric findings, and
`fix-frontend-runtime-quality` closed the frontend runtime quality findings.
The current code still shows datasource route-layer duplication: many TDX
legacy and QMT REST routes each catch `Exception` and translate it to the same
500 HTTP error, and QMT WebSocket still reads runtime singletons through
`qmt.main` instead of app state. The TDX and QMT adapter clients also still
spread raw SDK `Exception` handling across many method bodies instead of
centralizing native SDK exception conversion at the adapter call helper.

## Goals / Non-Goals

**Goals:**

- Preserve the already completed monitoring and frontend P2 work through
  explicit verification instead of reworking stable code.
- Finish the visible datasource route/runtime P2 residue with tests first.
- Keep TDX legacy routes, QMT REST routes, and QMT WebSocket payload shapes
  backward compatible.
- Record exact evidence so the remaining deploy P2 work can start from a clean
  business P2 baseline.

**Non-Goals:**

- Do not redesign TDX/QMT SDK adapters or remove legacy datasource routes.
- Do not change frontend UI behavior or monitoring metric names.
- Do not touch `mist-deploy`; deploy script hygiene follows this change.

## Decisions

1. **Verify monitoring and frontend rather than editing them again.**
   The archived changes already include targeted tests and evidence for the
   listed monitoring and frontend P2 IDs. Re-editing those repos would create
   churn without a current failing symptom, so this change treats them as audit
   and regression-verification scope.

2. **Centralize REST route exception translation in datasource route helpers.**
   TDX legacy and QMT REST routes retain their current response bodies, but the
   repeated `except Exception -> HTTPException(500)` blocks move to shared
   `call_tdx_adapter` and `call_qmt_adapter` helpers. This keeps route files
   focused on request parsing and response shaping.

3. **Use FastAPI app state for QMT WebSocket runtime dependencies.**
   QMT already syncs adapter and WebSocket manager into `app.state`. The WS
   route should use the same dependency pattern as the rest of datasource
   routing, avoiding direct imports of `qmt.main` for runtime singletons.

4. **Centralize raw SDK exception conversion without redesigning adapters.**
   The deeper provider typing/model work remains out of scope, but raw SDK
   exception conversion itself is safe to centralize without live Windows SDK
   access. `_call_tq` and `_call_xtdata` become the only adapter places that
   catch bare SDK exceptions; method-level wrappers may preserve existing
   `AdapterError` messages without catching raw `Exception`.

## Risks / Trade-offs

- **Route helper hides call-site context** -> keep helper narrow and preserve
  the existing HTTP status/detail behavior exactly.
- **QMT WebSocket tests relied on globals** -> update tests to inject
  `app.state.qmt_adapter`, matching production lifespan state.
- **Business P2 scope can drift** -> require evidence that monitoring and
  frontend are verification-only here, while datasource receives code changes.
- **Adapter helper messages can become nested** -> keep method-level
  `AdapterError` wrapping compatible and verify existing non-live adapter tests.
