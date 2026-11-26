# Change: Consolidate Same-Direction Signals and Remove Confidence Subsystem

## Why

The current `TradingEngine` resolves multiple signals within the same `(securityId, effectiveTime)` group via `sellFirstByConfidence` (`EXIT → ENTRY`, then descending `confidence`, then lexicographical `idempotencyKey`). Cross-repository audit proved that signal `confidence` / `confidenceLevel` is a broken, non-statistical legacy artifact:

1. **Non-comparable hardcoded constants**: Production presets use `GUARD` chains exclusively with **zero** `CONSENSUS` nodes; `GUARD.minConfidence` (0.5–0.6) has never filtered any `BUY`/`SELL` signal.
2. **Active production defects**:
   - `buildVirtualExitSignal` emits `0.9` (`0..1` scale) while `DecisionFlowEvaluator` emits `0..100`, causing 100× ordering distortion and `[HIGH 0.9%]` rendering in the Trading Manual;
   - `DecisionFlowEvaluator` locks `nextScore` onto the first passing `GUARD` via `currentScore ?? ...`, discarding downstream signal plugin scores;
   - Three frontend views fabricate `HIGH 85.0%` when `confidence` is `null`.
3. **False same-direction conflicts**: Under single-security full-position semantics (sell all on exit, buy `AllInWithBuffer(0.95)` on entry), same-timestamp resonance (e.g., multi-period close alignment at `15:01`, or virtual exit + decision-flow exit) should not pick an arbitrary winner and reject peers with misleading `NO_POSITION` / `ALREADY_HOLDING` errors.

Replacing confidence-based tie-breaking with **exit-first same-direction consolidation** and physically removing signal `confidence` closes archived `add-virtual-trading-layer` Task 10.2 permanently and simplifies the entire signal-to-trading pipeline.

## What Changes

- **Trading Engine Consolidation**: Retire `sellFirstByConfidence` (`GroupOrderingStrategy`). Process every `(securityId, effectiveTime)` group in two deterministic phases — **all valid `EXIT` signals consolidated into at most one full-exit instruction**, followed by **all valid `ENTRY` signals consolidated into at most one entry instruction** — preserving every contributing signal in `contributors` attribution and electing a deterministic primary anchor for `virtual_fill_events` (zero ledger DDL changes).
- **Execution & Idempotency Hardening**: Fix offline synthetic `idempotencyKey` collisions by including `period` and `signalType`; guard paired same-group `SELL + BUY` in `next_bar_open` so a limit-down `BLOCKED` sell suppresses its paired buy.
- **Physical Removal of Signal Confidence & Consensus**:
  - Remove `confidence` / `confidenceLevel` from `FactorOpinion`, `DecisionResult`, `DecisionExecutionTraceItem`, `KernelSignal`, `VirtualExitProposal`, `AttributedSignal`, `TradingManual`, API VOs, and frontend views (`mist-fe`).
  - Remove `ConsensusNode`, `ConsensusPluginWeight`, `ConsensusVoteBreakdown`, and `GuardNode.minConfidence` from `DecisionFlowEvaluator`, compilers, and `DecisionFlowBuilder` (strict fail-closed validation at compile/create boundaries with zero compatibility tolerance: any stored or submitted flow containing `minConfidence` or `CONSENSUS` is rejected).
  - Add forward-only DB migration `038_drop_signal_confidence_columns.sql` dropping `confidence` and `confidence_level` from `strategy_signals` and `backtest_signal_results`, and disabling enabled `strategy_definitions` whose current immutable version still contains `minConfidence` or `CONSENSUS`.
  - Update public plugins, presets, golden fixtures, and downstream external plugin bundles.

## Non-goals

- **Statistical risk metrics untouched**: VaR/CVaR quantile `confidence` in `libs/indicators/src/risk-performance/risk-performance.ts` is an orthogonal statistical parameter and MUST NOT be modified.
- **Cross-security portfolio cash sharing (Portfolio Arbiter)**: Both backtest and realtime currently operate per-security isolated virtual cash (`loadBySecurity`). Cross-security capital allocation remains a separate future portfolio-layer spec.
- **Multi-lot / fractional scaling & broker execution**: Partial position sizing, multi-slot pyramiding with lot-level T+1 tracking, and real broker fill writeback (`Task 10.3`) are out of scope.
- **Database `virtual_fill_events` schema**: Retained unchanged (`UNIQUE(alert_event_id)`).
