## Context

`add-strategy-definition-registry` introduced versioned strategy definitions,
validated rule JSON, signal tables, alert event tables, and query APIs. The
next product gap is turning enabled definitions into persisted signal/alert
events. The roadmap allows scans to run from `apps/schedule` later, but public
APIs must stay in `apps/mist`.

This child change adds a shared scan service in `apps/mist/src/strategy`. The
service is callable by a manual Mist API now and can be imported by a future
schedule job without duplicating rule evaluation.

## Goals / Non-Goals

**Goals:**

- Evaluate enabled strategies against latest completed K-line data.
- Build a small evaluation context containing `k` and `security` facts.
- Persist live `StrategySignal` and `StrategyAlertEvent` records for matches.
- Suppress duplicate alert events across repeated scans.
- Expose a manual operator scan endpoint at `/v1/strategy-scans/run`.
- Keep the implementation deterministic and testable.

**Non-Goals:**

- Add cron wiring in `apps/schedule`.
- Deliver alert events to AstrBot, webhook, email, or other external surfaces.
- Evaluate indicator or Chan contexts during this first scan implementation.
- Implement historical backtest replay or portfolio-level simulation.

## Decisions

### Decision 1: Scan latest completed K-line records first

The first scanner reads the latest K record for each enabled strategy target,
period, and source. This gives a deterministic first alert path without
changing collector behavior or datasource routes.

Alternative considered: subscribe directly to live quote streams. That would
couple alert triggering to live datasource leadership and is better handled
after persisted K-line completion semantics are stable.

### Decision 2: Keep rule evaluation pure

`StrategyRuleEvaluator` accepts a rule JSON object and a built context. It
returns a boolean and has no database dependencies. `StrategyScanService`
handles repository access and persistence.

Alternative considered: evaluate rules inside the scan service. That would make
unit tests harder and duplicate logic when backtests later replay the same
rules.

### Decision 3: Use alert dedupe keys

The dedupe key combines strategy definition id, strategy version id, security
code, period, source, and signal timestamp. If an alert event with the same key
already exists, the scan skips creating another signal or alert.

Alternative considered: rely on database uniqueness only. The existing
registry migration already has a unique dedupe key, but explicit lookup makes
the service result explain skipped duplicates and avoids intentionally throwing
on normal repeated scans.

### Decision 4: Manual API first, schedule later

The manual `/v1/strategy-scans/run` endpoint lets operators and tests trigger
the same scanner that `apps/schedule` will call later. This change does not
introduce cron behavior, so schedule workload remains unchanged.

Alternative considered: add cron immediately. That would mix alert semantics
with operational timing before the scanner is verified.

## Risks / Trade-offs

- Indicator/Chan rules do not match yet -> The evaluator supports path lookup,
  but the first context builder only fills `k` and `security`; later child work
  can enrich context without changing persistence.
- Latest K-line selection can miss historical matches -> This is live alert
  scanning, not backtesting; historical replay belongs to the signal-level
  backtest child change.
- Manual scan endpoint could be overused -> It is an operator/admin boundary
  for now; auth and scheduling remain separate platform concerns.

## Migration Plan

1. Add evaluator and context builder tests.
2. Add scan service tests for signal persistence and duplicate suppression.
3. Add scan controller metadata and delegation tests.
4. Register scan service/controller in `StrategyModule`.
5. Update README and roadmap disposition.
6. Run focused tests, typecheck, lint, and OpenSpec validation.
