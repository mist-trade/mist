## ADDED Requirements

### Requirement: Alert Fanout Batch Delivery Preparation
`AlertFanoutService.run()` SHALL load existing `strategy_alert_deliveries` rows for all group alert event IDs in a single `In(...)` query and batch-create missing pending channel delivery rows while preserving duplicate-constraint race resilience.

#### Scenario: Multi-event group fanout executes single batch query per run
- **WHEN** `AlertFanoutService.run` processes multiple `alertEventIds` across multiple configured channels
- **THEN** it MUST fetch existing delivery rows via `In(alertEventIds)` rather than querying `findOne` per event-channel pair
