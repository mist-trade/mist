## Context

The system has unified classic indicators and Alpha time-series primitives on the high-performance `nodejs-polars` Rust engine.
However, it previously lacked a standardized Fibonacci retracement indicator for measuring pullback depth and key psychological support/resistance zones (specifically the Golden Pocket $0.500 \sim 0.618$).

## Goals / Non-Goals

**Goals:**
- **Decoupled Universal Primitive**: Implement Fibonacci calculation as a pure indicator in `@app/indicators` independent of any specific strategy or theory.
- **Pure Polars Rust Engine**: Use `nodejs-polars` expressions (`rollingMax`, `rollingMin`, `sub`, `div`, `when/then/otherwise`) for SIMD-accelerated, zero-JS-loop execution.
- **Series & Observation Dual Contracts**: Expose `computeFibonacciSeries` (TA-Lib aligned `{ begIndex, ... }`) and `computeFibonacciObservation` (trailing scalar).
- **TradingView Official Design**: Adopt TradingView's official color palette and translucent band fills (`rgba(8, 153, 129, 0.12)` for Golden Pocket).
- **Factor Plugin**: Implement `FibonacciRetracementPlugin` (`plugin.technical.fibonacci`, category `TECHNICAL`) returning structured `FactorOpinion` with rich `evidence`.
- **Canvas Rendering**: Render translucent bands and dashed level lines on the chart canvas in `mist-fe`.

**Non-Goals:**
- Fibonacci spiral or fan geometry (horizontal retracement/extension levels only).
- Fibonacci time sequence windows (omitted to focus strictly on price levels per user instruction).

## Decisions

### 1. Vectorized Computation in Polars (Rust SIMD)
- **Choice**: All rolling calculations are expressed via Polars DataFrame expressions in a single query plan.
- **Rationale**: Eliminates JS loops, off-by-one errors, and floating-point drift, complying strictly with the `AGENTS.md` Rust indicator mandate.

### 2. TradingView Official Aesthetics
- **Choice**: Replicate TradingView's official color scheme and translucent fill bands between key levels ($0.236 \sim 0.382$, $0.382 \sim 0.500$, $0.500 \sim 0.618$, $0.618 \sim 0.786$, $0.786 \sim 1.000$).
- **Rationale**: Prevents harsh, raw line drawings and delivers industry-standard visual clarity.

### 3. Decoupled Factor Plugin
- **Choice**: `plugin.technical.fibonacci` belongs to `TECHNICAL` and operates directly on normalized `context.bars`.
- **Rationale**: Keeps factor attribution clean and transparent.
