# Tasks: Consolidate Same-Direction Signals and Remove Confidence Subsystem

> **Scope Guard**: `libs/indicators/src/risk-performance/risk-performance.ts` (`confidence` for statistical VaR/CVaR quantile) is completely orthogonal and MUST NOT be touched.

## 1. Trading Engine: Same-Direction Consolidation & Idempotency Hardening (`mist/libs/strategy/src/trading/` & `execution/`)

- [x] 1.1 Create `libs/strategy/src/trading/consolidation.ts` with pure helpers:
      - `compareContributorOrder(a, b)` (numeric ascending for positive integer realtime `alertEventId`; otherwise higher `period` first → `definitionId` → `signalType` → `idempotencyKey`);
      - `consolidateGroupByDirection(signals)` splitting into `{ invalidPriceSignals, validExits, validEntries }`;
      - `buildOfflineSignalIdempotencyKey(signal, period)` (`offline-${definitionId}-${period}-${ts}-${signalKind}-${signalType}`).
- [x] 1.2 Physically remove `libs/strategy/src/trading/ordering.ts` (`sellFirstByConfidence`, `GroupOrderingStrategy`) and update `libs/strategy/src/trading/index.ts` exports.
- [x] 1.3 Update `libs/strategy/src/trading/domain.types.ts`:
      - Remove `confidence` and `confidenceLevel` from `AttributedSignal.attribution` (extract `SignalAttribution`);
      - Add `SignalContributor` type and `contributors?: readonly SignalContributor[]` to `TradeInstruction` and `TradeRejection`.
- [x] 1.4 Refactor `TradingEngine.decide` (`libs/strategy/src/trading/engine.ts`):
      - Remove `groupOrdering` dependency from `TradingEngineDeps`;
      - Implement Phase 1 (`EXIT` consolidation → single full exit or single consolidated rejection) followed by Phase 2 (`ENTRY` consolidation → single `SizingStrategy` buy or single consolidated rejection), isolating `INVALID_PRICE` signals individually before consolidation;
      - Populate `contributors` on consolidated instructions and rejections while preserving primary `idempotencyKey` (`ti-${primary.idempotencyKey}`).
- [x] 1.5 Update `libs/strategy/src/trading/manual.ts` (`buildTradingManual`):
      - Remove `[HIGH/MEDIUM/LOW XX.X%]` rendering from `renderInstruction` and `renderRejection`;
      - Render consolidated resonance (`共振(N): ...` + numbered contributor trace chains) when `contributors.length > 1`.
- [x] 1.6 Guard paired `SELL + BUY` under one-word limit-down in `libs/strategy/src/execution/simulated-broker.ts` (`onBar`):
      - When a `SELL` order transitions to `BLOCKED` (or a security already has a `BLOCKED` sell order), cancel any paired `BUY` order for the same security in that bar pass with `PAIRED_SELL_BLOCKED_LIMIT_DOWN`.
- [x] 1.7 Adopt `buildOfflineSignalIdempotencyKey` across `libs/strategy/src/pipeline/run-trading-pipeline.ts`, `apps/backtest/src/backtest-run.executor.ts`, and `tools/strategy-dev/server.ts`, and remove `confidence` / `confidenceLevel` passthroughs.
- [x] 1.8 Update `libs/strategy/src/trading/golden.ts`, strip `confidence` from all 6 existing `__fixtures__/*.json`, add 3 new golden fixtures (`consolidate-multi-entry.json`, `consolidate-multi-exit-then-entry.json`, `consolidate-rejected-group.json`), and update `engine.spec.ts` / `golden.spec.ts` / `simulated-broker.spec.ts` / `run-trading-pipeline.spec.ts`.

## 2. Factor Plugin Contract, Decision Flow & Signal Kernel Cleanup (`mist/libs/strategy/` & `mist/libs/signal/`)

