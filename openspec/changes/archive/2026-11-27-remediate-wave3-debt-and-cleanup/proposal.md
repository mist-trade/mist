# Change: Remediate Wave 3 Technical Debt, Dead APIs, Validation Hardening, Performance & Index Migration

## Why
Final P2/P3 remediation wave across the Mist stack:
1. Remove dead `PositionStateMachine` `exitRatio` / `calculateExitQuantity` / `getExitRatio` APIs and update stale fixture descriptions (`surveillance.json`) so position accounting strictly honors the full-liquidation invariant.
2. Eliminate avoidable per-bar allocations, spread-operator stack hazards, and repeated compilations in `StrategySeriesImputer`, `period-aggregation.helper.ts`, `LegacyRuleDslPlugin`, `collectVirtualExitBindings`, and `StrategySimulationSession`.
3. Harden `DecisionFlow` AST compilation (`validateDecisionFlowTree` node-field checks, unique distinct `node.id` validation, `BRANCH.condition.pluginId` derivation), expand `ETF_SECURITY_PATTERN` to newer SSE/SZSE ETF prefixes (`51x/56x/588/589/159`), and harden `SimulatedBroker.onBar` (`bar.open <= 0`, `LIMIT SELL` price gate, idempotent day-boundary T+1 unlock).
4. Eliminate N+1 queries in `AlertFanoutService.run()` and `StrategyDefinitionService.findAll()`, add the `(status, created_at)` index migration (`039`) for `strategy_alert_events` aligned with `PendingAlertDeliverySweepService.findStranded()`, and bound module-level caches/session replacements in `tools/strategy-dev/server.ts`.

## What Changes
- **Trading Engine & Execution**: remove `exitRatio` / `calculateExitQuantity` / `getExitRatio` / `PositionStateMachineOptions`; update `surveillance.json` label; expand `ETF_SECURITY_PATTERN` in `price-limit.util.ts`; guard `bar.open <= 0`, `LIMIT SELL` limitPrice, and idempotent day-rollover settlement in `SimulatedBroker.onBar`.
- **Decision Flow & Evaluation Performance**: harden `validateDecisionFlowTree` & `collectPluginReferences`; add O(1) head-pointer trim and frozen-snapshot caching to `StrategySeriesImputer`; loop `reduceSlot`/`reduceDaily` min/max without spread overflow; cache compiled DSL plans in `LegacyRuleDslPlugin`; deduplicate `collectVirtualExitBindings`; store `O(T)` signal counts instead of `O(T^2)` copies in `StrategySimulationSession`.
- **Apps, Schema & Dev Gateway**: batch `deliveries` lookup/save in `AlertFanoutService` and `versions` lookup in `StrategyDefinitionService.findAll()`; add migration `039_add_strategy_alert_event_status_created_index.sql` + `@Index` on `StrategyAlertEvent`; bound caches/run history and destroy replaced sessions in `tools/strategy-dev/server.ts`.

## Impact
- Affected specs: `trading-engine`, `decision-flow-engine`, `strategy-evaluation-pipeline`, `database-schema-safety`, `strategy-notification-delivery`, `dev-backtest-api`
- Downstream verification includes both open-source CI and external proprietary plugin test & baseline gates.
