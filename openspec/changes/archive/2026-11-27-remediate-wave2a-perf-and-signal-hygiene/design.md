# Design: Wave 2A Evaluation Performance, Context Metadata Hygiene, and Data Parity

## Technical Decisions

### 1. Context-Role & Extractor Trace Hygiene
- `DecisionExecutionTraceItem` in `libs/strategy/src/decision-flow/decision-flow.types.ts` adds optional `readonly pluginRole?: 'signal' | 'context'`.
- `DecisionFlowEvaluator.resolveOpinion` exposes the resolved plugin's `role` alongside `FactorOpinion`.
- During node traversal:
  - `EXTRACTOR` nodes write to `context.attributes` and record diagnostic trace items, while passing `inheritedMeta` downstream unmodified (never injecting extractor `badgeText`/`displayTag`/`styleMeta` into terminal signal presentation).
  - `GUARD` nodes update `nextInheritedMeta` ONLY when `pluginRole !== 'context'` and `opinion.action` is `'BUY' | 'SELL'`. `NEUTRAL` opinions and `context`-role filter gates leave `inheritedMeta` untouched.
  - Primary attribution selectors (`findEvidenceFromTrace`, `findBadgeTextFromTrace` in `DecisionFlowEvaluator`, `extractPivotEvidence` in `decision-pivot-evidence.ts`, and `findOriginPluginId`/`findBadgeTextFromTrace` in `StrategyEvaluationKernel`) skip failed items (`passed === false`) and `EXTRACTOR` items, and prefer passing `GUARD` items with `pluginRole !== 'context'`, falling back to `context` items only when a tree has no signal-role plugin nodes at all.

### 2. Single-Pass `ChanBspFactorPlugin` Geometry & Event Detection
- Extract private `analyzeChanStructure(klines, units)` returning both `{ geometry: ChanGeometryPayload, events: readonly ChanBspDetectedEvent[] }` from a single execution of `ChanCore.createBi`, `createDuan`/`createDuanChannels`/`createBiChannels`, and `checkZhongshuZeroRetracement`.
- Preserve exact geometry payload shape (`chan.geometry`, `chan.channels`) and exact detected event objects so zero mathematical or structural behavior changes occur while removing 50% redundant computation per bar.

### 3. Partial Prewarm Silent Cursor Catchup
- In `StrategyEvaluationKernel`, when `!this.preWarmEvaluated.has(bar.period)`:
  - Retain `prewarmStatus` classification (`empty` / `partial` / `full`) identically;
  - When `actual > 0 && this.cursors.get(bar.period) !== undefined`, invoke `evaluateSilent(bar.period, new Date(this.cursors.get(bar.period)!))` regardless of whether `window.read().length >= budget`, so any plugin with `minRequired <= actual` catches up its monotonic cursor cleanly prior to the first public bar without letting `partial` prewarm leak pre-public patterns.

### 4. Imputation Append vs Hydrate Parity & Multi-Day 1440 Aggregation
- In `StrategySeriesImputer.projectQuantityAppend`, reuse `isQuantityAnchor(raw)` (`Decimal8.parseCanonical(raw).compare(Decimal8.ZERO) !== 0`) before classifying a quantity field as `'observed'`; canonical zero strings degrade via `lastAnchor` (`forwardFilled` / `unavailable`) matching `imputeSeries`.
- In `deriveRightLabeledPeriodBars(..., 1440)`, partition `oneMinuteBars` by `shanghaiMidnightOf(bar.timestamp).getTime()`, invoke `reduceDaily` per day bucket, filter by `availabilityKey(bar).getTime() < anchorAvailabilityMs`, and sort ascending by `timestamp`.
- In `tools/strategy-dev/sync.ts`, loop `for (let y = startYear; y <= segEndYear; y += CHUNK_YEARS)` with existing `from >= before` empty-range guard.
