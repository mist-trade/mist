## ADDED Requirements

### Requirement: Local Dev Simulation Gateway Shall Isolate External Context Series And Reuse Module Cache
In `tools/strategy-dev/server.ts`:
- `/v1/simulation/start` SHALL assign distinct negative synthetic `securityId` values to external context series (independent of `DEFAULT_DEV_SECURITY_ID`) so `StrategyEvaluationKernel` routes external bars strictly to external windows without polluting the primary symbol's sliding window;
- `visualCommandsCache` for `GET /v1/visual/commands` SHALL live at module scope with bounded eviction rather than being re-instantiated per HTTP request.

#### Scenario: External daily context bars do not enter primary symbol sliding window in simulation start
- **WHEN** `/v1/simulation/start` loads external context bars alongside primary symbol bars
- **THEN** external bars MUST receive negative `securityId` values distinct from the primary `securityId`
- **AND** primary window snapshots MUST contain only bars belonging to the target symbol
