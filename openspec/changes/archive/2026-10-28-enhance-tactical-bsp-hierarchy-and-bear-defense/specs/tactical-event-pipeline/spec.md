# tactical-event-pipeline Specification Delta

## ADDED Requirements

### Requirement: Zero-Delay Execution For Tactical Risk Cut
The `TacticalEventAggregator` SHALL support zero-delay risk cut rules (`windowBars: 0` and `requiredConfirmationTags: []`) for urgent risk mitigation and emergency defense signals. When an urgent sell or risk cut signal arrives, the aggregator SHALL emit a `TacticalEvent` of kind `RISK_CUT` immediately on the same bar without queuing or waiting in an observation window.

#### Scenario: Risk cut signal triggers immediate zero-delay tactical event
- **WHEN** an emergency defense rule (`action: 'SELL'`) is triggered
- **THEN** `TacticalEventAggregator` MUST emit a `TacticalEvent` with `action: 'SELL'` and `kind: 'RISK_CUT'` immediately on the current bar
- **AND** the event MUST NOT be delayed by any temporal observation window
- **AND** the event MUST NOT be suppressed by tactical cooldown (cooldown applies only to `ENTRY`)

#### Scenario: Risk cut signal invalidates all active entry observation windows
- **WHEN** an urgent risk cut signal (`action: 'SELL'`) is processed
- **THEN** all pending buy observation windows requiring a bull setup MUST be invalidated and pruned immediately
- **AND** subsequent late confirmation signals for those pruned windows MUST be ignored without residual state
