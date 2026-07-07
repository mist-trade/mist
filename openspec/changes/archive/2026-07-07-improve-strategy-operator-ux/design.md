## Context

The Mist backend now exposes version-first strategy APIs for strategy
definitions, signal history, alert events, manual scans, and signal-level
backtests. `mist-fe` is a Next app whose current product surface is the K-line
page at `/k`; it has a small shared API client and Jest/React Testing Library
coverage for page behavior.

The first operator UX should make the backend strategy platform usable without
expanding the backend model. It should be dense and operational: users need to
inspect strategy state, edit rule JSON carefully, trigger scans/backtests, and
triage alerts. It should not become a marketing page or a portfolio analytics
product.

## Goals / Non-Goals

**Goals:**

- Add a `/strategies` workspace in `mist-fe`.
- Expose registry, version, signal, alert, scan, and signal-level backtest
  workflows through one operator surface.
- Use the Mist backend API base path and `/v1/*` strategy endpoints only.
- Keep rule editing explicit and auditable by showing persisted JSON and
  validation/API errors.
- Add focused frontend tests for API client calls, rendering, key actions, and
  error states.

**Non-Goals:**

- Portfolio-level backtesting, order simulation, cash accounting, fee/slippage
  modeling, equity curves, or return attribution.
- A strategy DSL visual builder beyond JSON editing.
- Direct datasource calls, raw provider endpoints, or frontend-side strategy
  rule execution.
- New backend endpoints, entities, migrations, or schedule jobs.
- A broad redesign of the existing K-line page.

## Decisions

### Decision 1: Build one `/strategies` workspace with internal tabs

The first UX should be a single app route with tabbed views for:

- Registry
- Signals
- Alerts
- Backtests

This keeps navigation simple while the strategy platform is still young. The
route can use query parameters for selected strategy, selected tab, filters,
and backtest run selection.

Alternative considered: separate routes such as `/strategies/:id`,
`/strategy-signals`, and `/strategy-backtests`. That scales later, but it adds
route coordination before the core workflows are proven.

### Decision 2: Keep the UI operational and dense

The screen should use a fixed page shell with a left registry list and a main
work area. Repeated records may use compact tables or cards, but page sections
should remain unframed bands or panels rather than nested decorative cards.

Alternative considered: build a landing or hero-style strategy page. That would
not help the target operator compare definitions, events, and backtest results
quickly.

### Decision 3: Extend the existing frontend API client

`app/api/client.ts` should gain typed strategy functions for:

```text
GET    /v1/strategies
POST   /v1/strategies
GET    /v1/strategies/:id
PATCH  /v1/strategies/:id
POST   /v1/strategies/:id/enable
POST   /v1/strategies/:id/disable
GET    /v1/strategies/:id/versions
GET    /v1/strategy-signals
GET    /v1/strategy-alert-events
POST   /v1/strategy-alert-events/:id/ack
POST   /v1/strategy-scans/run
POST   /v1/strategy-backtests
GET    /v1/strategy-backtests/:runId
GET    /v1/strategy-backtests/:runId/signals
```

These calls should use `getMistApiBase()` so local and deployed frontends keep
the same same-origin gateway behavior. The strategy UX must not call
datasource, raw provider, or analysis service URLs directly.

Alternative considered: add a separate strategy API base variable. That would
reintroduce service-boundary drift and make deployment harder to reason about.

### Decision 4: Store rule editing as JSON text in the UI

The first editor should render rule JSON in a text area, parse it before
submit, and show syntax/API validation errors inline. It should not try to
evaluate rules in the browser.

Alternative considered: build a visual condition builder immediately. That is
more approachable, but it would require a second UI expression model before the
backend DSL stabilizes through real usage.

### Decision 5: Treat backtests as signal result inspection

The backtest view should create runs and show run status, signal count, matched
security count, timestamps, and signal rows. It should explicitly omit capital,
position, order, fill, fee, slippage, equity curve, and return fields.

Alternative considered: add empty portfolio panels. That would imply a
capability the backend intentionally does not have yet.

## Data Flow

```text
Operator
  -> /strategies in mist-fe
  -> app/api/client.ts getMistApiBase()
  -> /api/mist/v1/* gateway path
  -> apps/mist strategy controllers
  -> MySQL strategy tables
```

The page should load registry data first. Detail, versions, signals, alerts,
and backtest run details can load on demand for the selected tab and filters.
After mutating actions, the page should refresh only the affected data family
instead of reloading every tab.

## Error Handling

- Network and envelope errors must be visible near the affected workflow.
- JSON parse errors must block submit before API calls.
- Empty states must distinguish no data from failed loads.
- Mutating actions must disable while in flight and preserve the current
  selection after completion where possible.

## Risks / Trade-offs

- The first page could grow large -> Split into focused components under
  `app/strategies/` once the workflow skeleton is clear.
- Backend pagination may be limited -> Keep frontend filters simple and avoid
  assuming infinite scroll or large client-side datasets.
- Rule JSON editing is easy to misuse -> Show parse errors and backend
  validation errors directly; defer visual builders until DSL usage is clearer.
- Backtests are synchronous -> Show loading and completion state; do not add
  polling semantics until backend execution becomes asynchronous.

## Migration Plan

1. Add typed strategy API client methods and tests in `mist-fe`.
2. Add `/strategies` route and component tests.
3. Add registry, detail/version, signal, alert, scan, and backtest workflows.
4. Add a navigation entry or redirect affordance from the existing app surface.
5. Validate with frontend test, typecheck, lint, and build commands.

Rollback is straightforward because this change is frontend-only: remove the
new route and API client methods without touching backend strategy contracts.

## Open Questions

- Whether the first production navigation should default to `/k` or
  `/strategies`.
- Whether a later child change should split `/strategies` into dedicated routes
  once operator usage stabilizes.
