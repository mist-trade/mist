## ADDED Requirements

### Requirement: Strategy Alert Event Status-Created Index Metadata Alignment
`StrategyAlertEvent` SHALL declare composite index `idx_strategy_alert_events_status_created` on `(status, created_at)`, mirrored by forward-only migration `039_add_strategy_alert_event_status_created_index.sql`, supporting bounded stranded-alert discovery scans.

#### Scenario: Entity index matches migration 039
- **WHEN** `deploy/database/migrations/039_add_strategy_alert_event_status_created_index.sql` and `StrategyAlertEvent` entity metadata are inspected
- **THEN** both MUST declare `idx_strategy_alert_events_status_created` over `(status, created_at)`
