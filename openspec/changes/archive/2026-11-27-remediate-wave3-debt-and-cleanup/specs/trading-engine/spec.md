## ADDED Requirements

### Requirement: Position State Machine Full-Liquidation Alignment And Broker Execution Guards
- `PositionStateMachine` SHALL omit retired partial-exit APIs (`exitRatio`, `calculateExitQuantity`, `getExitRatio`, `PositionStateMachineOptions`), keeping liquidation quantity strictly owned by the unified TradingEngine / Broker execution boundary.
- `SimulatedBroker.onBar` SHALL reject order matching cleanly on non-finite/non-positive `bar.open <= 0`, enforce `bar.open < order.limitPrice` gating for `LIMIT` `SELL` orders (symmetric to `LIMIT` `BUY`), and settle prior un-settled trading day frozen shares idempotently across day transitions.
- `ETF_SECURITY_PATTERN` SHALL include both established and newer SH/SZ ETF code families (`/^(51\d|56\d|58[89]|159)\d{3}$/`).

#### Scenario: LIMIT SELL waits when bar opens below limitPrice and invalid open skips fills
- **WHEN** a `LIMIT` `SELL` order with `limitPrice = 12.0` encounters `bar.open = 11.8` or an invalid bar with `bar.open <= 0`
- **THEN** `SimulatedBroker.onBar` MUST NOT fill the order and MUST keep `PENDING` limits queued while returning `[]` on invalid non-positive bar opens

#### Scenario: Day transition auto-unlocks T+1 frozen shares idempotently
- **WHEN** a position bought on Day 1 advances to a Day 2 bar in `SimulatedBroker.onBar` without prior `settleDayClose(Day 1)`
- **THEN** frozen shares MUST unlock cleanly on Day 2 transition without double-unlocking if `settleDayClose(Day 1)` was already invoked
