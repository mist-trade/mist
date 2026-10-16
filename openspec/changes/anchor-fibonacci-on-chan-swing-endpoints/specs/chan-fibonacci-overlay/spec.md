## MODIFIED Requirements

### Requirement: Fibonacci Retracement Factor Plugin

`@app/strategy` SHALL provide `FibonacciRetracementPlugin` with ID `'plugin.technical.fibonacci'`,
registered in category `'TECHNICAL'`. The plugin SHALL anchor its Fibonacci swing on the **last
completed and valid Chan unit** — a bi by default, selectable via the `units: 'bi' | 'duan'` parameter —
derived through the shared `@app/chancore` pipeline using the same `Complete && Valid` filter contract
as `plugin.chan.bsp`. It SHALL evaluate whether the latest price is in the Golden Pocket of that swing
and emit a structured `FactorOpinion` with action (`BUY` on the pullback of an upward unit, `SELL` on
the rebound of a downward unit, or `NEUTRAL`), confidence score, human-readable reason, and structured
`evidence`.
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
- **THEN** the plugin MUST return `action: 'BUY'` with confidence $\ge 0.75$
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

### Requirement: TradingView-Styled Fibonacci Visual Commands

`@app/visual-command` and `VisualController` SHALL support the `'fibonacci'` layer, anchored on the
same last completed valid Chan swing as the factor plugin (bi by default, `units: 'bi' | 'duan'`
selectable). When requested, it SHALL generate:
1. `band` commands for translucent color fills between adjacent levels (using TradingView official fill colors);
2. `line` commands for horizontal levels with official colors and dashed styles;
3. `text` commands for right-aligned ratio and price labels.

The command span SHALL start at the swing's start bar and extend to the latest bar. When no completed
valid unit exists, the adapter SHALL emit no fibonacci commands — it MUST NOT fall back to a
rolling-window anchor.

#### Scenario: Visual commands include TradingView styles

- **WHEN** `/v1/visual/commands` is invoked with `layers=fibonacci` and a completed valid swing exists
- **THEN** the output MUST contain 5 `band` commands and 7 `line` commands
- **AND** the Golden Pocket band MUST have color `'rgba(8, 153, 129, 0.12)'`

#### Scenario: No completed swing yields no fibonacci commands

- **WHEN** no completed valid unit exists
- **THEN** the fibonacci layer MUST emit no commands
