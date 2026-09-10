## ADDED Requirements

### Requirement: Indicator Computation Core Shall Provide Fibonacci Rolling Series and Observation via Polars Rust Engine

`@app/indicators` SHALL expose stateless pure functions for Fibonacci retracement and extension calculations implemented strictly via `nodejs-polars` native expressions:
1. `computeFibonacciSeries(highs, lows, closes, params?)`: full rolling series with `{ begIndex, rollingHigh, rollingLow, diff, ratio, levels }`.
2. `computeFibonacciObservation(highs, lows, closes, params?)`: trailing observation with `{ high, low, close, diff, ratio, levels, zone, isGoldenPocket }`.
3. `computeFibonacciLevels(high, low, direction, options?)`: static price level calculation.
4. `computeStaticSwingFibonacci(high, low, currentPrice, direction, options?)`: static swing retracement classification.

#### Scenario: Full series computation matches trailing observation
- **WHEN** `computeFibonacciSeries` and `computeFibonacciObservation` evaluate the same inputs
- **THEN** the observation scalar values MUST strictly equal the trailing elements of the series arrays
- **AND** the computation MUST execute via the Polars Rust vectorized engine
