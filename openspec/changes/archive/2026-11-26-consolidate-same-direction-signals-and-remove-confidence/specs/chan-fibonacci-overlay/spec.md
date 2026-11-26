## MODIFIED Requirements

### Requirement: Fibonacci Retracement Factor Plugin

`@app/strategy` SHALL provide `FibonacciRetracementPlugin` with ID `'plugin.technical.fibonacci'`,
registered in category `'TECHNICAL'`. The plugin SHALL anchor its Fibonacci swing on the **last
completed and valid Chan unit** — a bi by default, selectable via the `units: 'bi' | 'duan'` parameter —
derived through the shared `@app/chancore` pipeline using the same `Complete && Valid` filter contract
as `plugin.chan.bsp`. It SHALL evaluate whether the latest price is in the Golden Pocket of that swing
and emit a structured `FactorOpinion` with action (`BUY` on the pullback of an upward unit, `SELL` on
the rebound of a downward unit, or `NEUTRAL`), human-readable reason, and structured `evidence` (without
a heuristic `confidence` score).
1. The swing's `high` / `low` SHALL come from the unit's extremes; the retracement ratio SHALL be
   `(high − close) / (high − low)` for an upward unit and `(close − low) / (high − low)` for a downward
   unit. Levels, zone and Golden Pocket classification SHALL reuse the existing pure functions
   (`computeStaticSwingFibonacci` / `computeFibonacciLevels`).
2. When no completed valid unit of the requested level exists, or the supplied bars are insufficient
   for the Chan derivation, the plugin SHALL return `NEUTRAL`. It MUST NOT fall back to a
   rolling-window anchor.
3. `evidence` SHALL include the swing anchors (`units`, `direction`, start/end time and price) alongside
   `levels`, `ratio` and TradingView styles.
4. The rolling-window `period` parameter is removed; the minimum bar count reuses the shared Chan
   derivation conventions.

#### Scenario: Factor plugin triggers BUY on Golden Pocket pullback

- **WHEN** the last completed valid upward bi exists and price pulls back into the Golden Pocket
  ($0.500 \sim 0.618$) of that swing
- **THEN** the plugin MUST return `action: 'BUY'`
- **AND** the `evidence` MUST include levels, ratio, and TradingView styles

#### Scenario: Rebound branch uses the completed downward unit

- **WHEN** the last completed valid unit is downward and price rebounds into its Golden Pocket
- **THEN** the plugin MUST return `action: 'SELL'`

#### Scenario: No completed unit yields NEUTRAL

- **WHEN** no completed valid unit of the requested level exists (or bars are insufficient for the
  Chan derivation)
- **THEN** the plugin MUST return `action: 'NEUTRAL'`
- **AND** it MUST NOT anchor on a rolling-window extreme

#### Scenario: Units parameter selects bi or duan

- **WHEN** `units: 'duan'` is supplied and no completed valid duan exists
- **THEN** the plugin MUST return `action: 'NEUTRAL'`
- **AND** it MUST NOT silently fall back to bi-level anchors
