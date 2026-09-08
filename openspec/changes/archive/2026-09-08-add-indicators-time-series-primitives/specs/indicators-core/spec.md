## ADDED Requirements

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