- [x] 2.1 Remove `confidence` from `FactorOpinion` (`libs/strategy/src/factor/factor.types.ts`) and remove `BSP_CONFIDENCE` / `DEFAULT_TECHNICAL_FACTOR_CONFIDENCE` from `libs/strategy/src/strategy.constants.ts`.
- [x] 2.2 Remove `confidence` outputs from all public plugins and virtual-exit layer:
      - `libs/strategy/src/factor/plugins/{chan-bsp,fibonacci,financial-guard,legacy-rule-dsl,northbound-capital,price-defense-exit}.plugin.ts`;
      - `libs/strategy/src/virtual-exit/{virtual-exit.port,price-level-exit.policy}.ts` (`DEFAULT_PRICE_LEVEL_CONFIDENCE` removed);
      - Update all corresponding plugin & virtual-exit specs.
- [x] 2.3 Physically remove `ConsensusNode`, `ConsensusPluginWeight`, `ConsensusVoteBreakdown`, `ConfidenceLevel`, and `GuardNode.minConfidence` from `libs/strategy/src/decision-flow/decision-flow.types.ts` and `decision-flow-evaluator.ts` (delete `case 'CONSENSUS'`, `activeScore`/`currentScore`, `minConfidence` check, and `resolveConfidenceLevel`).
- [x] 2.4 Update `libs/strategy/src/decision-flow/`:
      - `decision-trace-builder.ts`: drop `confidence`/`confidenceLevel`, `[LEVEL XX.X%]` summary prefix, and `CONSENSUS` branch;
      - `legacy-strategy-compiler.ts`: remove `minConfidence` emission;
      - `stored-definition-compiler.ts`: enforce strict fail-closed validation with zero compatibility ignoring — reject any node containing `minConfidence` (`!== undefined`), `type: 'CONSENSUS'`, or unrecognized node types with `StoredDefinitionCompileError('DECISION_FLOW_RULE_INVALID', ...)`; remove `CONSENSUS` traversal from `collectPluginReferences`, `context-prefetch.ts`, and `collect-bindings.ts`.
      - `apps/mist/src/strategy/services/strategy-definition.service.ts`: validate `StrategyKind.DECISION_FLOW` rules on creation and stored-version checks via `compileStoredDefinitionVersion` so `minConfidence` / `CONSENSUS` fail closed with HTTP 400.
- [x] 2.5 Remove `confidence` and `confidenceLevel` from `libs/strategy/src/kernel/{kernel.types,strategy-evaluation-kernel,signal-persistence-mapper}.ts`, `libs/strategy/src/simulation/{strategy-simulation.types,kernel-signal-mapper,standard-simulation-flows}.ts`, and `libs/signal/src/runtime/realtime-strategy-evaluation.service.ts`.
- [x] 2.6 Update all affected decision-flow, kernel, simulation, and parity unit tests (`decision-flow-evaluator.spec.ts`, `decision-flow-parity.spec.ts`, `strategy-evaluation-kernel*.spec.ts`, `signal-persistence-mapper.spec.ts`, `strategy-pipeline-homogeneity.guard.spec.ts`, etc.).

## 3. Database Migration 038 & Backend App Contracts (`mist/deploy/`, `mist/libs/shared-data/`, `mist/apps/`, `mist/tools/`)

- [x] 3.1 Create forward-only migration `deploy/database/migrations/038_drop_signal_confidence_columns.sql` dropping `confidence` and `confidence_level` from `strategy_signals` and `backtest_signal_results`, and disabling any enabled `decision_flow` `strategy_definitions` whose `current_version_id` `rule` JSON still contains `minConfidence` or `CONSENSUS` (preserving immutable `strategy_versions` history while preventing startup compile errors).
- [x] 3.2 Remove `confidence` and `confidenceLevel` columns/fields from:
      - `libs/shared-data/src/entities/{strategy-signal.entity,backtest-signal-result.entity,strategy-signal-parity.interface}.ts`;
      - `apps/mist/src/strategy/vo/{strategy-signal.vo,backtest-signal-result.vo}.ts`;
      - `apps/mist/src/strategy/services/{backtest-run-query.service,strategy-signal.service}.ts`;
      - `apps/signal/src/realtime/live-strategy-persistence.service.ts`;
      - `apps/backtest/src/backtest-run.executor.ts`;
      - `apps/notification/src/delivery/alert-channel-delivery.service.ts` (and attach `contributorKeys` metadata in `VirtualFillEvent.instruction` JSON).
