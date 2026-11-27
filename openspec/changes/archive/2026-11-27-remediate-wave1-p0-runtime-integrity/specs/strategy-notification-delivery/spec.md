## ADDED Requirements

### Requirement: Pending Alert Sweep Shall Discover Stranded Events Without Head-Of-Line Starvation
`PendingAlertDeliverySweepService` SHALL query stranded `PENDING` `StrategyAlertEvent` rows (older than `PENDING_SWEEP_STALENESS_MS` with zero `strategy_alert_deliveries` rows) directly at the SQL query boundary (`LEFT JOIN ... WHERE d.id IS NULL ORDER BY e.id ASC LIMIT :cap`) so older `PENDING` events that already possess retry-in-progress delivery rows cannot starve genuinely stranded newer events. Re-enqueueing recovered groups from the sweep SHALL use a sweep-scoped deterministic job identifier (`alertDeliverySweepFanoutJobId`) that avoids collision with previously completed primary fanout jobs while deduplicating identical unrecovered batches across consecutive sweep intervals.

#### Scenario: Stranded event beyond 100 in-flight retries is discovered and re-enqueued
- **WHEN** more than 100 `PENDING` alert events exist with active delivery rows and one additional stale `PENDING` alert event has zero delivery rows
- **THEN** `PendingAlertDeliverySweepService` MUST return and re-enqueue the zero-delivery stranded event within a single sweep pass
- **AND** the sweep fanout enqueue MUST NOT be silently dropped by an already-completed primary `deliver-fanout-v2` job identifier
