## ADDED Requirements

### Requirement: Backend consumes QMT only through normalized datasource APIs
The Mist backend SHALL consume QMT data only through the configured Python
datasource normalized `/v1` APIs and datasource WebSocket envelope.

#### Scenario: Backend product code requests QMT market data
- **WHEN** backend collection, analysis, or datasource-selection code needs QMT
  market data
- **THEN** it MUST use normalized datasource endpoints with `provider: "qmt"`
  or the canonical datasource WebSocket protocol
- **AND** it MUST NOT call full-QMT built-in functions, command-gateway
  internals, QMT bridge polling endpoints, MiniQMT, `xtquant`, or raw QMT
  payloads directly

#### Scenario: Backend code attempts account or trading access
- **WHEN** backend product code attempts to access QMT account, position,
  order, deal, cancel, or placement operations through the market datasource
- **THEN** repository checks MUST fail or the datasource MUST return a stable
  outside-boundary error

### Requirement: Backend handles spike-blocked QMT provider status
The Mist backend SHALL treat spike-blocked QMT capabilities as unavailable
provider capability responses rather than runtime crashes.

#### Scenario: QMT provider is spike-blocked
- **WHEN** backend code queries a QMT capability before Windows spike evidence
  enables live QMT
- **THEN** backend handling MUST surface a datasource capability failure and
  MUST NOT fall back to MiniQMT, XtQuant, raw command endpoints, or fixture data
