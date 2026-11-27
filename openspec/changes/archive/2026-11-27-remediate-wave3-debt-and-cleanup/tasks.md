# Tasks: Remediate Wave 3 Technical Debt, Dead APIs, Validation Hardening & Schema/Query Optimization

## 1. Dead APIs, Broker Hardening & ETF Coverage
- [x] 1.1 Remove dead `exitRatio`, `calculateExitQuantity`, `getExitRatio`, and `PositionStateMachineOptions` in `libs/strategy/src/position/` and update `position-state-machine.spec.ts` and `surveillance.json`.
- [x] 1.2 Expand `ETF_SECURITY_PATTERN` in `libs/market-data/src/price-limit.util.ts` and tests.
- [x] 1.3 Add `bar.open <= 0` invalid-bar guard, `LIMIT SELL` limitPrice gate, and idempotent day-rollover settlement in `SimulatedBroker.onBar`.

## 2. Kernel, Aggregator, Compiler, Plugin & Simulation Performance/Validation
- [x] 2.1 Optimize `StrategySeriesImputer` (`trim` head-pointer + cached frozen snapshot) and remove spread-based min/max in `period-aggregation.helper.ts`.
- [x] 2.2 Cache compiled DSL plans in `LegacyRuleDslPlugin`, deduplicate bindings in `collectVirtualExitBindings`, and eliminate `O(T^2)` per-frame signal copies in `StrategySimulationSession`.
- [x] 2.3 Harden `validateDecisionFlowTree` (node fields + distinct duplicate ID rejection) and include `BRANCH.condition.pluginId` in `collectPluginReferences`.

## 3. Apps N+1 Elimination, Alert Index Migration & Dev Server Bounds
- [x] 3.1 Batch delivery lookup/save in `AlertFanoutService.run()` and batch current-version loading in `StrategyDefinitionService.findAll()`.
- [x] 3.2 Add `039_add_strategy_alert_event_status_created_index.sql` and matching `@Index` metadata on `StrategyAlertEvent`.
- [x] 3.3 Bound caches/run history via `BoundedLruCache` and call `destroy()` before overwriting existing session IDs in `tools/strategy-dev/server.ts`.

## 4. OpenSpec & Full CI / Downstream Validation
- [x] 4.1 Validate Wave 3 OpenSpec strictly.
- [x] 4.2 Run open-source `typecheck`, `lint:check`, `check:magic`, `ci:contracts`, `test:ci`, loopback HTTP specs, and `tools/strategy-dev` tests.
- [x] 4.3 Remediate downstream external plugin & script debt and verify full `build`, `typecheck`, `test`, and `test:baseline`.
