## ADDED Requirements

### Requirement: Signal Runtime Shall Support Pre-Market Strategy Window Hydration

The Signal runtime (`apps/signal`) SHALL support proactive pre-market strategy window hydration for active strategy targets before continuous trading begins, eliminating cold-start database I/O latency and full-history indicator recalculation overhead when the first real-time candle of the day arrives.

#### Scenario: Pre-market strategy hydration triggers at 09:20 on exchange trading days
- **WHEN** the `09:20` pre-market warmup schedule (`CRON_PRE_MARKET_STRATEGY_WARMUP_0920`) fires on an A-share trading day
- **THEN** `apps/signal` MUST identify all active `(securityId, source, period)` target groups across the current strategy registry
- **AND** it MUST load the required historical K-line windows up to each target's maximum `requiredBarCount` using yesterday's close as the anchor
- **AND** it MUST validate bar series integrity and pre-warm in-memory structures in `SharedStrategyWindowStore`

#### Scenario: Strategy hydration triggers on startup and registry reconciliation
- **WHEN** `SignalRealtimeStartupService` bootstraps or reconciles its strategy registry
- **THEN** it MUST trigger proactive window hydration for newly registered or expanded targets
- **AND** target groups already hydrated with sufficient capacity MUST be skipped idempotently

#### Scenario: Vectorized data integrity inspection via Polars detects anomalies before market open
- **WHEN** historical K-line bars are loaded during pre-market hydration
- **THEN** the store MUST execute vectorized validation using Polars to verify that:
  - timestamps are strictly monotonically increasing (`timestamp.diff() > 0`);
  - prices are non-negative (`open, high, low, close >= 0`);
  - high prices are greater than or equal to low prices (`high >= low`);
  - no null or NaN values exist in the bar series;
- **AND** if validation fails, the target MUST be marked as failed with a structured failure reason (`timestamp_reversed`, `invalid_price`, `price_boundary_violation`, or `contains_null_or_nan`) and isolated without blocking remaining targets

#### Scenario: Static indicators are proactively pre-computed and cached during pre-market hydration
- **WHEN** historical bars pass data integrity inspection during pre-market hydration
- **THEN** the system MUST pre-compute static indicator observations for the historical window using vectorized Polars indicators
- **AND** it MUST attach the pre-warmed analysis cache to the window group

#### Scenario: First real-time candle arrives with zero database I/O and zero full-history indicator recalculation
- **WHEN** the first `candle_finalized` trigger of a trading day arrives for a pre-hydrated target
- **THEN** `SharedStrategyWindowStore.prepare` MUST find the in-memory window already initialized
- **AND** it MUST append the new bar directly in memory without executing historical K-line database queries
- **AND** strategy evaluation MUST reuse pre-warmed indicator observations without recomputing the full historical series

#### Scenario: Single security hydration failure is isolated
- **WHEN** historical K-line loading or Polars validation fails for a specific target during pre-market hydration
- **THEN** `apps/signal` MUST record a bounded warning log with structured target details and failure reason
- **AND** the failure MUST NOT interrupt hydration for other targets
- **AND** the failure MUST NOT cause the Signal service to crash or become unready
- **AND** subsequent real-time triggers for that target MUST fall back to on-demand hydration
