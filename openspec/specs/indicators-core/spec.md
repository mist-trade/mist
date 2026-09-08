# indicators-core Specification

## Purpose
Define the pure `@app/indicators` computation core: stateless series calculations and anchor
observations for MACD/KDJ/RSI/ADX/ATR/DualMA, unit-force aggregation from the MACD histogram, public
endpoint delegation and confinement of the `technicalindicators` dependency.
## Requirements
### Requirement: Indicator Computation Core Shall Provide Stateless Series Calculations

`@app/indicators` SHALL expose stateless pure functions `computeMacdSeries`, `computeKdjSeries`,
`computeRsiSeries`, `computeAdxSeries`, `computeAtrSeries` and `computeDualMaSeries` implemented strictly via
`nodejs-polars` native vectorized expressions without JavaScript imperative calculation loops. Each series function
SHALL accept `readonly number[]` inputs, SHALL NOT mutate them, SHALL have no I/O, no
Nest/TypeORM/environment dependency, and SHALL produce deterministic output with `{begIndex, ...arrays}`
TA-Lib-style alignment where `out[i] === in[i + begIndex]`. The fixed default parameters SHALL remain
MACD(12,26,9 EMA), KDJ(9,3,3), RSI(14), ADX(14), ATR(14) and DualMA(13,60). An empty or insufficient input
SHALL return empty output arrays with `begIndex` equal to the input length (no error).

#### Scenario: A caller computes a full indicator series
- **WHEN** a caller supplies an ordered OHLC or close series
- **THEN** the corresponding `compute*Series` function MUST return `{ begIndex, ...series arrays }`
- **AND** each series array MUST contain only valid values aligned to the input by `begIndex`
- **AND** the calculation MUST evaluate using Polars vectorized expressions (`ewmMean`, `rollingMean`, `rollingMin`, `rollingMax`, `diff`, `shift`) without JavaScript imperative calculation loops
- **AND** the output MUST be deterministic and the inputs MUST NOT be mutated

#### Scenario: A caller passes a read-only array
- **WHEN** a caller passes a `readonly number[]` (including a derived or frozen view) to a series
  function
- **THEN** the function MUST accept it without mutation of the caller's array

#### Scenario: A caller uses the fixed default parameters
- **WHEN** a caller invokes a series function without parameter overrides
- **THEN** the calculation MUST use MACD(12,26,9 EMA), KDJ(9,3,3), RSI(14), ADX(14), ATR(14) and
  DualMA(13,60) respectively

### Requirement: Indicator Computation Core Shall Provide Anchor Observations

`@app/indicators` SHALL expose stateless pure functions `computeMacdObservation(closes, opts?)` and
`computeKdjObservation(high, low, close, opts?)` where `opts.windowSize` is optional. Each returns the
trailing scalar observation (`{line, signal, histogram}` / `{k, d, j}`) of the exact-catalog-window
calculation over the supplied input. When `opts.windowSize` is provided the input length SHALL equal it,
otherwise the function SHALL throw `IndicatorInputError`. A non-finite trailing value SHALL throw
`IndicatorValueError`. For identical input and parameters the observation SHALL equal the trailing value
of the corresponding series result, and each function SHALL have no I/O, no Nest/TypeORM/environment
dependency, SHALL NOT mutate its inputs and SHALL be deterministic.

#### Scenario: A caller obtains an anchor observation
- **WHEN** a caller supplies an ordered window of closes (or OHLC triples) ending at the anchor of
  interest
- **THEN** `computeMacdObservation` / `computeKdjObservation` MUST return the trailing scalar observation
- **AND** the observation MUST equal the trailing value of the corresponding `compute*Series` result for
  the same input and parameters

#### Scenario: A caller enforces an exact window
- **WHEN** a caller supplies `opts.windowSize` and the input length differs from it
- **THEN** the function MUST throw `IndicatorInputError`

#### Scenario: The trailing observation is not finite
- **WHEN** the input window is too short to produce a finite trailing value
- **THEN** the function MUST throw `IndicatorValueError`

