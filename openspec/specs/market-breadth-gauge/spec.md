# market-breadth-gauge Specification Delta

## ADDED Requirements

### Requirement: Dual-Track Authentic CYS13 Vectorized Operators (Stock vs Index)
The `libs/indicators` module SHALL provide pure mathematical functions covering both individual stocks and broad-market indices via Rust `nodejs-polars` SIMD expressions:
1. **Stock CYS13 (`computeStockCycSeries` / `computeStockCysSeries`)**:
   $$\text{StockCYC}_N = \frac{\text{EMA}(\text{amount}, N)}{\text{EMA}(\text{volume}, N)} \times \text{unitScale}$$
   $$\text{StockCYS}_N = 100 \times \frac{\text{close} - \text{StockCYC}_N}{\text{StockCYC}_N}$$
   Where `unitScale` is `1.0` if volume is in shares, or `0.01` if volume is in lots (手).
2. **Index CYS13 (`computeIndexCycSeries` / `computeIndexCysSeries`)**:
   Following authentic TongDaXin/Compass index standards where index close is in points while turnover/volume is in average share price:
   $$\text{TP}_t = \frac{\text{high}_t + \text{low}_t + \text{close}_t}{3}$$
   $$\text{IndexCYC}_N = \text{EMA}(\text{TP}, N)$$
   $$\text{IndexCYS}_N = 100 \times \frac{\text{close} - \text{IndexCYC}_N}{\text{IndexCYC}_N}$$
   Where $\alpha = \frac{2}{N + 1}$.

Both sets of operators SHALL be side-effect-free, strictly decoupled from NestJS, TypeORM, Redis, and I/O, conforming to the dual-track API contract (series with `begIndex` and trailing observation scalar).

#### Scenario: Index CYS13 computation for SSE Composite and Market Average
- **WHEN** valid non-zero `highs`, `lows`, and `closes` arrays for an index (e.g. `000001` or `880003`) are provided with period $N = 13$
- **THEN** `computeIndexCycSeries` MUST return an array of cost values representing the 13-period EMA of typical price
- **AND** `computeIndexCysSeries` MUST return the percentage divergence:
  $$100 \times \frac{\text{close} - \text{cyc}}{\text{cyc}}$$
- **AND** on historical extreme benchmark days (e.g. 2015-08-25), `computeIndexCysSeries` MUST match TongDaXin native formula values within absolute error $\le 0.001\%$.

#### Scenario: Market Divergence Spread (Index vs Broad Market Breadth)
- **WHEN** `indexCys` (from `000001` or `000300`) and `marketAvgCys` (from `880003`) are provided
- **THEN** the spread operator `computeMarketDivergenceSpread` MUST return:
  $$\text{spread} = \text{indexCys} - \text{marketAvgCys}$$
- **AND** on 2024-02-04 (microcap crash / snowball knock-in), the spread MUST be positive and $\ge +9.0\%$ (indicating severe index masking of underlying small-cap liquidation).

---

### Requirement: Authentic CYC and CYS Vectorized Operator in libs/indicators
The `libs/indicators` module SHALL provide pure mathematical functions `computeCycSeries` and `computeCysSeries` implemented via Rust `nodejs-polars` SIMD expressions. The computation SHALL follow the authentic volume-weighted exponential moving average formula:
$$\text{CYC}_N = \frac{\text{EMA}(\text{amount}, N)}{\text{EMA}(\text{volume}, N)}$$
$$\text{CYS}_N = 100 \times \frac{\text{close} - \text{CYC}_N}{\text{CYC}_N}$$
The functions MUST be side-effect-free, strictly decoupled from NestJS, TypeORM, Redis, and file I/O, conforming to the dual-track API contract (`computeCycSeries` returning series with `begIndex`, and `computeCycObservation` returning the latest tail scalar).

