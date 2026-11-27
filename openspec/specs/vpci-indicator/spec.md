# vpci-indicator Specification

## Purpose

Define the pure Polars-vectorized VPCI (Volume Price Confirmation Indicator) math operator in `@app/indicators`.

> **Evolution note (2026-11-26)**: The former kernel-side `extractVolumeFeatures` helper and `context.attributes.set('volumeFeatures', ...)` blackboard injection were physically removed from `libs/strategy` on 2026-10-31 to keep `StrategyEvaluationKernel` strictly domain-neutral. This live specification therefore governs only the pure `@app/indicators` VPCI operator.

## Requirements
### Requirement: VPCI Operator (Buff Dormeier Formula)

`@app/indicators` SHALL expose `computeVpciSeries(prices, volumes, options?)` and
`computeVpciObservation(prices, volumes, options?)` with defaults `shortPeriod = 5`,
`longPeriod = 20`, `signalPeriod = 10`, computed strictly via `nodejs-polars` expressions.
1. `VWMA_N = rollingSum(prices × volumes, N) / rollingSum(volumes, N)` with an SMA fallback when the
   rolling volume sum is `0`; `SMA_N = rollingMean(prices, N)`.
2. `VPC = VWMA_long − SMA_long`; `VPR = (VWMA_short / SMA_short) / (VWMA_long / SMA_long)`;
   `VM = rollingMean(volumes, short) / rollingMean(volumes, long)`; `VPCI = VPC × VPR × VM`;
   `SignalLine = rollingMean(VPCI, signalPeriod)`.
3. Minimum length `minRequired = longPeriod + signalPeriod − 1`; below it the series returns empty
   arrays with `begIndex = prices.length` and the observation throws `IndicatorInputError`.
4. Division guards: zero denominators SHALL safely fall back to `1.0`; all outputs MUST remain finite.
5. Alignment contract: `out[i] === in[i + begIndex]`.

#### Scenario: VPCI assembly on a reference series

- **WHEN** a fixed price/volume fixture is evaluated
- **THEN** `vpc`, `vpr` and `vpci` MUST match the hand-computed Dormeier formula oracle

#### Scenario: Zero-volume guards fall back to 1.0

- **WHEN** rolling volume or moving-average denominators evaluate to `0`
- **THEN** the affected ratio MUST evaluate to `1.0` (never `NaN` / `Infinity`)

#### Scenario: Insufficient input is handled by both views

- **WHEN** the input length is below `minRequired`
- **THEN** `computeVpciSeries` MUST return empty arrays with `begIndex = prices.length`
- **AND** `computeVpciObservation` MUST throw `IndicatorInputError`