### Requirement: Public Indicator Endpoints Shall Delegate To The Pure Core

The public Indicator HTTP endpoints (`POST /v1/indicators/macd|kdj|rsi`) SHALL compute their output by
delegating to the `@app/indicators` series functions through the existing `IndicatorService` methods
(thin conversion only: DTO validation, numeric coercion, delegation, assembly), and the HTTP response
contract (series arrays, `begIndex` semantics, `nbElement`) MUST NOT change. The `IndicatorService`
methods `runADX`, `runDualMA` and `runATR` SHALL also delegate to the pure core while preserving their
existing signatures and behavior.

#### Scenario: The public MACD endpoint delegates to the pure function
- **WHEN** `IndicatorService.runMACD` computes MACD for `POST /v1/indicators/macd`
- **THEN** it MUST delegate to `computeMacdSeries`
- **AND** the HTTP response contract (macd/signal/histogram values and `begIndex` semantics) MUST NOT change

#### Scenario: The public KDJ and RSI endpoints delegate to the pure functions
- **WHEN** `IndicatorService.runKDJ` or `IndicatorService.runRSI` computes output for
  `POST /v1/indicators/kdj|rsi`
- **THEN** each MUST delegate to the corresponding `compute*Series` function
- **AND** the HTTP response contract MUST NOT change

#### Scenario: The endpoint response is aligned to the K series
- **WHEN** a public MACD/KDJ/RSI endpoint produces its response array
- **THEN** it MUST return one entry per input K bar with `formatIndicator` NaN alignment for warm-up
  positions
- **AND** the delegated series values MUST preserve the current HTTP contract identically

#### Scenario: The KDJ endpoint uses the catalog parameters
- **WHEN** `IndicatorService.runKDJ` computes KDJ for `POST /v1/indicators/kdj`
- **THEN** it MUST delegate with the core default parameters `(9,3,3)`
- **AND** the historical controller override `period: 14` MUST be removed as a deliberate API
  behaviour fix (the only public API output change of this change)

#### Scenario: A legacy no-route method delegates
- **WHEN** `IndicatorService.runADX`, `runDualMA` or `runATR` is invoked by any caller
- **THEN** it MUST delegate to the corresponding series function
- **AND** its method signature and returned shape MUST NOT change

### Requirement: The Indicator Dependency Shall Be Confined To The Core

The legacy `technicalindicators` npm package SHALL be completely retired and uninstalled. The `nodejs-polars` package SHALL be imported only by `libs/indicators` source files. Any other library or application SHALL consume indicator math through `@app/indicators` pure functions; a backtest or realtime runtime MAY import `@app/indicators` directly (pure functions, no HTTP, no database) and MUST NOT depend on the public Indicator HTTP API for indicator computation.

#### Scenario: The repository is scanned for the indicator dependency
- **WHEN** all `libs/**` and `apps/**` TypeScript sources are scanned for math library imports
- **THEN** no source file MUST import `technicalindicators`
- **AND** only files under `libs/indicators` MUST contain imports of `nodejs-polars`

#### Scenario: A runtime consumes indicator values without the public Indicator HTTP API
- **WHEN** a backtest or realtime consumer needs indicator values
- **THEN** it MAY import `@app/indicators` directly
- **AND** it MUST NOT depend on the public Indicator HTTP API for indicator computation

### Requirement: Indicator Computation Core Shall Aggregate Unit Force From MACD Histogram

`@app/indicators` SHALL expose a stateless `computeUnitForces(histogram, begIndex, kTimes, units)`
pure function that computes one force value per unit, where a unit's force is the sum of valid
histogram values over the K indices whose times fall inside the unit's `[startTime, endTime]` interval
(positions before `begIndex` are invalid and skipped). A unit with no valid in-interval histogram
value SHALL receive force 0. The function SHALL have no I/O, no Nest/TypeORM/environment dependency
and SHALL NOT mutate its inputs.

