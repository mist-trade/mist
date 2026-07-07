## Why

Mist can now create strategies, scan manually, persist alert events, and show
them in the operator UI, but production usage still depends on a person pushing
manual scan and acknowledgement buttons. This change hardens the operational
loop: completed K-line collection should trigger scheduled strategy scans, and
AstrBot or `mist-skills` should consume persisted Mist alert events through
controlled backend APIs.

## What Changes

- Add a scheduler-owned strategy scan job that runs after completed K-line
  collection windows and calls shared Mist strategy scan services.
- Refactor strategy providers as needed so `apps/schedule` can consume scan
  services without owning public strategy APIs or duplicating rule evaluation.
- Add backend alert delivery state transitions needed by external consumers:
  pending fetch, delivered mark, failed mark, and acknowledgement boundaries.
- Add `mist-skills` strategy alert helpers for pulling pending alert events and
  marking delivery outcomes through Mist backend APIs.
- Add tests proving scheduled scans reuse shared evaluator semantics and that
  skill-side alert consumption does not execute strategy rules.
- Do not add direct datasource polling, raw provider calls, or portfolio-level
  backtesting behavior.

## Capabilities

### New Capabilities

- `strategy-scheduler-alert-delivery`: Production hardening for scheduled
  strategy scans and controlled alert event consumption/delivery.

### Modified Capabilities

None. Existing strategy definition, signal alert, backtesting, and operator UX
requirements remain accepted and unchanged.

## Impact

- Affects `apps/schedule` for periodic strategy scan jobs.
- Affects `apps/mist/src/strategy` only where providers or alert delivery APIs
  must be exposed for schedule and external consumers.
- Affects `../mist-skills` shared client, skill docs, and tests for strategy
  alert event consumption.
- Updates roadmap disposition for scheduler/alert delivery hardening.
- Does not change datasource services, QMT/TDX provider boundaries, frontend
  strategy UX, or portfolio-level backtesting semantics.
