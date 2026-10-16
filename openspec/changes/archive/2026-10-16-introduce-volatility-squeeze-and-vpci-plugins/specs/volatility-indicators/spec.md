## ADDED Requirements

### Requirement: Polars-Vectorized Bollinger Bands Operator

`@app/indicators` SHALL expose `computeBollingerBandsSeries(prices, options?)` and
`computeBollingerBandsObservation(prices, options?)` computed strictly via `nodejs-polars` expressions,
with defaults `period = 20` and `stdDevMultiplier = 2.0`.
1. `middle = rollingMean(prices, period)`; `std` SHALL be the **population standard deviation
   (ddof = 0)** provided by the shared `computeRollingStdSeries(prices, period, { ddof: 0 })` operator —
   the single ddof source of truth in the library; inline duplication of the Bessel-correction factor is
   forbidden. `upper = middle + stdDevMultiplier × std`, `lower = middle − stdDevMultiplier × std`,
   `bandwidth = (upper − lower) / middle`.
2. When `prices.length < period`, the series function SHALL return empty arrays with `begIndex` equal
   to the input length; the observation function SHALL throw `IndicatorInputError`.
3. Float safety: `bandwidth` SHALL fall back to `0.0` when `middle <= 0`; flat windows SHALL keep
   defined finite values (`std = 0`).
4. Alignment contract: `upper.length === prices.length − begIndex` and `out[i] === in[i + begIndex]`.

#### Scenario: Bands use the population standard deviation

- **WHEN** a fixed 20-bar fixture is evaluated
- **THEN** `upper − middle` MUST equal `2.0 × ddof0_std` where `ddof0_std` is the population standard
  deviation asserted by the hand-computed oracle in the test
- **AND** the band width MUST be strictly narrower than the sample-standard-deviation (ddof = 1) result

#### Scenario: Insufficient input is handled by both views

- **WHEN** the input length is less than `period`
- **THEN** `computeBollingerBandsSeries` MUST return empty arrays with `begIndex = prices.length`
- **AND** `computeBollingerBandsObservation` MUST throw `IndicatorInputError`

#### Scenario: Flat window stays finite

- **WHEN** all prices in the window are identical
- **THEN** `std` MUST be `0`, the bands collapse onto `middle` and `bandwidth` MUST be `0.0`

### Requirement: Polars-Vectorized Keltner Channels Operator

`@app/indicators` SHALL expose `computeKeltnerChannelsSeries(highs, lows, closes, options?)` and
`computeKeltnerChannelsObservation(highs, lows, closes, options?)` with defaults `period = 20` and
`atrMultiplier = 1.5`.
1. `middle = rollingMean(closes, period)` (SMA); `atr = computeAtrSeries(highs, lows, closes, period)`
   (Wilder RMA, reused rather than re-implemented); `upper = middle + atrMultiplier × atr`,
   `lower = middle − atrMultiplier × atr`.
2. When the input length is insufficient, the series function SHALL return empty arrays with
   `begIndex = closes.length` and the observation function SHALL throw `IndicatorInputError`.
3. Alignment contract follows the same `out[i] === in[i + begIndex]` rule as all dual-track operators.

#### Scenario: Channels reuse the shared ATR operator

- **WHEN** evaluated on a fixture with `period = 20`
- **THEN** `upper − middle` MUST equal `1.5 × ATR` from `computeAtrSeries` on the same window

#### Scenario: Insufficient input is handled by both views

- **WHEN** the input length is less than `period`
- **THEN** `computeKeltnerChannelsSeries` MUST return empty arrays with `begIndex = closes.length`
- **AND** `computeKeltnerChannelsObservation` MUST throw `IndicatorInputError`