#### Scenario: A caller aggregates unit force over an interval
- **WHEN** a caller supplies a histogram aligned to K times and units with start/end times
- **THEN** `computeUnitForces` MUST return one force per unit in the same order
- **AND** each force MUST be the sum of valid histogram values over the unit's K interval
- **AND** units entirely inside the warm-up (before `begIndex`) MUST receive force 0
- **AND** the inputs MUST NOT be mutated

### Requirement: Indicator Computation Core Shall Provide Pure Mathematical Time-Series Alpha Primitives (Series and Observation Dual Views)

The `@app/indicators` library SHALL expose stateless pure functions for 8 time-series alpha primitives under both full-series (`compute*Series`) and trailing-observation (`compute*Observation`) contracts:
1. `computeTsRankSeries` and `computeTsRankObservation`
2. `computeTsArgMaxSeries` and `computeTsArgMaxObservation`
3. `computeTsArgMinSeries` and `computeTsArgMinObservation`
4. `computeDecayLinearSeries` and `computeDecayLinearObservation`
5. `computeRollingCorrSeries` and `computeRollingCorrObservation`
6. `computeRollingStdSeries` and `computeRollingStdObservation`
7. `computeTsDeltaSeries` and `computeTsDeltaObservation`
8. `computeTsDelaySeries` and `computeTsDelayObservation`

Each `compute*Series` function SHALL return `{ begIndex, values }` where `begIndex` marks the leading warm-up positions and each output value aligns to the input by `values[i] === input[i + begIndex]`. Each `compute*Observation` function SHALL return the scalar numerical result evaluated strictly at the trailing window ending at the input's last element. Each function SHALL accept `readonly number[]` inputs, SHALL NOT mutate caller arrays, SHALL produce deterministic output without I/O or environment dependencies, and SHALL throw `IndicatorInputError` on invalid parameters (such as non-positive or non-integer window sizes, or mismatched dual-series lengths). When the input length is strictly less than the required window, each series function SHALL return `{ begIndex: input.length, values: [] }` without error, and each observation function SHALL throw `IndicatorInputError`.

#### Scenario: A caller computes rolling percentile rank with computeTsRankSeries and computeTsRankObservation
- **WHEN** a caller supplies an ordered number array and a positive window size `W`
- **THEN** `computeTsRankSeries` MUST return `{ begIndex: W - 1, values }`
- **AND** for each sliding window of length `W`, the output value MUST reflect the percentile rank of the trailing element normalized to `[0.0, 1.0]` by default
- **AND** if all values within a sliding window are identical, the normalized percentile rank MUST evaluate to `0.5`
- **AND** `computeTsRankObservation` MUST return the scalar percentile rank of the final window strictly matching the last element of `computeTsRankSeries.values`

#### Scenario: A caller computes extreme value offset with computeTsArgMax and computeTsArgMin
- **WHEN** a caller supplies an ordered number array and a positive window size `W`
- **THEN** `computeTsArgMaxSeries` and `computeTsArgMinSeries` MUST return `{ begIndex: W - 1, values }`
- **AND** each value in `computeTsArgMaxSeries` MUST equal the distance (0 to `W - 1`) from the current bar to the maximum value in the window
- **AND** each value in `computeTsArgMinSeries` MUST equal the distance (0 to `W - 1`) from the current bar to the minimum value in the window
- **AND** when multiple identical extreme values exist in the window, the closest one to the current bar (minimum offset) MUST be selected
- **AND** the corresponding observation functions MUST return the scalar offset matching the last value of the series

#### Scenario: A caller computes linear decay moving average with computeDecayLinear
- **WHEN** a caller supplies an ordered number array and a positive window size `W`
- **THEN** `computeDecayLinearSeries` MUST return `{ begIndex: W - 1, values }`
- **AND** each value MUST equal $\sum_{k=1}^W (k \cdot x_{t - W + k}) / \sum_{k=1}^W k$
- **AND** `computeDecayLinearObservation` MUST return the trailing scalar value matching the last series entry

