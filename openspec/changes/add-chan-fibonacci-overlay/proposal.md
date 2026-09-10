## Why

In technical analysis and quantitative trading, Fibonacci retracements ($0.236, 0.382, 0.500, 0.618, 0.786$) provide essential reference levels for pullback support and resistance (notably the Golden Pocket $0.500 \sim 0.618$).
Following project standards:
1. **Universal Decoupled Primitive**: Fibonacci computation is implemented as an independent, domain-neutral indicator in `@app/indicators`, completely decoupled from Chan Theory.
2. **Pure Rust SIMD Engine (`nodejs-polars`)**: In accordance with the repo standard recorded in `AGENTS.md`, all rolling window extremes and level derivations are executed strictly via `nodejs-polars` vectorized expressions without JavaScript imperative loops.
3. **Official TradingView Styling**: Visual presentation adopts TradingView's official color palette and translucent fill bands (`rgba(8, 153, 129, 0.12)` for Golden Pocket) rather than unstyled ad-hoc lines.

## What Changes

- **Core Indicators (`libs/indicators`)**:
  - `computeFibonacciSeries(highs, lows, closes, params)`: full rolling series via Polars Rust expressions, aligned to `begIndex`.
  - `computeFibonacciObservation(highs, lows, closes, params)`: trailing scalar observation for live evaluation and Golden Pocket detection.
  - `computeFibonacciLevels(high, low, direction, options)`: pure deterministic levels calculation for static high/low prices.
  - `computeStaticSwingFibonacci(high, low, currentPrice, direction, options)`: pure retracement zone classification on static swings.
  - `TRADINGVIEW_FIB_STYLES`: official TradingView color codes, line styles, and translucent band fills.
- **Factor Plugin (`libs/strategy`)**:
  - `FibonacciRetracementPlugin` (`plugin.technical.fibonacci`, category `TECHNICAL`): evaluates price pullback into Golden Pocket ($0.500 \sim 0.618$) for `BUY` or rebound into resistance for `SELL`, returning structured `FactorOpinion` with rich `evidence`.
  - Registered in `standard-plugins.ts`.
- **Visual Command Layer (`libs/visual-command` & `apps/mist/src/visual`)**:
  - `FibonacciVisualAdapter`: generates TradingView-styled `band` (translucent fills), `line` (dashed/solid levels), and `text` (right-aligned ratio + price labels) commands.
  - Supported via `layers=fibonacci` in `VisualCommandService` and `VisualController`.
- **Frontend Chart Rendering (`mist-fe`)**:
  - `TradingViewChart.tsx`: renders Fibonacci translucent bands, dashed level lines, and right-aligned labels on the canvas overlay.

## Capabilities

### New Capabilities
- `fibonacci-indicator-overlay`: Covers mathematical computation of Fibonacci retracements and extensions via Polars Rust engine; factor plugin evaluation (`plugin.technical.fibonacci`); and TradingView-styled visual command generation (`fibonacci`).

### Modified Capabilities
- `indicators-core`: Add `computeFibonacciSeries`, `computeFibonacciObservation`, `computeFibonacciLevels`, `computeStaticSwingFibonacci` to core indicator primitives.
- `factor-plugin-contract`: Register `plugin.technical.fibonacci` as a standard factor plugin under `TECHNICAL` category.
- `web-visualization`: Add support for `fibonacci` layer visual command generation and TradingView chart rendering.

## Impact

- **Affected Code**:
  - `libs/indicators/src/fibonacci/`: New Polars-based Fibonacci module and unit tests.
  - `libs/strategy/src/factor/plugins/fibonacci.plugin.ts`: New factor plugin.
  - `libs/strategy/src/factor/standard-plugins.ts`: Standard plugin registration.
  - `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts`: Fibonacci visual command generation.
  - `apps/mist/src/visual/`: Visual command layer handling.
  - `mist-fe/app/components/tv-chart/TradingViewChart.tsx`: Canvas rendering of Fibonacci bands, lines, and text.
- **Breaking Changes**: None. Fully additive and backward compatible.
