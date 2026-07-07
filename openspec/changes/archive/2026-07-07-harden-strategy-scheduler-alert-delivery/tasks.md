# Tasks: Harden strategy scheduler alert delivery

## 1. Backend Contract Tests

- [x] 1.1 Add alert event service tests for delivered and failed state
      transitions with delivery result metadata.
- [x] 1.2 Add controller route tests for
      `/v1/strategy-alert-events/:id/delivered` and
      `/v1/strategy-alert-events/:id/failed`.
- [x] 1.3 Add tests proving existing acknowledgement remains separate from
      delivered and failed states.

## 2. Strategy Core Refactor

- [x] 2.1 Add `StrategyCoreModule` containing reusable strategy providers and
      TypeORM feature repositories without public REST controllers.
- [x] 2.2 Update `StrategyModule` to import `StrategyCoreModule` and keep
      public controllers in `apps/mist`.
- [x] 2.3 Add module wiring tests proving schedule can import strategy core
      without mounting strategy REST controllers.

## 3. Scheduled Strategy Scans

- [x] 3.1 Add schedule tests proving successful K-line collection triggers
      `StrategyScanService.runScan({ period })`.
- [x] 3.2 Add schedule tests proving failed collection does not trigger a scan.
- [x] 3.3 Implement a schedule strategy scan job or controller helper that
      reuses existing K-line collection cron timing.
- [x] 3.4 Update `apps/schedule` TypeORM entity registration to include
      strategy entities required by the shared scan service.
- [x] 3.5 Log scan summaries with scanned strategy count, evaluated contexts,
      created signals, created alert events, and skipped duplicates.

## 4. Alert Delivery APIs

- [x] 4.1 Implement delivered and failed transition methods in
      `StrategyAlertEventService`.
- [x] 4.2 Add delivery result DTO validation for delivered and failed calls.
- [x] 4.3 Add controller endpoints for delivered and failed transitions under
      `/v1/strategy-alert-events/:id`.
- [x] 4.4 Preserve existing pending query and acknowledgement behavior.

## 5. mist-skills Alert Consumption

- [x] 5.1 Add `MistClient` helpers or shared functions for fetching pending
      strategy alert events.
- [x] 5.2 Add `MistClient` helpers or shared functions for marking alert events
      delivered or failed.
- [x] 5.3 Add a `strategy-alerts` skill surface or documented helper flow for
      AstrBot consumption.
- [x] 5.4 Add tests proving strategy alert helpers call Mist backend APIs and
      do not call datasource or raw provider URLs.

## 6. Documentation And Roadmap

- [x] 6.1 Update Mist README/runbook docs with scheduled strategy scan and
      alert delivery API behavior.
- [x] 6.2 Update `../mist-skills/README.md` or runbook with the strategy alert
      consumption flow.
- [x] 6.3 Update `define-strategy-platform-roadmap` disposition for
      `harden-strategy-scheduler-alert-delivery`.

## 7. Verification

- [x] 7.1 Run focused Mist backend strategy alert delivery tests.
- [x] 7.2 Run focused schedule strategy scan tests.
- [x] 7.3 Run focused `mist-skills` strategy alert tests.
- [x] 7.4 Run Mist backend typecheck and focused lint.
- [x] 7.5 Run `mist-skills` test and lint commands.
- [x] 7.6 Run `openspec validate harden-strategy-scheduler-alert-delivery --strict`.
- [x] 7.7 Run `openspec validate define-strategy-platform-roadmap --strict`.
- [x] 7.8 Confirm no template markers or trailing whitespace remain in changed
      OpenSpec, Mist, schedule, and `mist-skills` files.
