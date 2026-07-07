## Why

The strategy registry now stores versioned declarative strategies, but enabled
strategies still do not produce signals or alert events. This change adds the
first backend scanning path so strategy definitions can turn completed market
data into persisted signal and alert records.

## What Changes

- Add a shared strategy scan service that evaluates enabled strategy
  definitions against the latest completed K-line data for their configured
  target universe, period, and source.
- Add a deterministic rule evaluator for first-phase declarative expressions
  over built evaluation context values.
- Persist `StrategySignal` and `StrategyAlertEvent` records when a strategy
  matches.
- Add duplicate suppression through alert dedupe keys so repeated scans do not
  create duplicate alert events for the same strategy/version/security/time.
- Add a Mist backend manual scan endpoint for operator-triggered scans under
  `/v1/strategy-scans/run`; this is the first callable surface and the later
  schedule job will call the same service.
- Keep AstrBot delivery, webhook push, scheduled cron wiring, indicator/Chan
  evaluation contexts, and portfolio/backtest execution out of scope.

## Capabilities

### New Capabilities

- `strategy-signal-alerts`: Enabled strategy scanning, declarative rule
  evaluation over current K-line context, persisted live signals, persisted
  alert events, duplicate suppression, and operator-triggered scan APIs.

### Modified Capabilities

None. This builds on `strategy-definition-registry` without changing its
accepted requirements.

## Impact

- Affects `apps/mist/src/strategy/**` by adding evaluator, context builder,
  scan service, scan DTOs, and scan controller.
- Uses existing shared entities `StrategyDefinition`, `StrategyVersion`,
  `StrategySignal`, `StrategyAlertEvent`, `K`, and `Security`.
- Adds focused tests for rule evaluation, scan persistence, duplicate
  suppression, and route metadata.
- Does not add database tables, because required signal and alert tables were
  introduced by `add-strategy-definition-registry`.
- Does not modify datasource APIs, collector APIs, gateway prefixes, frontend,
  `mist-skills`, or `apps/schedule` runtime jobs in this change.
