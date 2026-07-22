## MODIFIED Requirements

### Requirement: Realtime monitoring follows source lifecycle
Monitoring SHALL probe and classify both TDX and QMT formal realtime readiness in the production `builtin` desired state, and SHALL represent an explicit source `off` mode as operator-controlled rollback rather than ordinary healthy readiness.

#### Scenario: Production realtime is builtin
- **WHEN** the verified production configuration is active
- **THEN** monitoring probes TDX and QMT owner, subscription, snapshot age and error state using source-labelled formal metrics

#### Scenario: Source is intentionally off
- **WHEN** an operator rolls QMT or another supported source to `off`
- **THEN** monitoring reports the intentional mode without emitting a misleading transport-down alert

#### Scenario: Enabled source has no fresh owner or snapshot
- **WHEN** an enabled source remains without a ready owner, converged subscription, or fresh snapshot beyond its startup/session grace
- **THEN** monitoring emits a source-labelled formal realtime alert with stable health evidence

### Requirement: Loopback realtime health is proxied by Windows metrics
The Windows exporter SHALL read source-specific loopback formal realtime health and the Mac watchdog SHALL consume `mist_realtime_*` metrics rather than calling those routes remotely.

#### Scenario: Mac watchdog evaluates realtime health
- **WHEN** the watchdog runs on the Mac host
- **THEN** it derives source readiness from Windows exporter metrics and makes no direct datasource loopback request

#### Scenario: Operator changes a source mode or allowlist
- **WHEN** the Windows workflow applies or rolls back configuration
- **THEN** exporter configuration is regenerated with the effective source mode before the switch is reported converged

## ADDED Requirements

### Requirement: Experimental realtime metrics are retired atomically
The formal monitoring release SHALL emit only documented `mist_realtime_*` metric and alert families and SHALL remove experimental config/type/metric names from active exporter and watchdog code.

#### Scenario: Monitoring contract tests run
- **WHEN** exporter and watchdog render realtime metrics
- **THEN** formal names match `mist-monitoring/docs/metrics.md` and old experimental names are absent
