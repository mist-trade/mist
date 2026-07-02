# monitoring-health-alerts Specification

## Purpose
TBD - created by archiving change repair-monitoring-health-alerts. Update Purpose after archive.
## Requirements
### Requirement: Mac watchdog parses datasource health bodies
The Mac watchdog SHALL parse successful datasource `/health` response bodies
into datasource health state and metrics.

#### Scenario: Datasource health reports TDX native HTTP unreachable
- **WHEN** the Mac watchdog probes a datasource health endpoint returning a
  successful HTTP status with `tdxHttpReachable=false`
- **THEN** the collected observation MUST include datasource health details
- **AND** watchdog classification MUST activate `tdx_http_unreachable`
- **AND** collected metrics MUST include `mist_datasource_tdx_http_reachable 0`

#### Scenario: Datasource health reports tqcenter not initialized
- **WHEN** the Mac watchdog probes a datasource health endpoint returning a
  successful HTTP status with `tqInitialized=false`
- **THEN** watchdog classification MUST activate `tdx_not_initialized`
- **AND** collected metrics MUST include `mist_datasource_tq_initialized 0`

#### Scenario: Datasource health has a negative queue depth
- **WHEN** datasource health parsing receives `eventQueueDepth` below zero
- **THEN** the exported queue depth metric MUST be clamped to `0`

### Requirement: Probe and notifier failures are observable
Monitoring collectors SHALL expose probe and alert-delivery failures without
silently collapsing them into generic component-down states.

#### Scenario: Windows local probe returns an error
- **WHEN** a Windows service, process, TCP, Docker, or datasource probe returns
  an error
- **THEN** the Windows exporter MUST emit an error metric with a stable probe
  target label
- **AND** it MUST keep the existing running/up metric compatible with current
  dashboards

#### Scenario: Mac HTTP endpoint probe returns an error
- **WHEN** a Mac watchdog endpoint probe returns an error class
- **THEN** the Mac watchdog MUST emit a probe error metric with stable target
  and error class labels
- **AND** it MUST keep the existing `mist_probe_success` metric

#### Scenario: Alert notification fails
- **WHEN** a notifier returns an error while sending an active or resolved alert
- **THEN** the Mac watchdog MUST expose the notifier failure through a metric or
  other testable sample
- **AND** it MUST continue rendering alert state metrics

### Requirement: HTTP probes and webhooks are bounded and cancellable
Monitoring HTTP calls SHALL honor caller context and finite timeout defaults.

#### Scenario: Shared HTTP probe context is cancelled
- **WHEN** the caller cancels the probe context before the HTTP response
- **THEN** the shared HTTP probe MUST return promptly with a timeout or network
  error class

#### Scenario: Shared HTTP probe has an injected client
- **WHEN** a caller constructs a shared HTTP probe with an injected HTTP client
- **THEN** the probe MUST use that client rather than constructing a new client
  per request

#### Scenario: Webhook notifier has no injected client
- **WHEN** webhook notification is configured without an injected client
- **THEN** the notifier MUST use a finite default timeout
- **AND** it MUST still attach caller context to the request

### Requirement: Metrics render Prometheus metadata
Monitoring metric rendering SHALL include deterministic Prometheus metadata
comments for every rendered metric family.

#### Scenario: Samples are rendered
- **WHEN** `RenderSamples` renders one or more samples
- **THEN** each metric family MUST be preceded by one `# HELP` line
- **AND** each metric family MUST be preceded by one `# TYPE` line
- **AND** sample lines MUST remain deterministic and label-escaped

#### Scenario: Invalid metric names are rendered
- **WHEN** a sample contains an invalid metric name
- **THEN** rendering MUST return an error before emitting partial output

### Requirement: Monitoring names match contract intent
Monitoring SHALL avoid misleading metric or check names for selected watchdog
health checks.

#### Scenario: Health aliases remain as smoke checks
- **WHEN** the existing `snapshot` or `kline` check only probes a health
  endpoint alias
- **THEN** the code MUST rename or document the check as endpoint validation
  rather than a product-level business smoke

#### Scenario: Metric contract is inspected
- **WHEN** tests inspect monitoring metric names
- **THEN** shared Mac and Windows probe metrics MUST be listed in
  `contracts/metrics.md`
- **AND** names used in collectors MUST match the contract entries

