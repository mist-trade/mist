# Change: Remediate Wave 2A Evaluation Performance, Context Metadata Hygiene, and Imputation/Aggregation Consistency

## Why

Following Wave 1 P0 stabilization, the full-stack audit identified several high-impact P1 evaluation performance, attribution, and multi-day data consistency defects across `libs/market-data`, `libs/strategy`, and `tools/strategy-dev/sync.ts`:

1. **Metadata / Evidence Leakage and Attribution Overwrite (`DecisionFlowEvaluator` + `StrategyEvaluationKernel`)**:
   - `EXTRACTOR` nodes and `role: 'context'` / `NEUTRAL` `GUARD` nodes currently propagate `badgeText`, `displayTag`, and `styleMeta` downstream into `nextInheritedMeta` and participate equally in backward trace scans (`findEvidenceFromTrace`, `findBadgeTextFromTrace`, `findOriginPluginId`), letting non-terminal context gates or extractors hijack primary entry badges, `originPluginId`, `pivotTime`, and `pivotPrice`.
2. **Duplicate Geometric Compute in `ChanBspFactorPlugin`**:
   - `ChanBspFactorPlugin.evaluate()` runs full Bi/Duan/Zhongshu construction and zero-retracement checks twice per bar (once inside `extractGeometry` and a second time inside `detectEvents`), doubling CPU cost on every bar.
3. **Kernel Prefetch & Partial Prewarm Hygiene**:
   - `StrategyEvaluationKernel` previously skipped `evaluateSilent` during `partial` prewarm transitions when `window.read().length < budget`, allowing sub-budget plugins or partial warm-ups to leak unadvanced historical pattern cursors into the first public evaluation.
4. **Imputation, Multi-Day Daily Derivation & Historical Sync Parity**:
   - `StrategySeriesImputer.projectQuantityAppend` checks only `raw !== null` instead of `isQuantityAnchor(raw)`, treating `'0'` canonical quantity strings as valid `'observed'` values on `append` while `imputeSeries` (`hydrate`) treats them as anomalies to impute.
   - `deriveRightLabeledPeriodBars(..., 1440)` passes the entire input array to `deriveDaily` instead of grouping by Shanghai trading day, collapsing multi-day 1m series into a single daily bar.
   - `tools/strategy-dev/sync.ts` iterates chunks using `y < segEndYear` instead of `y <= segEndYear`, dropping the final boundary year of segmented histories when `segment.before` falls mid-year.

## What Changes

- **Decision Flow Attribution & Context Isolation (`libs/strategy/src/decision-flow`, `libs/strategy/src/kernel`)**:
  - Tag `DecisionExecutionTraceItem` with optional `pluginRole?: 'signal' | 'context'`.
  - Prevent `EXTRACTOR` nodes, `NEUTRAL` opinions, and `role: 'context'` `GUARD` nodes from polluting `nextInheritedMeta`.
  - Update `findEvidenceFromTrace`, `findBadgeTextFromTrace`, `extractPivotEvidence`, and `findOriginPluginId` to prioritize passing non-context `GUARD` nodes over `EXTRACTOR` / `context`-role nodes (falling back to context nodes only when no signal-role node exists in the passing trace).
- **Single-Pass Chan Structure Analysis (`libs/strategy/src/factor/plugins`)**:
  - Merge `extractGeometry` and `detectEvents` in `ChanBspFactorPlugin` into a shared structure analysis pass so `ChanCore.createBi`, `createDuan`, channel construction, and MACD zero-retracement execute at most once per bar.
- **Kernel Partial Prewarm Cursor Advancement (`libs/strategy/src/kernel`)**:
  - Ensure `evaluateSilent` advances plugin cursors at prewarm completion whenever `actual > 0` and prewarm bars were pushed (`this.cursors.get(period) !== undefined`), rather than gating silent progression strictly behind `window.read().length >= budget`.
- **Series Imputation, Multi-Day Aggregation & Sync Boundary Fixes (`libs/market-data`, `libs/strategy/src/kernel/adapters`, `tools/strategy-dev`)**:
  - Reuse `isQuantityAnchor(raw)` in `StrategySeriesImputer.projectQuantityAppend` so `'0'` canonical strings forward-fill identically to `hydrate`.
  - Group 1m bars by Shanghai trading day (`shanghaiMidnightOf`) inside `deriveRightLabeledPeriodBars(..., 1440)` and sort derived daily bars chronologically under the causal `anchorAvailabilityMs` filter.
  - Fix the segmented year loop in `tools/strategy-dev/sync.ts` (`y <= segEndYear`) so the final boundary year is fetched cleanly.

## Non-Goals

- Trading-engine four-path Next-Bar execution parity and delivery concurrency locks (`Wave 2B`).
- Database DDL schema changes or migrations.
- Private plugin internals or proprietary performance optimizations (`handled independently in private repository`).
