# Tasks: Repair monitoring health alerts

## 1. Select Scope And Baseline

- [x] 1.1 Record selected review IDs: CODE_REVIEW C10, M10, M11, L13,
      L15; CODE_SMELL D5.1-D5.6, P5.4, N5.2, C5.2.
- [x] 1.2 Inspect current `mist-monitoring` Mac watchdog, Windows exporter,
      shared probe, notifier, metrics renderer, contracts, and tests.
- [x] 1.3 Identify targeted Go/Python tests or substitute checks for each
      selected review item before implementation.

## 2. Add Failing Tests First

- [x] 2.1 Add Mac watchdog tests proving datasource health JSON populates
      TDX HTTP, tqcenter, websocket, and queue-depth metrics.
- [x] 2.2 Add Mac watchdog classification tests proving parsed datasource
      health activates `tdx_http_unreachable` and `tdx_not_initialized`.
- [x] 2.3 Add shared HTTP probe tests proving context cancellation is honored
      and injected clients are used.
- [x] 2.4 Add webhook notifier tests proving the default client has a finite
      timeout and requests carry caller context.
- [x] 2.5 Add Mac watchdog tests proving endpoint probe errors are exported
      with stable labels.
- [x] 2.6 Add Mac watchdog tests proving notifier failures are exported with
      stable labels and do not suppress alert-state metrics.
- [x] 2.7 Add Windows exporter tests proving service/process/TCP/Docker/
      datasource probe errors are exported with stable labels while legacy
      state metrics remain.
- [x] 2.8 Add metrics renderer tests proving `# HELP` and `# TYPE` comments are
      emitted once per metric family.
- [x] 2.9 Add contract/source tests proving collector metric names are present
      in `contracts/metrics.md`.
- [x] 2.10 Add tests or source assertions covering misleading business-smoke
      health aliases.
- [x] 2.11 Run the targeted tests and confirm each new assertion fails for the
      intended reason before implementation.

## 3. Implement Datasource Health Parsing

- [x] 3.1 Share or align datasource health structs across Mac and Windows
      monitoring without changing emitted metric names.
- [x] 3.2 Parse Mac datasource health response bodies for camelCase and
      supported legacy snake_case payload keys.
- [x] 3.3 Clamp negative datasource event queue depth to zero.
- [x] 3.4 Populate Mac `Observation.DatasourceHealth` from parsed health
      details before classification.
- [x] 3.5 Emit Mac datasource health metrics from parsed health details.

## 4. Implement Probe And Notifier Runtime Safety

- [x] 4.1 Refactor shared HTTP probing to use `http.NewRequestWithContext`.
- [x] 4.2 Allow shared HTTP probes to reuse an injected `*http.Client` while
      keeping the existing timeout default.
- [x] 4.3 Add a finite timeout default to `WebhookNotifier` when no client is
      injected.
- [x] 4.4 Preserve endpoint probe error classes in Mac watchdog metrics.
- [x] 4.5 Preserve notifier send errors in Mac watchdog metrics.
- [x] 4.6 Preserve Windows probe errors in exporter metrics for service,
      process, TCP, Docker, and datasource probes.
- [x] 4.7 Keep existing `*_up`, `*_running`, and `mist_probe_success` behavior
      compatible for current dashboards.

## 5. Implement Metrics And Naming Cleanup

- [x] 5.1 Add a metric metadata catalog for known Mist metric names.
- [x] 5.2 Update `RenderSamples` to emit deterministic `# HELP` and `# TYPE`
      lines once per metric family.
- [x] 5.3 Update renderer and metrics contract tests for metadata output.
- [x] 5.4 Update `contracts/metrics.md` for Mac/Windows probe error metrics and
      any shared metric-name alignment.
- [x] 5.5 Rename or document current health-endpoint alias checks so they are
      not misrepresented as product-level business smoke.
- [x] 5.6 Remove or retire confirmed dead monitoring entry points if tests prove
      they have no callers.

## 6. Verify And Record Evidence

- [x] 6.1 Run targeted Go tests added for this change.
- [x] 6.2 Run `go test ./...` in `mist-monitoring`.
- [x] 6.3 Run Python tests for `mist-monitoring` if touched by the change.
- [x] 6.4 Run `scripts/verify.sh` or a documented substitute if the local
      environment cannot run it.
- [x] 6.5 Run `openspec validate repair-monitoring-health-alerts --strict`.
- [x] 6.6 Record `review-id -> changed files -> test/verification command` in
      `evidence.md`.
- [x] 6.7 Update the parent `stabilize-review-remediation` tasks after this
      child change is created and verified.
