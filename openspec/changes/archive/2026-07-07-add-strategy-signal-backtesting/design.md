## Context

The strategy registry already persists `BacktestRun` and
`BacktestSignalResult` records, and the strategy alert change added a pure rule
evaluator plus K-line evaluation context builder. This change turns the
reserved backtest endpoint into a synchronous signal-level historical replay.

The first replay scope is intentionally narrow: it evaluates K-line/security
context only, writes signal result rows, and updates aggregate counters. It
does not simulate trading execution or portfolio performance.

## Goals / Non-Goals

**Goals:**

- Execute signal-level replay for one strategy version and requested universe.
- Reuse the same evaluator and context builder used by live scans.
- Persist one `BacktestSignalResult` for each historical match.
- Update run status and aggregate counts deterministically.
- Preserve existing `/v1/strategy-backtests` API paths.

**Non-Goals:**

- Portfolio-level simulation.
- Order, fill, fee, slippage, cash, position, return, or equity curve outputs.
- Asynchronous job queues or workers.
- Indicator/Chan enriched contexts beyond the current K-line/security context.

## Decisions

### Decision 1: Execute synchronously in `createRun`

The first implementation creates a run and immediately replays historical bars
before returning. This keeps the API simple, deterministic, and easy to test.

Alternative considered: enqueue a background run. That will matter for large
universes, but it adds worker status semantics before the signal-level model is
proven.

### Decision 2: Reuse scan evaluator and context builder

Backtesting uses `StrategyRuleEvaluator` and
`StrategyEvaluationContextBuilder`, matching live scan semantics.

Alternative considered: implement a separate backtest evaluator. That would
risk drift between historical and live results.

### Decision 3: Persist result rows before aggregate completion

For each match, the service writes `BacktestSignalResult` with strategy,
version, security, period, source, signal time, context snapshot, and rule
snapshot. After replay, it updates `signalCount`,
`matchedSecurityCount`, `completedAt`, and `status`.

Alternative considered: compute aggregates only without rows. That would make
backtest result inspection less useful and diverge from the existing
`/v1/strategy-backtests/:runId/signals` route.

## Risks / Trade-offs

- Large date ranges may take too long -> This first version is synchronous and
  meant for controlled signal-level replay; async execution can be a later
  extension.
- Indicator/Chan rules will not match without context enrichment -> The
  evaluator remains shared, and later context builders can add those data
  families.
- Errors mid-run could leave partial results -> The service marks the run
  failed with an error message; transaction wrapping can be added later if
  needed.

## Migration Plan

1. Add failing backtest service tests for replay results and no portfolio
   fields.
2. Extend backtest service dependencies to include K repository, context
   builder, and evaluator.
3. Implement historical K-line replay and aggregate updates.
4. Update docs and roadmap disposition.
5. Run focused tests, typecheck, lint, and OpenSpec validation.
