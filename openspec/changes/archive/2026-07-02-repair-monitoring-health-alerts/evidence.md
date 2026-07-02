# Evidence: repair-monitoring-health-alerts

## Red Tests

- `GOCACHE=/private/tmp/mist-monitoring-gocache go test ./mac/mist-watchdog/internal/watchdog ./windows/mist-windows-exporter/internal/exporter ./shared/probe ./shared/metrics` first failed on missing `HTTPGetWithClient`, missing `probe.Result.Body`, missing `BusinessSmokeCheckDescription`, and missing Prometheus metadata output.
- `python3 tests/test_metrics_contract.py` first failed because `mist_probe_error` and `mist_alert_notification_error` were not documented.
- `GOCACHE=/private/tmp/mist-monitoring-gocache go test ./mac/mist-watchdog/internal/watchdog -run TestMacRealProbesRequiresConfig` first failed while Mac `RealProbes()` still existed.
- `GOCACHE=/private/tmp/mist-monitoring-gocache go test ./mac/mist-watchdog/internal/watchdog -run TestRecoverTDXRejectsInvalidJSON` first failed with HTTP 200 for malformed JSON.

## Green Verification

- `GOCACHE=/private/tmp/mist-monitoring-gocache go test ./mac/mist-watchdog/internal/watchdog ./windows/mist-windows-exporter/internal/exporter ./shared/probe ./shared/metrics` -> passed.
- `python3 tests/test_metrics_contract.py` -> 4 tests passed.
- `GOCACHE=/private/tmp/mist-monitoring-gocache go test ./...` -> passed.
- `python3 -m unittest discover tests` -> 10 tests passed.
- `GOCACHE=/private/tmp/mist-monitoring-gocache sh scripts/verify.sh` -> passed Python tests, runtime metric validation, OpenSpec specs, and Go tests.
- `openspec validate repair-monitoring-health-alerts --strict` -> valid.
- `openspec validate stabilize-review-remediation --strict` -> valid.

## Review ID Mapping

| Review ID | Changed files | Tests / verification |
| --- | --- | --- |
| CODE_REVIEW C10 | `mac/mist-watchdog/internal/watchdog/collector.go`, `shared/datasource/health.go`, `contracts/metrics.md` | `health_parsing_test.go`, `classifier_test.go`, `go test ./mac/mist-watchdog/internal/watchdog` |
| CODE_REVIEW M10 | `shared/probe/http.go`, `mac/mist-watchdog/internal/watchdog/probes.go`, `mac/mist-watchdog/internal/watchdog/notifier.go` | `shared/probe/http_context_test.go`, `notifier_test.go` |
| CODE_REVIEW M11 | `windows/mist-windows-exporter/internal/exporter/collector.go` | `windows/.../error_visibility_test.go` |
| CODE_REVIEW L13 | `shared/metrics/render.go`, `shared/metrics/render_test.go` | `go test ./shared/metrics` |
| CODE_REVIEW L15 | `mac/mist-watchdog/internal/watchdog/business_smoke.go` | `business_smoke_test.go` |
| CODE_SMELL D5.1 | collector behavior reviewed; ordinary probe faults remain scrapeable samples instead of returning collector errors | `go test ./...`, server tests |
| CODE_SMELL D5.2 | `mac/mist-watchdog/internal/watchdog/collector.go`, `shared/datasource/health.go` | `health_parsing_test.go` |
| CODE_SMELL D5.3 | removed Mac `RealProbes()` dry-run shortcut | `TestMacRealProbesRequiresConfig`, `rg -n "RealProbes\\(" .` |
| CODE_SMELL D5.4 | `windows/mist-windows-exporter/internal/exporter/collector.go` | `windows/.../error_visibility_test.go` |
| CODE_SMELL D5.5 | `mac/mist-watchdog/internal/watchdog/actions.go` | `TestRecoverTDXRejectsInvalidJSON` |
| CODE_SMELL D5.6 | `mac/mist-watchdog/internal/watchdog/collector.go` | `TestCollectorEmitsNotifierErrorMetrics` |
| CODE_SMELL P5.4 | `shared/datasource/health.go`, type aliases in Mac and Windows packages | `health_parsing_test.go`, `datasource_test.go` |
| CODE_SMELL N5.2 | `contracts/metrics.md`, `tests/test_metrics_contract.py` | `python3 tests/test_metrics_contract.py` |
| CODE_SMELL C5.2 | `mac/mist-watchdog/internal/watchdog/business_smoke.go` | `TestBusinessSmokeChecksDocumentEndpointAliasBehavior` |
