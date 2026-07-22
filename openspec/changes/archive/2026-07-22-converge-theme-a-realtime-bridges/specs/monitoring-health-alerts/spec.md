## ADDED Requirements

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
