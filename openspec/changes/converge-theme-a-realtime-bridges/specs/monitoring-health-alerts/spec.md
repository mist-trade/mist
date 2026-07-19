## ADDED Requirements

### Requirement: Experimental realtime monitoring is mode aware
Monitoring SHALL probe and classify experimental realtime readiness only for sources explicitly configured in `builtin_experimental` mode and SHALL preserve existing legacy datasource health metrics.

#### Scenario: Source experimental mode is disabled
- **WHEN** TDX or QMT is configured as legacy or off
- **THEN** monitoring emits no experimental-unavailable alert for that source

#### Scenario: Enabled source has no fresh owner or snapshot
- **WHEN** an enabled experimental source reports an unready owner, divergent subscription state, or stale snapshot
- **THEN** monitoring emits a source-labelled experimental realtime alert with stable health evidence

### Requirement: Loopback experimental health is proxied by Windows metrics
The Windows exporter SHALL read source-specific loopback experimental health and the Mac watchdog SHALL consume the resulting metrics rather than calling those routes remotely.

#### Scenario: Mac watchdog evaluates experimental health
- **WHEN** the watchdog runs on the Mac host
- **THEN** it derives experimental readiness from Windows exporter metrics and makes no direct experimental datasource request

#### Scenario: Operator switches an experimental source mode
- **WHEN** the Windows mode workflow enables or rolls back TDX or QMT experimental realtime
- **THEN** the exporter configuration is regenerated for the same effective modes and restarted before the switch is reported healthy
