## MODIFIED Requirements

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
