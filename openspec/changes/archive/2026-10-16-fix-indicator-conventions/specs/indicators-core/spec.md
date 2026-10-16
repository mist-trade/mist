## ADDED Requirements

### Requirement: KDJ Indicator Shall Use The Classic SMA(X,3,1) Smoothing Convention

`computeKdjSeries` / `computeKdjObservation` SHALL smooth the raw stochastic value with the classic
Chinese charting convention `SMA(X, N, M)` where `N = 3`, `M = 1` — an exponential weighting with
`α = M / N = 1/3` and `adjust = false`, seeded at the first full-window RSV: `K_t = K_{t−1} + (RSV_t −
K_{t−1}) / 3` with `K_first = RSV_first`, and `D` applying the same recursion over `K`. `J = 3K − 2D`
SHALL remain unchanged. RSV SHALL remain `(close − rollingMin(low, 9)) / (rollingMax(high, 9) −
rollingMin(low, 9)) × 100` with a flat-window fallback of `50`. The simple rolling-mean ("slow
stochastic") smoothing SHALL NOT be used. The warm-up and alignment contract MUST NOT change:
`minRequired = 13`, the first output aligns to the 13th bar (index 12), and `computeKdjObservation`
returns the trailing value of `computeKdjSeries` for identical input. Known residual: warm-up bars are
discarded, so the earliest values intentionally diverge from charting software that evaluates partial
windows; convergence is expected after warm-up.

#### Scenario: KDJ classic smoothing on a reference series

- **WHEN** `computeKdjSeries` evaluates a fixed OHLC fixture
- **THEN** every `K` and `D` value MUST equal the value produced by the SMA(X,3,1) recurrence over the
  full-window RSV sequence as asserted by the in-test reference recurrence oracle
- **AND** `J` MUST equal `3K − 2D`

#### Scenario: KDJ warm-up and alignment contract is preserved

- **WHEN** the input has fewer than 13 bars
- **THEN** the function MUST return empty arrays with `begIndex` equal to the input length
- **AND** with at least 13 bars the first output MUST align to index 12 and
  `computeKdjObservation` MUST equal the trailing series value

#### Scenario: KDJ flat window guard remains

- **WHEN** a window has identical highs and lows (zero range)
- **THEN** RSV MUST evaluate to `50` and the output MUST remain finite

### Requirement: MACD Indicator Conventions Shall Remain TA-Lib Aligned

`computeMacdSeries` SHALL keep the following conventions as stable, declared behaviour: EMA seeded by
the initial period SMA (`computePolarsEma`), `DIF = EMA(12) − EMA(26)`, `signal = EMA(9)` over `DIF`,
and `histogram = DIF − signal` **without** the ×2 terminal scaling. These conventions are frozen by
this requirement: switching to first-value EMA seeding or ×2 histogram scaling is a breaking change to
`indicator.macd.*` strategy field values and requires an explicit spec change.

#### Scenario: MACD histogram convention

- **WHEN** `computeMacdSeries` evaluates any series
- **THEN** `histogram[i]` MUST equal `macd[i] − signal[i]` exactly

#### Scenario: MACD declared conventions are locked by golden values

- **WHEN** the golden fixture series is evaluated
- **THEN** `macd`, `signal` and `histogram` MUST match the recorded golden values produced by the
  SMA-seeded EMA recurrence with `histogram = DIF − DEA`

### Requirement: DMI/ADX Shall Guard Zero True Range Without NaN

`computeAdxSeries` SHALL use Wilder RMA smoothing for TR/DM/DX (consistent with ATR and RSI) and SHALL
guard all zero denominators: when the smoothed true range is `0`, `+DI` and `−DI` MUST evaluate to `0`
(never `NaN` or `Infinity`), and when `+DI + −DI = 0`, `DX` MUST evaluate to `0`. A flat (zero-range)
input window SHALL produce defined finite ADX values (`0`), never `NaN`. `NaN` MUST NOT propagate into
the returned series.

#### Scenario: Flat market produces zero ADX without NaN

- **WHEN** a constant-price input series (zero true range on every bar) is evaluated
- **THEN** every ADX value MUST be the finite number `0`
- **AND** no `NaN` MUST appear in the output

#### Scenario: Normal series unaffected by the guard

- **WHEN** a normal trending series is evaluated
- **THEN** the ADX values MUST match the Wilder RMA golden values (regression guard)
