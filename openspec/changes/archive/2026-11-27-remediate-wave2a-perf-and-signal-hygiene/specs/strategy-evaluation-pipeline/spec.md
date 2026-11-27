## ADDED Requirements

### Requirement: Decision Flow And Kernel Attribution Shall Isolate Context And Extractor Metadata
`DecisionFlowEvaluator` and `StrategyEvaluationKernel` SHALL isolate primary trading signal identity (`badgeText`, `displayTag`, `styleMeta`, `originPluginId`, `evidence`, `pivotTime`, `pivotPrice`) from `EXTRACTOR` nodes, `NEUTRAL` opinions, and `role: 'context'` `GUARD` filters:
- `EXTRACTOR` nodes and `NEUTRAL` / `context`-role `GUARD` nodes MUST NOT propagate presentation metadata into `nextInheritedMeta`;
- Trace attribution helpers (`findEvidenceFromTrace`, `findBadgeTextFromTrace`, `extractPivotEvidence`, `findOriginPluginId`) MUST ignore failed nodes and `EXTRACTOR` nodes, and MUST prioritize passing signal-role `GUARD` nodes ahead of `context`-role nodes (falling back to context nodes only if no signal-role node exists in the passing trace).

#### Scenario: Context guard and extractor cannot overwrite primary signal badge or pivot evidence
- **WHEN** a decision flow evaluates an upstream/downstream `role: 'context'` `GUARD` or `EXTRACTOR` carrying its own `badgeText`, `displayTag`, or `evidence` alongside a passing primary signal-role `GUARD`
- **THEN** the emitted `DecisionResult` and `KernelSignal` MUST retain the primary signal-role plugin's `badgeText`, `originPluginId`, `pivotTime`, and `pivotPrice`

### Requirement: Chan Buy/Sell Factor Plugin Shall Compute Structure Once Per Bar
`ChanBspFactorPlugin.evaluate` SHALL derive merged geometry payload and buy/sell point candidate events from a single structural analysis pass (`createBi`, `createDuan`, channel construction, and zero-retracement checks) per evaluation bar while producing identical geometry and event outputs.

#### Scenario: Evaluate performs single Bi/Duan structural pass per bar
- **WHEN** `ChanBspFactorPlugin.evaluate` executes on a bar window
- **THEN** underlying Bi/Duan construction MUST invoke at most once per evaluation while preserving full `chan.geometry` and detected events

### Requirement: Multi-Day 1440 Derivation Shall Partition By Trading Day And Partial Prewarm Shall Advance Ready Plugins
`deriveRightLabeledPeriodBars(..., 1440)` SHALL partition input 1m bars by Shanghai trading day and output one chronologically sorted daily bar per qualifying day under the `anchorAvailabilityMs` filter. `StrategyEvaluationKernel` SHALL run `evaluateSilent` upon concluding a non-empty prewarm phase (`prewarmActual > 0`) whenever prewarm bars were pushed, even under `partial` status relative to max plan budget, so ready sub-budget plugins advance monotonic cursors prior to public bars.

#### Scenario: Multi-day 1m bars derive separate daily bars per trading day
- **WHEN** `deriveRightLabeledPeriodBars(bars, 1440)` receives 1m bars spanning multiple Shanghai trading days
- **THEN** it MUST return one `period = 1440` bar per trading day in strictly ascending chronological order

#### Scenario: Partial prewarm advances plugin cursor prior to first public bar
- **WHEN** prewarm delivers fewer bars than max plan budget (`prewarmStatus = 'partial'`) but enough for a plugin inside the flow to detect prior historical patterns
- **THEN** the kernel MUST silently advance cursors across prewarm bars before public emission begins
