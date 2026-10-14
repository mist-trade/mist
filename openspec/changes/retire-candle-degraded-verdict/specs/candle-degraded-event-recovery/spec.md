## REMOVED Requirements

### Requirement: Candle Degraded SHALL Reflect Current Production Health, Not Lifetime History

**Reason**: The windowed degraded verdict was removed with the OpenTelemetry migration
(2026-08-09, `introduce-openobserve-otel-foundation`): candle production health is now
observed from raw counters exported as OTel gauges (`mist_candle_*`) and judged on the
OpenObserve side; no in-process verdict exists. Retired by user decision 2026-10-15
(rebuild-versus-retire: retire chosen).

**Migration**: Cumulative failure counters remain exported for monitoring. Any future
"production degraded" judgment belongs to OpenObserve alert rules over those counters,
not to the candle pipeline process.

### Requirement: Last-Failure Timestamps SHALL Be Observed Without High-Cardinality Labels

**Reason**: The `lastFailureAtMs` timestamps existed solely as inputs of the removed
windowed verdict; after the verdict retirement they are write-only bookkeeping with zero
readers.

**Migration**: Raw failure totals remain exported to OpenObserve; failure age is
computable from the exported time series if ever needed.

### Requirement: The Recovery Window SHALL Be Configured and Bounded

**Reason**: `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS` was consumed only by the removed
windowed verdict. Post-migration it was declared in the config schema but never read, and
no deployment ever set it.

**Migration**: The declaration and its bounds constant retire together with the verdict;
no deployment input changes are required.

### Requirement: The HIL SHALL Verify Recovery After a Transient Failure

**Reason**: The HIL asserted recovery from the degraded verdict, which no longer exists.
The candle shadow HIL verifies candle health via OpenObserve gauges, and its verdict-based
assertions (`Assert-CandleHealth`) have no call sites in the main script.

**Migration**: The HIL keeps its sealed/discard and Redis key preservation checks;
verdict-based assertions retire with the verdict.

### Requirement: Candle Health SHALL Be Exposed As a Tiered Monitoring Signal

**Reason**: The `mist_component_up` / `mist_realtime_candle_health` contract belonged to
the retired mist-monitoring exporter (`render.go` / `docs/metrics.md`), superseded by the
OTel + OpenObserve stack; the metric was never emitted post-migration.

**Migration**: Liveness-versus-production-health separation is expressed in the
OpenObserve datasource and alert rules owned by deployment, not by a standalone candle
health metric.
