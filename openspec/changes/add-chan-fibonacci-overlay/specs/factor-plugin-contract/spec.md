## ADDED Requirements

### Requirement: Fibonacci Retracement Factor Plugin Registration and Evaluation

`@app/strategy` SHALL register a factor plugin `FibonacciRetracementPlugin` with ID `'plugin.technical.fibonacci'` under factor category `'TECHNICAL'`. The plugin SHALL evaluate whether the latest price is in the Golden Pocket ($0.500 \sim 0.618$) of the preceding swing, and emit a structured `FactorOpinion` with action (`BUY`, `SELL`, or `NEUTRAL`), confidence score ($0.0 \sim 1.0$), human-readable reason, and structured `evidence`.

#### Scenario: Golden Pocket pullback triggers BUY opinion
- **WHEN** price is within the Golden Pocket ($0.500 \sim 0.618$) of the preceding swing
- **THEN** the plugin MUST return `action: 'BUY'` with high confidence ($\ge 0.75$)
- **AND** the `evidence` MUST include levels, current ratio, and TradingView styles

#### Scenario: Rebound into resistance triggers SELL opinion
- **WHEN** evaluation direction is 'rebound' and price rebounds into the Golden Pocket
- **THEN** the plugin MUST return `action: 'SELL'` with confidence $\ge 0.75$
