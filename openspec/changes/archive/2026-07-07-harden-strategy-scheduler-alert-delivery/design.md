## Context

Strategy registration, live signal scanning, alert persistence, signal-level
backtesting, and operator UX are now implemented. The remaining operational
gap is automation: scans are manually triggered from Mist API/UI, and alert
events can be acknowledged but do not yet have a controlled consumption path
for AstrBot or `mist-skills`.

`apps/schedule` currently owns K-line collection cron jobs and imports the
collector module from `apps/mist`. It does not import strategy providers or
strategy entities. `apps/mist/src/strategy/strategy.module.ts` currently mixes
REST controllers with reusable strategy providers, so schedule cannot safely
import it without also pulling public strategy controllers into the schedule
app.

## Goals / Non-Goals

**Goals:**

- Run strategy scans automatically after completed K-line collection windows.
- Reuse the same `StrategyScanService`, context builder, and rule evaluator
  used by manual scans.
- Keep public strategy APIs owned by `apps/mist`; `apps/schedule` only hosts
  cron jobs.
- Add controlled alert event consumption/delivery state transitions for
  external consumers.
- Add `mist-skills` helpers for pulling pending strategy alerts and marking
  delivery outcomes through Mist backend APIs.
- Add deterministic tests across Mist backend, schedule job wiring, and
  `mist-skills`.

**Non-Goals:**

- Moving strategy rule execution into `mist-skills`, AstrBot, QMT, or
  datasource services.
- Direct datasource polling from `mist-fe` or `mist-skills`.
- Replacing manual scan APIs or operator acknowledgement.
- Portfolio-level backtesting.
- Full notification provider abstraction beyond the first controlled
  Mist-to-skills consumption contract.

## Decisions

### Decision 1: Extract reusable strategy providers into `StrategyCoreModule`

Create a core module for strategy providers, entities, evaluator, context
builder, scan service, alert service, signal service, definition service, and
backtest service. `StrategyModule` imports the core module and adds public REST
controllers. `apps/schedule` imports only the core module.

Alternative considered: import `StrategyModule` directly into schedule. That
would risk exposing REST controllers from the schedule app and violates the
roadmap boundary that schedule only runs jobs.

### Decision 2: Run scans after collection methods finish

The first hardening pass should trigger `StrategyScanService.runScan({ period
})` after each K-line collection method completes for the same period. This
keeps scan timing aligned to the existing K close schedule and avoids adding a
second cron calendar.

Alternative considered: create completely separate strategy scan cron
expressions. That duplicates the existing K boundary schedule and can scan
before collection finishes.

### Decision 3: Add delivery state APIs on persisted alert events

Mist backend should continue to persist `StrategyAlertEvent` first. External
consumers should query pending events and mark them delivered or failed after
their own delivery attempt. Operator acknowledgement remains separate.

The first API shape should stay under version-first paths:

```text
GET  /v1/strategy-alert-events?status=pending
POST /v1/strategy-alert-events/:id/delivered
POST /v1/strategy-alert-events/:id/failed
POST /v1/strategy-alert-events/:id/ack
```

Alternative considered: have `mist-skills` write directly to the database.
That breaks API boundaries and bypasses backend validation.

### Decision 4: Keep skills as consumers, not rule engines

`mist-skills` should add helper functions or a skill surface to fetch pending
strategy alert events and mark delivery results. It should not evaluate rules,
query datasource services, or create strategy signals.

Alternative considered: let AstrBot run rule scans. That would fork strategy
semantics and make backtesting/live results diverge.

## Data Flow

```text
apps/schedule cron
  -> collect K-lines for period
  -> StrategyScanService.runScan({ period })
  -> StrategySignal + StrategyAlertEvent rows

mist-skills / AstrBot
  -> GET /v1/strategy-alert-events?status=pending
  -> deliver message through bot/runtime
  -> POST /v1/strategy-alert-events/:id/delivered or /failed

operator
  -> /strategies UI
  -> POST /v1/strategy-alert-events/:id/ack
```

## Risks / Trade-offs

- Schedule imports too much backend surface -> Extract `StrategyCoreModule` and
  test that schedule does not own strategy REST controllers.
- Duplicate alerts from repeated cron runs -> Continue relying on
  `StrategyScanService` dedupe keys and add tests around scheduled scans.
- Delivery retries need clearer policy -> First version records failed state
  and result metadata; retry scheduling can be a later child change.
- Alert payloads may be too sparse for bot messages -> Use persisted signal
  and alert event data first; enrich response shape later through backend APIs
  if operator usage proves it necessary.

## Migration Plan

1. Add backend tests for alert delivered/failed transitions and route paths.
2. Extract `StrategyCoreModule` and update `StrategyModule`.
3. Import strategy core into `apps/schedule` and add scheduled scan job/tests.
4. Add `mist-skills` client helpers and tests for pending/delivered/failed
   alert flow.
5. Update README/runbook docs for the scheduled scan and alert consumption
   contract.

Rollback keeps manual scans and operator acknowledgement intact: disable or
remove the schedule job and leave persisted alert APIs available.

## Open Questions

- Whether failed alert delivery should be retried by `mist-skills`, AstrBot, or
  a later backend retry worker.
- Whether delivered events should still require operator acknowledgement before
  leaving an operator-facing queue.
