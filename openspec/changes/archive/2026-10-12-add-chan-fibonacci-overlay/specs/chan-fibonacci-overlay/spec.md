## ADDED Requirements

### Requirement: Pure Vectorized Fibonacci Indicator via Polars Rust Engine
`@app/indicators` SHALL expose stateless pure functions `computeFibonacciSeries(highs, lows, closes, params?)` and `computeFibonacciObservation(highs, lows, closes, params?)` implemented strictly via `nodejs-polars` native expressions without JavaScript imperative calculation loops.
1. `computeFibonacciSeries` SHALL return `{ begIndex, rollingHigh, rollingLow, diff, ratio, levels }` aligned to the input by `out[i] === in[i + begIndex]`.
2. `computeFibonacciObservation` SHALL return `{ high, low, close, diff, ratio, levels, zone, isGoldenPocket }` evaluated on the trailing window.
3. Supported ratios SHALL include at minimum $0.000, 0.236, 0.382, 0.500, 0.618, 0.786, 1.000$ for retracements, and $1.272, 1.382, 1.618, 2.000$ for extensions.
4. When input length is less than `period`, `computeFibonacciSeries` SHALL return empty arrays with `begIndex` equal to input length, and `computeFibonacciObservation` SHALL throw `IndicatorInputError`.

#### Scenario: Computing Fibonacci series over rolling window
- **WHEN** a caller supplies 10 bars with period 5
- **THEN** `computeFibonacciSeries` MUST return `begIndex = 4` with 6 elements in each series array
- **AND** all calculations MUST evaluate within the Polars Rust engine

#### Scenario: Trailing observation detects Golden Pocket
- **WHEN** price pulls back into the $0.500 \sim 0.618$ zone (ratio = 0.55)
- **THEN** `computeFibonacciObservation` MUST return `isGoldenPocket: true` and `zone: 'GOLDEN_POCKET'`

### Requirement: Fibonacci Retracement Factor Plugin
`@app/strategy` SHALL provide `FibonacciRetracementPlugin` with ID `'plugin.technical.fibonacci'`, registered in category `'TECHNICAL'`. The plugin SHALL evaluate whether the latest price is in the Golden Pocket of the rolling swing, and emit a structured `FactorOpinion` with action (`BUY` on pullback, `SELL` on rebound, or `NEUTRAL`), confidence score, human-readable reason, and structured `evidence`.

#### Scenario: Factor plugin triggers BUY on Golden Pocket pullback
- **WHEN** price pulls back into the Golden Pocket ($0.500 \sim 0.618$)
- **THEN** the plugin MUST return `action: 'BUY'` with confidence $\ge 0.75$
- **AND** the `evidence` MUST include levels, ratio, and TradingView styles

### Requirement: TradingView-Styled Fibonacci Visual Commands
`@app/visual-command` and `VisualController` SHALL support the `'fibonacci'` layer. When requested, it SHALL generate:
1. `band` commands for translucent color fills between adjacent levels (using TradingView official fill colors);
2. `line` commands for horizontal levels with official colors and dashed styles;
3. `text` commands for right-aligned ratio and price labels.

#### Scenario: Visual commands include TradingView styles
- **WHEN** `/v1/visual/commands` is invoked with `layers=fibonacci`
- **THEN** the output MUST contain 5 `band` commands and 7 `line` commands
- **AND** the Golden Pocket band MUST have color `'rgba(8, 153, 129, 0.12)'`
