## ADDED Requirements

### Requirement: Web Visualization Shall Support TradingView-Styled Fibonacci Visual Layer

The visual command service and chart consumer SHALL support the `'fibonacci'` layer. When requested via `GET /v1/visual/commands?layers=fibonacci`, the engine SHALL compute Fibonacci retracement levels and emit TradingView-styled `band` (translucent fills), `line` (dashed/solid levels), and `text` (right-aligned ratio + price labels) commands.

#### Scenario: Visual commands include Fibonacci levels and translucent bands
- **WHEN** a client requests visual commands with `layers=fibonacci`
- **THEN** the returned payload MUST include 5 `band` commands for translucent color fills and 7 `line` commands for levels
- **AND** the Golden Pocket band between 0.500 and 0.618 MUST use color `'rgba(8, 153, 129, 0.12)'`