#### Scenario: Normal price and volume series produces valid CYC and CYS
- **WHEN** valid non-zero `close`, `amount`, and `volume` arrays are provided with period $N = 13$
- **THEN** `computeCycSeries` MUST return an array of cost values representing the volume-weighted EMA
- **AND** `computeCysSeries` MUST return the percentage divergence of `close` from `cyc`
- **AND** for indices where $i < \text{begIndex}$, the values MUST be marked undefined or padded consistently with TA-Lib standards

#### Scenario: Zero volume on suspension days preserves previous cost
- **WHEN** an asset has one or more suspension trading days with `volume == 0` and `amount == 0`
- **THEN** `computeCycSeries` MUST NOT produce `NaN` or divide-by-zero errors
- **AND** it MUST smoothly propagate the previous day's cost value

---

### Requirement: Cross-Sectional Market Breadth Calculation
The `libs/indicators` module SHALL provide a cross-sectional market breadth aggregator `computeMarketBreadth` that calculates the percentage of active trading stocks meeting a given threshold condition across all A-shares.

#### Scenario: CYS13 oversold breadth calculation
- **WHEN** an array of current-day CYS13 scalar observations across all active A-share stocks is provided
- **THEN** `computeMarketBreadth` MUST calculate the ratio:
  $$\text{ratio} = \frac{\sum \mathbb{I}(\text{CYS13}_i < \text{threshold})}{\text{totalValid}}$$
- **AND** with default `threshold = -12.0`, it MUST return a scalar between `0.0000` and `1.0000`

---

### Requirement: Scheduled Macro Breadth Ingestion and Storage
The `apps/schedule` module SHALL schedule a daily post-market aggregation job at 21:30 (with a 06:00 retry fallback on trading days verified by `TimezoneService.isTradingDay`). The job SHALL fetch closing prices and amounts, compute the cross-sectional CYS13 oversold breadth and MA250 breadth, persist the daily row into the `market_macro_indicators` MySQL table, and refresh the latest snapshot in Redis at `mist:market:macro:latest`.

#### Scenario: Successful post-market ingestion on a trading day
- **WHEN** the cron triggers on a valid trading day at 21:30
- **THEN** the service MUST fetch the latest daily snapshot for all active stocks from `mist-datasource`
- **AND** it MUST compute `breadth_cys13_oversold_ratio` and `breadth_above_ma250_ratio` in under 20ms using Polars
- **AND** it MUST atomically insert or update the record for `trading_date` in `market_macro_indicators`
- **AND** it MUST update Redis `HSET mist:market:macro:latest` with TTL of 7 days

#### Scenario: Silent skip on non-trading days
- **WHEN** the cron triggers on a weekend or public holiday
- **THEN** `TimezoneService.isTradingDay` MUST evaluate to false
- **AND** the job MUST exit immediately without querying data sources or writing to the database

---

### Requirement: Two-Tier Parity Reconciliation Gate
All implementations of `CYC13` and `CYS13` SHALL undergo strict two-tier parity verification before delivery:
1. Single-asset parity: `CYC13` and `CYS13` series computed on golden fixtures (600519 and 000001) MUST match authentic TongDaXin exported series with absolute error $\le 0.001\%$.
2. Cross-sectional parity: The aggregated oversold breadth on historical extreme benchmark dates (including 2024-02-05 and 2024-09-18) MUST match iWenCai historical ground-truth counts within a tolerance of $\pm 1.0\%$.

#### Scenario: Single-asset parity assertion against TongDaXin fixture
- **WHEN** the single-asset parity test is executed against the golden fixture
- **THEN** the absolute difference $| \text{CYS13}_{\text{computed}} - \text{CYS13}_{\text{TDX}} |$ MUST be $\le 0.001$ for all bars after pre-warm

#### Scenario: Cross-sectional breadth parity assertion
- **WHEN** running historical cross-sectional reconciliation for 2024-02-05
- **THEN** the computed `breadth_cys13_oversold_ratio` MUST fall strictly within $[64.0\%, 66.5\%]$ matching the historical capitulation benchmark
