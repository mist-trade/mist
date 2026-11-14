# realtime-strategy-evaluation Specification Delta

## ADDED Requirements

### Requirement: Signal Runtime Shall Support Pre-Market Multi-Period Kernel Warmup

The Signal runtime (`apps/signal`) SHALL proactively warm up pre-market strategy kernel pool
groups for active strategy targets before continuous trading begins, eliminating cold-start
historical-window loading I/O and pre-warm phase push overhead when the first real-time candle of
the day arrives. Warmup SHALL pre-build `RealtimeKernelPool` group kernels — one per
`(securityId, source)` with one window per declared period — using the same canonical-history +
current-day-sealed hydration and `StrategyEvaluationKernel` push pipeline as the lazy path, with
no separate evaluation code path.

#### Scenario: Pre-market kernel pool warmup triggers at 09:20 on exchange trading days
- **WHEN** the `09:20` pre-market warmup schedule (`CRON_PRE_MARKET_STRATEGY_WARMUP_0920`) fires
  on an A-share trading day
- **THEN** `apps/signal` MUST identify all active `(securityId, source)` target groups across the
  current strategy registry
- **AND** for every group it MUST load each declared period's required historical windows up to
  the group's compiled demand using the 09:20 anchor, assembled from the canonical splice policy
- **AND** it MUST pre-build group kernels whose `publicFrom` is the warmup anchor, pushing the
  historical segments through the pre-warm phase silently in causal merge order

#### Scenario: Pre-market warmup is skipped on non-trading days and is idempotent
- **WHEN** the warmup schedule fires on a non-trading day
- **THEN** the warmup MUST be skipped without loading any historical window
- **AND** when a target group already exists with a matching plan signature and sufficient
  capacity, it MUST be skipped idempotently and reported as skipped

#### Scenario: Warmup triggers on startup and registry reconciliation
- **WHEN** `SignalRealtimeStartupService` bootstraps or reconciles its strategy registry
- **THEN** it MUST trigger proactive warmup for newly registered or expanded targets through the
  same warmup entry point
- **AND** a mid-day warmup MUST keep current-day history in the pre-warm phase so that no
  historical signal of the elapsed part of the day is emitted
- **AND** the warmup MUST NOT block registry reconciliation or service startup

#### Scenario: Vectorized data integrity inspection via Polars detects anomalies before market open
- **WHEN** historical K-line bars are loaded during pre-market warmup
- **THEN** the pool MUST execute vectorized validation using Polars per declared period to verify
  that:
  - timestamps are strictly monotonically increasing;
  - prices are non-negative (`open, high, low, close >= 0`);
  - high prices are greater than or equal to low prices (`high >= low`);
  - no null or NaN values exist in the OHLC series;
- **AND** if validation fails, the target MUST be marked as failed with a structured bounded
  failure reason (`insufficient_bars`, `timestamp_reversed`, `invalid_price`,
  `price_boundary_violation`, `contains_null_or_nan`, or `query_failed`) and isolated without
  blocking remaining targets

#### Scenario: First real-time candle arrives with zero historical database I/O
- **WHEN** the first `candle_finalized` trigger of a trading day arrives for a pre-warmed target
- **THEN** `RealtimeKernelPool` MUST reuse the pre-built group kernel without executing
  historical K-line database queries
- **AND** the first public bar MUST be evaluated through the canonical push pipeline with signal
  emission semantics identical to the lazy-hydration path
- **AND** the trading-day rollover at the first trigger MUST NOT discard groups warmed for that
  same trading day

#### Scenario: Single security warmup failure is isolated
- **WHEN** historical K-line loading or Polars validation fails for a specific target during
  pre-market warmup
- **THEN** `apps/signal` MUST record a bounded warning log with structured target details and
  failure reason
- **AND** the failure MUST NOT interrupt warmup for other targets
- **AND** the failure MUST NOT cause the Signal service to crash or become unready
- **AND** subsequent real-time triggers for that target MUST fall back to on-demand hydration

#### Scenario: Pre-market warmup state is observable
- **WHEN** the Signal health endpoint is queried after a pre-market warmup attempt
- **THEN** it MUST expose the warmup state (`off` / `ready` / `partial` / `error`), the last
  warmed-at timestamp, the anchor trading day, success/skip/failure counts, and a bounded last
  failure code
