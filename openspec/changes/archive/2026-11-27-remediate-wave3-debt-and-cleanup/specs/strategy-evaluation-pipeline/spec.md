## ADDED Requirements

### Requirement: Window Imputation, Aggregation, Plugin Plan Cache, Simulation Frame Memory, And Definition Batching
- `StrategySeriesImputer` SHALL trim oldest bars via head-offset advancing with periodic compaction and reuse cached frozen read slices across invariant reads without weakening immutability guarantees.
- `reduceSlot` and `reduceDaily` SHALL compute OHLC high/low extrema via bounded single-pass loops without spread-operator stack risks.
- `LegacyRuleDslPlugin` SHALL cache compiled execution plans by rule object / canonical definition, `collectVirtualExitBindings` SHALL deduplicate identical `(ownerPluginId, rule)` bindings, and `StrategySimulationSession` SHALL store per-frame signal counts (`O(T)` space) rather than cloning full cumulative signal arrays into every frame slot.
- `StrategyDefinitionService.findAll()` SHALL batch-load current `StrategyVersion` rows in a single `In(...)` query instead of per-definition N+1 lookups.

#### Scenario: Imputer head trim and cached frozen reads preserve immutability
- **WHEN** `StrategySeriesImputer` appends, trims, and reads repeated sliding windows
- **THEN** `read()` MUST continue returning frozen equal snapshots across mutations while avoiding O(W) shift copies per trim