#### Scenario: A caller computes rolling Pearson correlation with computeRollingCorr
- **WHEN** a caller supplies two ordered number arrays of equal length and a positive window size `W`
- **THEN** `computeRollingCorrSeries` MUST return `{ begIndex: W - 1, values }`
- **AND** each value MUST represent the Pearson correlation coefficient between the two series over the sliding window
- **AND** if either series in a sliding window has zero variance (flat line), the correlation MUST safely evaluate to `0.0`
- **AND** all output correlation values MUST be clamped within `[-1.0, 1.0]`
- **AND** `computeRollingCorrObservation` MUST return the trailing scalar correlation matching the last series entry

#### Scenario: A caller computes rolling standard deviation with computeRollingStd
- **WHEN** a caller supplies an ordered number array and a positive window size `W`
- **THEN** `computeRollingStdSeries` MUST return `{ begIndex: W - 1, values }`
- **AND** each value MUST evaluate to the sample standard deviation with Bessel correction `ddof: 1` by default
- **AND** when `options.ddof` is specified as `0`, it MUST evaluate to the population standard deviation
- **AND** `computeRollingStdObservation` MUST return the trailing scalar standard deviation matching the last series entry

#### Scenario: A caller computes time-series difference and delay with computeTsDelta and computeTsDelay
- **WHEN** a caller supplies an ordered number array and a positive lag `period` (default `1`)
- **THEN** `computeTsDeltaSeries` MUST return `{ begIndex: period, values }` with `values[i] === input[i + period] - input[i]`
- **AND** `computeTsDelaySeries` MUST return `{ begIndex: period, values }` with `values[i] === input[i]`
- **AND** the corresponding observation functions MUST return the trailing scalar value

#### Scenario: Input immutability and deterministic pure computation
- **WHEN** any time-series primitive function is invoked with frozen or read-only input arrays
- **THEN** the inputs MUST NOT be mutated in-place
- **AND** calling the function repeatedly with the same inputs and parameters MUST produce identical results

#### Scenario: Invalid parameters throw IndicatorInputError
- **WHEN** a caller invokes any windowed time-series primitive with `window <= 0`, `NaN`, non-integer `window`, or mismatched series lengths
- **THEN** the function MUST throw an instance of `IndicatorInputError`

#### Scenario: Insufficient input length handling
- **WHEN** a caller passes an input array whose length is strictly less than the required `window` (or `period + 1`)
- **THEN** the series function MUST return `{ begIndex: input.length, values: [] }` without error
- **AND** the observation function MUST throw `IndicatorInputError`

### Requirement: Indicator Computation Core Shall Confine Polars Dependency and Prevent Type Leakage

The `@app/indicators` library SHALL encapsulate `nodejs-polars` strictly within `libs/indicators/src/time-series/` as an internal implementation detail.
1. No Polars classes, types, or interfaces (including `DataFrame`, `Series`, `Expr`) SHALL be exported from `@app/indicators` or appear in public function signatures.
2. All inputs SHALL be standard JavaScript/TypeScript primitives (`readonly number[]`, `number`, plain option objects) and all outputs SHALL be standard Mist structures (`TimeSeriesResult` or `number`).
3. External modules in `apps/` or other `libs/` SHALL NOT import `nodejs-polars` directly; this boundary SHALL be enforced by `libs/indicators/src/indicators-boundary.guard.spec.ts`.

#### Scenario: An external consumer imports time-series primitives from @app/indicators
- **WHEN** any external module imports from `@app/indicators`
- **THEN** it MUST access only standard TypeScript types (`TimeSeriesResult`, option interfaces, `IndicatorInputError`)
- **AND** no `nodejs-polars` classes, types, or instances MUST be accessible or required

#### Scenario: Boundary guard verifies nodejs-polars confinement
- **WHEN** `indicators-boundary.guard.spec.ts` runs
- **THEN** it MUST assert that no file under `apps/` or `libs/` (outside `libs/indicators/src/`) imports `nodejs-polars`

