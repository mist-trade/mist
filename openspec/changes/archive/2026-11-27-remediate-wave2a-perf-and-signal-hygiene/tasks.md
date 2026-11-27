# Tasks: Remediate Wave 2A Evaluation Performance, Context Metadata Hygiene, and Data Parity

## 1. Series Imputation, Multi-Day Daily Derivation & Sync Boundary (`libs/market-data`, `derived-period-aggregator.ts`, `tools/strategy-dev/sync.ts`)
- [x] 1.1 Write failing unit tests verifying:
  - `StrategySeriesImputer.append` treats `'0'` / `'0.00000000'` quantity strings identically to `hydrate` (forward-filling from `lastAnchor` within the trading day rather than returning `'observed'`);
  - `deriveRightLabeledPeriodBars(..., 1440)` over multi-day 1m bars emits one daily bar per trading day sorted chronologically (filtered by `anchorAvailabilityMs`);
  - `tools/strategy-dev/sync.ts` year-chunk helper covers `segEndYear` cleanly when `segment.before` falls mid-year.
- [x] 1.2 Fix `projectQuantityAppend` in `libs/market-data/src/projection/strategy-series-imputer.ts` using `isQuantityAnchor`.
- [x] 1.3 Fix `deriveRightLabeledPeriodBars(..., 1440)` in `libs/strategy/src/kernel/adapters/derived-period-aggregator.ts`.
- [x] 1.4 Fix `y <= segEndYear` in `tools/strategy-dev/sync.ts` (extract testable chunk helper if clean).

## 2. Context / Extractor Metadata Hygiene, Kernel Partial Prewarm & ChanBsp Single-Pass (`libs/strategy`)
- [x] 2.1 Write failing unit tests verifying:
  - Upstream `EXTRACTOR` nodes and upstream/downstream `role: 'context'` or `NEUTRAL` `GUARD` nodes never overwrite or hijack primary entry `badgeText`, `displayTag`, `styleMeta`, `originPluginId`, `pivotTime`, or `pivotPrice`;
  - Pure single-context-plugin test flows remain backward-compatible;
  - `ChanBspFactorPlugin` runs geometry + event detection in a single pass with identical output (e.g. spying on `ChanCore.createBi` called once per `evaluate`);
  - `StrategyEvaluationKernel` runs silent cursor advancement after `partial` prewarm when `actual > 0` without breaking `prewarmStatus: 'partial'` diagnostics.
- [x] 2.2 Implement context/extractor isolation across `decision-flow.types.ts`, `decision-flow-evaluator.ts`, `decision-pivot-evidence.ts`, and `strategy-evaluation-kernel.ts`.
- [x] 2.3 Refactor `ChanBspFactorPlugin` (`libs/strategy/src/factor/plugins/chan-bsp.plugin.ts`) to single-pass structure analysis.
- [x] 2.4 Update partial prewarm `evaluateSilent` trigger in `libs/strategy/src/kernel/strategy-evaluation-kernel.ts`.
- [x] 2.5 Run targeted Jest tests across affected suites, `typecheck`, `lint:check`, `check:magic`, and `openspec validate --strict`.
