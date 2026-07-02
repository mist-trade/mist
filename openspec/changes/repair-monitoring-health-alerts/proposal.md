## Why

The monitoring stack can miss datasource health failures and hide probe or
notification failures, which weakens the alerting path operators rely on during
TDX incidents. This change closes the first-wave monitoring review items with
tests before implementation.

## What Changes

- Select review IDs CODE_REVIEW C10, M10, M11, L13, L15 and CODE_SMELL
  D5.1-D5.6, P5.4, N5.2, C5.2.
- Parse Mac datasource `/health` response bodies so TDX native HTTP and
  tqcenter initialization failures can trigger watchdog alerts.
- Ensure shared HTTP probes honor request context cancellation and reuse an
  injected HTTP client.
- Add bounded timeout behavior to webhook notification delivery.
- Preserve probe and notifier errors in metrics/loggable samples instead of
  silently collapsing them into generic component-down states.
- Render Prometheus metrics with `# HELP` and `# TYPE` annotations.
- Align monitoring metric names and datasource health types with documented
  contracts where required by the selected review items.
- Rename or reshape misleading "business smoke" checks if they remain health
  endpoint aliases rather than real product smoke tests.
- Add Go/Python tests or script checks for every selected item.

## Capabilities

### New Capabilities

- `monitoring-health-alerts`: monitoring collectors, probes, notifiers, and
  metric renderers expose actionable datasource health and alert-delivery state.

### Modified Capabilities

- None.

## Impact

- Affected repository:
  - `mist-monitoring`
- Affected code areas:
  - `mac/mist-watchdog/internal/watchdog/*`
  - `windows/mist-windows-exporter/internal/exporter/*`
  - `shared/probe/*`
  - `shared/metrics/*`
  - `contracts/metrics.md`
  - `astrbot/shared/watchdog_client.py` only if Python client tests expose
    contract fallout
- No backend, frontend, datasource, or deployment topology changes.
