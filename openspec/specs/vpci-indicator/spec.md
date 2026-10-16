# vpci-indicator Specification

## Purpose
TBD - created by archiving change introduce-volatility-squeeze-and-vpci-plugins. Update Purpose after archive.
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

### Requirement: Volume Features Extractor And Blackboard Contract

`libs/strategy` SHALL provide `extractVolumeFeatures(bars)` converting projected strategy bars into a
read-only `VolumeFeaturesAttribute` (squeeze state, volume TsRank, volume ratio, relative price
position, ATR, VWAP, VPCI family, latest OHLC) assembled exclusively from the shared `@app/indicators`
operators (Bollinger / Keltner / ATR / TsRank / VOL / RPP / VWAP / VPCI), with a minimum of 30 bars.
1. **VWAP precision**: the extractor SHALL read each bar's `amount` (`amount.effective ?? amount.raw`)
   and compute the VWAP with the exact amount-weighted口径 — window `VWAP = Σamount / Σvolume` — by
   passing `amounts` into `computeVwapObservation`. The close×volume approximation MUST NOT be used
   when amounts are available.
2. **Window-cumulative semantics**: the produced VWAP is cumulative over the supplied bar window —
   NOT a session-reset or anchored VWAP. This semantic is declared, not implied.
3. **Availability (fail-closed)**: if any bar's amount is missing or non-finite, or the window's
   `Σamount ≤ 0`, the extractor SHALL return `undefined` and MUST NOT assemble `volumeFeatures` — no
   fallback口径, no zero filling. Plugins observe the absence through the existing insufficient /
   degraded path and return `NEUTRAL`.
4. **Blackboard assembly**: `StrategyEvaluationKernel.buildContext()` SHALL publish the attribute as
   `context.attributes.set('volumeFeatures', extractVolumeFeatures(bars))`; plugins SHALL consume it
   read-only via `context.attributes.get('volumeFeatures')` without importing indicator math.

#### Scenario: Exact amount-weighted VWAP

- **WHEN** a fixture whose per-bar `amount / volume` differs from `close` is extracted
- **THEN** `vwap` MUST equal `Σamount / Σvolume` (hand-computed oracle)
- **AND** it MUST NOT equal the close×volume approximation

#### Scenario: Unusable amount suppresses the feature bundle

- **WHEN** any bar in the window lacks amount, or the window's `Σamount ≤ 0`
- **THEN** the extractor MUST return `undefined`
- **AND** it MUST NOT emit a `vwap` value derived from any fallback口径

#### Scenario: Insufficient bar count suppresses the feature bundle

- **WHEN** fewer than 30 bars are supplied
- **THEN** the extractor MUST return `undefined`

