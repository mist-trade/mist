## ADDED Requirements

### Requirement: VOL And Volume Moving Averages Operator

`@app/indicators` SHALL expose `computeVolumeSeries(volumes, options?)` and
`computeVolumeObservation(volumes, options?)` with defaults `periods = [5, 10, 20]`, computed strictly
via `nodejs-polars` expressions. The output SHALL carry `volumes`, `vma5`, `vma10`, `vma20` and
`volumeRatio`.
1. `vmaN = rollingMean(volumes, N)`; `volumeRatio` SHALL be the **standard 量比 definition realized
   on a bar series**: the current bar's volume over the mean of the **previous five bars** —
   `volume / shift(rollingMean(volumes, 5), 1)` — excluding the current bar, with a `1.0` fallback when
   that previous-five mean is `0`.
2. **Declared scope**: at daily close this definition coincides with the exchange-quoted 量比
   (current volume over the past-5-day average volume). Intraday trading-time normalization (the
   minutes-elapsed-adjusted 量比 that fluctuates during a session) requires trading-calendar
   machinery and is explicitly out of scope of this pure operator.
3. Minimum length 20; below it the series returns empty with `begIndex = input.length` and the
   observation throws `IndicatorInputError`. Alignment follows `out[i] === in[i + begIndex]`.

#### Scenario: Volume ratio and moving averages on a reference series

- **WHEN** a fixed volume fixture is evaluated
- **THEN** `vma5` / `vma10` / `vma20` MUST match the rolling means
- **AND** `volumeRatio` at each aligned position MUST equal `v[t] / mean(v[t−5..t−1])` (the current
  bar over the previous five bars, current bar excluded)

#### Scenario: Zero-average guard

- **WHEN** the previous-five mean evaluates to `0`
- **THEN** `volumeRatio` MUST be `1.0`

### Requirement: OBV Operator

`@app/indicators` SHALL expose `computeObvSeries(closes, volumes)` and
`computeObvObservation(closes, volumes)`.
1. The first bar's OBV SHALL be `0`; for each subsequent bar the OBV changes by `+volume` when
   `close > prevClose`, by `−volume` when `close < prevClose`, and stays unchanged when equal.
2. The cumulative sum SHALL be computed with a single Polars `cumSum`. `begIndex = 0` and the
   observation returns the trailing value.
3. Mismatched input lengths SHALL throw `IndicatorInputError`; empty input returns `{ begIndex: 0, obv: [] }`.

#### Scenario: Sign follows close direction and the first bar is zero

- **WHEN** a fixture with rising, falling and flat closes is evaluated
- **THEN** `obv[0]` MUST be `0`
- **AND** each later increment MUST follow the sign rule above

### Requirement: RPP Operator

`@app/indicators` SHALL expose `computeRppSeries(highs, lows, closes, window)` and
`computeRppObservation(highs, lows, closes, window)` with default `window = 20`:
`rpp = (close − rollingMin(low, W)) / (rollingMax(high, W) − rollingMin(low, W))`.
1. Flat windows (zero range) SHALL evaluate to `0.5`; output SHALL stay within `[0.0, 1.0]`.
2. Alignment contract `out[i] === in[i + begIndex]` with `begIndex = window − 1`.

#### Scenario: Relative position on window extremes

- **WHEN** close sits at the window high, the window low, or the window middle
- **THEN** `rpp` MUST be `1.0`, `0.0` or `0.5` respectively

### Requirement: VWAP Operator With Optional Amount Precision

`@app/indicators` SHALL expose `computeVwapSeries(closes, volumes, options?)` and
`computeVwapObservation(closes, volumes, options?)`.
1. Default semantics: **window-cumulative** volume-weighted average price — the accumulation covers
   the supplied bar window and does NOT reset per trading day. With `options.window` the accumulation
   becomes a rolling window; without it, it accumulates from the first supplied bar. Declared:
   session-reset and anchored VWAP variants are out of scope of this operator.
2. Default weighting source is `close × volume` per bar. When `options.amounts` is supplied (equal
   length), the weighting source SHALL be the exact `amount`, so that `VWAP = Σamount / Σvolume`
   (the true traded average price) rather than the close approximation.
3. Guards: when the accumulated volume is `0`, or the weighted sum is not positive, the value SHALL
   fall back to the latest close (declared safe fallback); output MUST remain finite.
4. Alignment contract `out[i] === in[i + begIndex]`; `begIndex = window − 1` in rolling mode and `0`
   in cumulative mode.

#### Scenario: Exact amount mode

- **WHEN** `amounts` are supplied on a fixture where per-bar `amount / volume` differs from `close`
- **THEN** the result MUST equal `Σamount / Σvolume` and MUST differ from the close×volume result

#### Scenario: Cumulative and rolling modes

- **WHEN** evaluated with and without `options.window`
- **THEN** cumulative mode MUST accumulate from the first bar and rolling mode MUST use trailing
  window sums respectively

### Requirement: ATR Operator With Wilder RMA And Dual-Track Views

`@app/indicators` SHALL expose `computeAtrSeries(highs, lows, closes, period)` and
`computeAtrObservation(highs, lows, closes, period)` with default `period = 14`.
1. `TR = max(high − low, |high − prevClose|, |low − prevClose|)`; smoothing SHALL be Wilder RMA
   (`α = 1 / period`, `adjust = false`, seeded by the first-period SMA), computed entirely in Polars.
2. `computeAtrObservation` SHALL return the trailing scalar of the same computation.
3. Alignment contract `out[i] === in[i + begIndex]`.

#### Scenario: Wilder smoothing on a reference series

- **WHEN** a fixed OHLC fixture is evaluated
- **THEN** ATR values MUST match the Wilder RMA oracle and the observation MUST equal the series tail

### Requirement: TsRank Operator (Polars Vectorized, Dual-Track Views)

`@app/indicators` SHALL expose `computeTsRankSeries(series, window, options?)` and
`computeTsRankObservation(series, window, options?)` computed strictly via Polars expressions, with no
hand-written TypeScript loops.
1. Default output SHALL be the percentile rank of the trailing element normalized to `[0.0, 1.0]` as
   `(averageRank − 1) / (window − 1)` with average-rank tie handling; flat windows evaluate to `0.5`.
   With `options.normalize = false` the raw average rank is returned.
2. Consumers that need the GTJA `pct-rank`口径 (`rank / W ∈ (0,1]`) SHALL convert on the consumer
   side (linear mapping), not by changing this operator's default.
3. `computeTsRankObservation` SHALL return the trailing scalar matching the series tail.

#### Scenario: Percentile rank on a window

- **WHEN** the trailing element is the window maximum, the window minimum, or the window is flat
- **THEN** the normalized rank MUST be `1.0`, `0.0` or `0.5` respectively

#### Scenario: Observation matches series tail

- **WHEN** the observation function is evaluated on the same input
- **THEN** it MUST equal the last value of `computeTsRankSeries`
