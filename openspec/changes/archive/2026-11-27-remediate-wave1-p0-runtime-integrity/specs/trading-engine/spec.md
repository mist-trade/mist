## ADDED Requirements

### Requirement: SimulatedBroker STOP Orders Shall Enforce Slippage Config, Limit-Down Liquidity, Side Validation, And Terminal Cleanup
`SimulatedBroker` STOP order matching SHALL enforce the exact execution realism and lifecycle invariants as market/limit `SELL` orders:
- STOP matching MUST apply the configured `this.slippageRatio` rather than falling back to hardcoded default slippage;
- STOP orders MUST validate `order.side === ORDER_SIDES.SELL`;
- STOP fills triggered on a one-word limit-down bar (`isOneWordLimitDown`) MUST be deferred as `BLOCKED` (`SELL_BLOCKED_LIMIT_DOWN`) and MUST trigger paired `BUY` cancellation (`PAIRED_SELL_BLOCKED_LIMIT_DOWN`) on that bar;
- When `executeFill` returns `null` for an eligible triggered STOP order (e.g. insufficient or T+1 locked shares), the order MUST transition to `REJECTED` with structured reason and be removed from `pendingOrders`.
- `deriveOrderId` SHALL check both `pendingOrders` and historical `orderLog` so distinct orders on the same key never overwrite closed order records.

#### Scenario: One-word limit-down blocks triggered STOP order and cancels paired BUY
- **WHEN** a pending STOP `SELL` order's `stopPrice` triggers on a bar opening at one-word limit-down while a paired `BUY` order exists for the same security
- **THEN** `SimulatedBroker` MUST mark the STOP order `BLOCKED` (`SELL_BLOCKED_LIMIT_DOWN`) and leave shares unsold
- **AND** MUST cancel the paired `BUY` order with reason `PAIRED_SELL_BLOCKED_LIMIT_DOWN`

#### Scenario: Unfillable STOP order transitions cleanly to REJECTED
- **WHEN** a triggered STOP `SELL` order fails `executeFill` due to insufficient unlocked shares
- **THEN** `SimulatedBroker` MUST mark the order `REJECTED` in `orderLog` and delete it from `pendingOrders` so it does not retry indefinitely
