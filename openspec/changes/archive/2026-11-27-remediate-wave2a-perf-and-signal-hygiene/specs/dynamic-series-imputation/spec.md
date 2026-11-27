## ADDED Requirements

### Requirement: Append Quantity Imputation Shall Match Hydration Zero-Anomaly Semantics
`StrategySeriesImputer.append` SHALL evaluate quantity fields (`volume` and `amount`) using `isQuantityAnchor` identically to `imputeSeries` (`hydrate`): valid canonical `'0'` strings SHALL NOT be marked as `'observed'` anchors and SHALL forward-fill from the active same-day anchor (or remain `'unavailable'` when no same-day anchor precedes them).

#### Scenario: Incremental append forward-fills canonical zero volume identically to hydrate
- **WHEN** a hydrated or live window contains a valid non-zero volume bar followed by a same-day bar with `volume: '0'`
- **THEN** `append` MUST emit `resolution: 'forwardFilled'` and carry the prior anchor's `effective` volume, matching `imputeSeries`