- [x] 3.3 Clean up `tools/strategy-dev/{server.ts,runner.ts,data/presets/pure-chan-bsp.json}` (remove `minConfidence`, `confidence`, hardcoded `confidenceLevel: 'HIGH'`, and runner confidence column).
- [x] 3.4 Update all affected app-level specs (`apps/mist/src/strategy/**/*.spec.ts`, `apps/backtest/**/*.spec.ts`, `apps/signal/**/*.spec.ts`, `apps/notification/**/*.spec.ts`, `apps/test/**/*.spec.ts`).

## 4. Frontend Cleanup (`mist-fe/`)

- [x] 4.1 Remove `confidence` / `confidenceLevel` from `mist-fe/app/api/client.ts` (`StrategySignal`, `StrategyBacktestSignalResult`, `SimulationSignalVo`).
- [x] 4.2 Update `mist-fe/app/backtests/components/BacktestSignalTable.tsx` and `utils/backtest-signal-visual.util.ts` (remove `?? 85.0` fallback, `high_conf` filter, Confidence column, and hardcoded `"HIGH"`).
- [x] 4.3 Update `mist-fe/app/components/DecisionTraceDrawer.tsx` and `mist-fe/app/strategies/StrategiesWorkspace.tsx` (remove `?? 85.0` fallback, confidence badges/columns, and `CONSENSUS` node/vote breakdown UI).
- [x] 4.4 Update `mist-fe/app/strategies/components/DecisionFlowBuilder.tsx` (remove `GUARD` `minConfidence` slider and `CONSENSUS` node template/editor).
- [x] 4.5 Update frontend tests (`ChanDiagnosisDrawer.test.tsx`, `backtest-signal-visual.util.test.ts`, `StrategiesPage.test.tsx`) and verify `pnpm typecheck && pnpm test && pnpm build`.

## 5. Downstream External Plugin Repository Alignment

- [x] 5.1 Remove `confidence` from downstream external plugin bundle `FactorOpinion` mirror interface (`src/types.ts`), all entry/context/exit plugins (`evaluate()` returns, `exit-helpers`, and unused confidence-scoring constants/formulas), and all corresponding plugin unit tests (maintaining structural compatibility with `@app/strategy`).
- [x] 5.2 Remove redundant `minConfidence` fields from all external strategy preset JSONs and virtual-position scenario/policy test fixtures, and remove `confidence` defaults/console printing in local tactical CLI scripts.
- [x] 5.3 Rebuild the external plugin bundle (`dist/index.js`) and run the full external test suite (`typecheck`, `test` including `factor-plugin-compat.spec.ts` and `preset-schema.guard.spec.ts`, and offline `run-pipeline.js` report verification).

## 6. Architecture Hygiene Gate, Documentation & CI Verification

- [x] 6.1 Add static guard test asserting zero production references to `sellFirstByConfidence`, `GroupOrderingStrategy`, `minConfidence`, `ConsensusNode`, `confidenceLevel`, and `BSP_CONFIDENCE` across `mist` (explicitly preserving statistical VaR/CVaR `confidence` in `libs/indicators/src/risk-performance/risk-performance.ts`).
- [x] 6.2 Refresh `tools/audit/baseline-magic-literals.json` if needed and run full CI gates:
      - `mist`: `pnpm typecheck`, `pnpm lint:check`, `pnpm check:magic`, `pnpm test:ci` (coverage floor ≥ 82.72%, all 3 architecture guards PASS);
      - `mist-fe`: `pnpm typecheck`, `pnpm test`, `pnpm build`;
      - `openspec validate consolidate-same-direction-signals-and-remove-confidence --strict`.
- [x] 6.3 Update `AGENTS.md` (workspace root, `mist`, `mist-fe`, downstream repo) migration baseline to `038` (next `039`) and document the retired confidence subsystem & same-direction consolidation invariant.
