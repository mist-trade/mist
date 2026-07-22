# monitoring-health-alerts Specification

## Purpose
Define stable datasource, bridge, probe, metric, and alert-delivery
observability across the Windows exporter and Mac watchdog.
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

#### Scenario: Windows metrics report TDX bridge unavailable
- **WHEN** the Windows exporter reports that the TDX builtin bridge has no fresh
  owner or has divergent desired and applied revisions
- **THEN** watchdog classification MUST activate the corresponding
  `tdx_bridge_unavailable` or `tdx_bridge_subscription_drift` condition
- **AND** it MUST NOT infer bridge readiness from removed `tqInitialized` or
  event-queue fields

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
  `mist-monitoring/docs/metrics.md`
- **AND** names used in collectors MUST match the contract entries

### Requirement: Realtime monitoring follows source lifecycle
Monitoring SHALL always probe and classify TDX builtin bridge readiness and SHALL probe QMT realtime only when QMT is configured in `builtin_experimental` mode.

#### Scenario: QMT realtime mode is disabled
- **WHEN** QMT is configured as off
- **THEN** monitoring emits no QMT realtime-unavailable alert while continuing to report TDX bridge health

#### Scenario: Enabled source has no fresh owner or snapshot
- **WHEN** an enabled experimental source reports an unready owner, divergent subscription state, or stale snapshot
- **THEN** monitoring emits a source-labelled experimental realtime alert with stable health evidence

### Requirement: Loopback experimental health is proxied by Windows metrics
The Windows exporter SHALL read source-specific loopback experimental health and the Mac watchdog SHALL consume the resulting metrics rather than calling those routes remotely.

#### Scenario: Mac watchdog evaluates experimental health
- **WHEN** the watchdog runs on the Mac host
- **THEN** it derives experimental readiness from Windows exporter metrics and makes no direct experimental datasource request

#### Scenario: Operator changes QMT mode or a source allowlist
- **WHEN** the Windows workflow applies or rolls back the configuration
- **THEN** the exporter configuration is regenerated with always-on TDX health and the effective QMT mode before the switch is reported healthy
