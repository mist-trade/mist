## ADDED Requirements

### Requirement: QMT builtin experimental snapshot transport
The QMT datasource SHALL provide a mode-gated experimental WebSocket transport backed by the existing single-owner full-QMT command gateway and native `get_full_tick`, without changing historical bar responses or exposing the command bridge as a product API.

#### Scenario: Allowlisted subscriptions are active during a trading session
- **WHEN** an experimental WebSocket leader synchronizes valid QMT symbols and a fresh bridge owner is registered
- **THEN** the datasource polls one native snapshot command at a time and emits strictly validated, fenced snapshot frames

#### Scenario: Market is outside the supported session
- **WHEN** subscribed symbols exist outside their Beijing trading session
- **THEN** no native realtime command is enqueued and health reports the outside-session state

#### Scenario: Historical QMT bars are queried
- **WHEN** a client calls the existing QMT historical endpoint while experimental realtime is enabled or disabled
- **THEN** the historical request and native response contract are unchanged

### Requirement: QMT experimental health is loopback-only
The datasource SHALL expose detailed QMT experimental owner, epoch, subscription, freshness, and error state only through a loopback-protected health route.

#### Scenario: Remote caller requests experimental health
- **WHEN** a non-loopback caller requests `/qmt/realtime/health`
- **THEN** the datasource rejects the request without disclosing experimental state
