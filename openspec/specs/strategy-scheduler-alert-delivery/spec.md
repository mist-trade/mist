## Purpose

Strategy scheduler alert delivery hardens the production strategy loop by
running scheduled scans after completed K-line collection and letting external
consumers record alert delivery outcomes through Mist backend APIs.

## Requirements

### Requirement: Schedule Shall Trigger Strategy Scans After K-Line Collection

Mist schedule app SHALL run strategy scans after completed K-line collection
windows.

#### Scenario: Scheduled collection succeeds

- **WHEN** a schedule collection job successfully collects K-line data for a
  period
- **THEN** the schedule app MUST trigger a strategy scan for that same period
- **AND** the scan MUST use Mist's shared `StrategyScanService`

#### Scenario: Scheduled collection fails

- **WHEN** a schedule collection job fails before completing collection
- **THEN** the schedule app MUST NOT trigger the strategy scan for that failed
  collection attempt
- **AND** it MUST log the collection failure

### Requirement: Schedule Shall Not Own Public Strategy APIs

The schedule app SHALL host strategy scan jobs only and SHALL NOT expose public
strategy REST APIs.

#### Scenario: Schedule module is inspected

- **WHEN** schedule module wiring is inspected
- **THEN** it MUST import reusable strategy providers without mounting
  `/v1/strategies`, `/v1/strategy-signals`,
  `/v1/strategy-alert-events`, or `/v1/strategy-backtests` controllers

### Requirement: Scheduled Scans Shall Reuse Live Scan Semantics

Scheduled strategy scans SHALL use the same rule evaluator, context builder,
dedupe key, signal persistence, and alert event persistence as manual scans.

#### Scenario: Scheduled scan matches a strategy

- **WHEN** a scheduled scan finds a matching strategy context
- **THEN** it MUST persist a `StrategySignal`
- **AND** it MUST persist a linked pending `StrategyAlertEvent`
- **AND** it MUST suppress duplicates with the same dedupe semantics as manual
  scans

### Requirement: Alert Delivery State Shall Be Recorded

Mist backend SHALL allow external consumers to record alert delivery outcomes
on persisted strategy alert events.

#### Scenario: Alert is delivered

- **WHEN** a consumer marks a strategy alert event delivered
- **THEN** the backend MUST set the event status to delivered
- **AND** it MUST store delivery result metadata when supplied

#### Scenario: Alert delivery fails

- **WHEN** a consumer marks a strategy alert event failed
- **THEN** the backend MUST set the event status to failed
- **AND** it MUST store failure metadata when supplied

### Requirement: Skills Shall Consume Backend Alert Events

`mist-skills` SHALL consume strategy alerts through Mist backend APIs rather
than executing strategy rules.

#### Scenario: Pending strategy alerts are requested

- **WHEN** a strategy alert skill or helper requests pending alerts
- **THEN** it MUST call Mist backend alert event APIs
- **AND** it MUST NOT call datasource services, raw provider APIs, or local
  strategy rule evaluators

#### Scenario: Skill records delivery result

- **WHEN** a skill or bot delivery attempt succeeds or fails
- **THEN** it MUST mark the delivery result through the Mist backend alert
  delivery API

### Requirement: Operator Acknowledgement Shall Remain Separate

Delivery status and operator acknowledgement SHALL remain separate alert event
state transitions.

#### Scenario: Delivered alert is acknowledged

- **WHEN** an operator acknowledges a delivered alert event
- **THEN** the backend MUST mark it acknowledged with an acknowledgement
  timestamp
- **AND** the acknowledgement MUST NOT require the skill or bot to re-deliver
  the alert
