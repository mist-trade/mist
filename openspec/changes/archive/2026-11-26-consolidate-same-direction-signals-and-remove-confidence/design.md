# Design: Same-Direction Signal Consolidation & Physical Removal of Confidence Subsystem

## 1. Context & Architectural Principles

This change builds directly on the consolidated two-layer unidirectional architecture (**Signal Layer → Unified Trading Engine**, `openspec/specs/trading-engine/spec.md`) and permanently resolves deferred `Task 10.2` (same-timestamp same-security conflict resolution).

### Guiding Invariants
1. **No Fake Probability Arbitration**: Signals in Mist are deterministic rule/pattern triggers, not calibrated probabilities. The Trading Engine SHALL NOT rank or arbitrate signals using arbitrary numeric `confidence` values.
2. **Exit-First, Same-Direction Consolidation**: Within a `(securityId, effectiveTime)` group under single-security full-position semantics (full exit on `EXIT`, `AllInWithBuffer(0.95)` on `ENTRY`), multiple same-direction signals represent **multi-strategy / multi-period resonance**, not mutually exclusive competitors.
3. **Zero Silent Signal Drops**: Every signal in a `SignalGroupInput` MUST either participate as a contributor in an emitted `TradeInstruction` OR appear explicitly in `TradingDecision.rejections` with a structured `TradeRejectionReason`.
4. **Strict Unidirectional Boundary & Four-Path Isomorphism**: Backtest (`apps/backtest`), realtime (`apps/notification`), local dev gateway (`tools/strategy-dev`), and offline research (`runTradingPipeline`) MUST remain field-for-field identical.
5. **Statistical Parameter Isolation**: `confidence` in `libs/indicators/src/risk-performance/risk-performance.ts` (VaR/CVaR quantile level, e.g. `0.95`) is strictly out of scope and MUST remain untouched.

---

## 2. Trading Engine: Two-Phase Same-Direction Consolidation

### 2.1 Why Consolidation Instead of Sequential Execution or Repeated Buying
- **Why not sequential `EXIT`/`ENTRY` without confidence?**
  - Sequential execution emits 1 instruction for the first signal and rejects identical-direction peers with `NO_POSITION` or `ALREADY_HOLDING`. In the Trading Manual this produces confusing output (`▶ 买入 1000股` immediately followed by `✗ 买入已拒绝：ALREADY_HOLDING` for a resonant strategy at the exact same timestamp) and makes attribution depend on arbitrary DB primary-key / string order.
- **Why not allow repeated same-bar `ENTRY` until cash hits zero?**
  - `AllInWithBuffer(0.95)` reserves a 5% cash buffer for brokerage fees, transfer fees, and Next-Bar Open gap/slippage protection. Allowing a second same-bar `ENTRY` to consume 95% of the remaining 5% destroys that safety cushion, triggers redundant minimum-commission (`5 CNY`) friction, and violates single-`entryTime` T+1 accounting.
- **Why Consolidation works cleanly**:
  - **Phase 1 (`EXIT` bucket)**: Collect all `EXIT` / `RISK_CUT` signals in the group → validate per-signal prerequisites → consolidate all valid exits into **at most one `SELL` instruction** selling 100% of `holdingQuantity` and crediting proceeds to `cashLi`.
  - **Phase 2 (`ENTRY` bucket)**: Using the post-Phase-1 account snapshot (cash released and position cleared if Phase 1 sold), collect all `ENTRY` signals in the group → isolate per-signal invalid prices (`triggerPrice <= 0`) → consolidate all valid entries into **at most one `BUY` instruction** sized once via `SizingStrategy` (`AllInWithBuffer(0.95)`).

### 2.2 Detailed Consolidation Algorithm (`TradingEngine.decide`)

Given `group: SignalGroupInput`, `snapshot: AccountSnapshot`, and optional `macroRegime`:

1. **Partition by Intent** (`resolveIntent(s.signal)`):
   - `exitSignals`: signals with resolved intent `'EXIT'` (covers `'EXIT'`, `'RISK_CUT'`, and `signalKind === 'exit'`).
   - `entrySignals`: signals with resolved intent `'ENTRY'`.
2. **Deterministic Anchor Ordering inside each bucket** (`sortSignalsDeterministically` in `libs/strategy/src/trading/consolidation.ts`, replacing `ordering.ts`):
   - Note: This ordering NEVER drops or demotes a valid peer — ALL valid peers are consolidated as equal `contributors`! It exists solely to ensure deterministic JSON serialization, Trading Manual contributor listing order, primary `idempotencyKey` anchor selection, and deterministic `referencePrice` selection when multi-period signals differ slightly.
   - Comparator (`compareContributorOrder(a, b)`):
     1. If both `idempotencyKey` strings are canonical positive base-10 integers (realtime `alertEventId`), compare **numerically ascending** (`BigInt(a) - BigInt(b)`), eliminating the `"10" < "2"` string lexicographical quirk.
     2. Otherwise (offline synthetic keys), compare by `(triggerPeriod ?? channel?.period ?? 0)` ascending (or descending? Wait: **descending period** puts higher-timeframe anchor first when e.g. `1440` daily and `30m` align at `15:01`, ensuring the primary reference price & anchor come from the canonical higher timeframe), then `definitionId` ascending, then `signalType` lexicographical ascending, then `idempotencyKey` lexicographical ascending.
3. **Per-Signal Price Validation (Before Bucket Consolidation)**:
   - For any signal in `entrySignals` with `yuanToLi(signal.triggerPrice) <= 0n`: emit an individual `TradeRejection` with `reason: 'INVALID_PRICE'` immediately and exclude it from the valid `ENTRY` bucket. (A single corrupted signal with `triggerPrice = 0` MUST NOT poison valid resonant peers in the same group.)
   - For `exitSignals`, if `yuanToLi(signal.triggerPrice) <= 0n`: emit individual `INVALID_PRICE` rejection and exclude from valid `EXIT` bucket (preventing `0`-price assumed fills from corrupting `virtual_fill_events` and cash accounting).
4. **Phase 1 — Consolidated `EXIT` Evaluation** (if `validExits.length > 0`):
   - Primary anchor = `validExits[0]` (after deterministic sort).
   - Run structural account pre-checks once against current `position`:
     - If `position === null` → emit **1 consolidated `TradeRejection`** with `reason: 'NO_POSITION'`, carrying `primary` + `contributors` (all `validExits`).
     - If `isEnteredToday(position, snapshot.tradingDay)` → emit **1 consolidated `TradeRejection`** with `reason: 'T1_FROZEN'`, carrying `primary` + `contributors`.
   - Run `exitRules` against `RuleContext` built from `primary`.
   - If `verdict.action === 'REJECT'` → emit **1 consolidated `TradeRejection`** with `contributors`.
   - If `verdict.action === 'INSTRUCT'` → execute single full-position assumed `SELL` (`sellQty = Math.min(verdict.quantity, position.holdingQuantity)`), credit `cash.li += proceedsLi`, delete/update `positions`, and emit **1 consolidated `TradeInstruction`** with:
     - `idempotencyKey: primary.idempotencyKey`
     - `instructionId: 'ti-' + primary.idempotencyKey`
     - `referencePrice: primary.signal.triggerPrice`
     - `attribution: primary.attribution` (preserved for backward compatibility)
     - `contributors: validExits.map(toSignalContributor)` (length ≥ 1; length > 1 indicates resonance)
     - `reason`: unique joined signal types or primary reason (e.g., if all share `VIRTUAL_EXIT` or distinct types `first_buy + golden_pocket`, see §2.3).
5. **Phase 2 — Consolidated `ENTRY` Evaluation** (if `validEntries.length > 0`):
   - Primary anchor = `validEntries[0]` (after deterministic sort).
   - Run `entryRules` (`entryHoldingGate → entryRegimeGate → entryPriceGate → createEntrySizingRule(sizing)`) once against the **updated post-Phase-1** `position` and `cash.li`.
   - If `verdict.action === 'REJECT'` → emit **1 consolidated `TradeRejection`** with `primary` + `contributors: validEntries`.
   - If `verdict.action === 'INSTRUCT'` → verify `cash.li >= turnoverLi + fees.totalFeesLi` (if insufficient, emit 1 consolidated `INSUFFICIENT_CASH` rejection with `contributors`); otherwise deduct `cash.li`, record `positions.set(...)`, and emit **1 consolidated `TradeInstruction`** carrying `contributors: validEntries.map(toSignalContributor)`.

### 2.3 Domain Type Changes (`libs/strategy/src/trading/domain.types.ts`)

```ts
export interface SignalAttribution {
  readonly strategyName: string;
  readonly periodLabel: string;
  readonly traceChain: string | null;
  // REMOVED: confidence, confidenceLevel
}

export interface SignalContributor {
  readonly idempotencyKey: string;
  readonly signalType: string;
  readonly attribution: SignalAttribution;
}

export interface TradeInstruction {
  readonly instructionId: string;        // `ti-${idempotencyKey}` (primary anchor)
  readonly idempotencyKey: string;       // primary contributor's idempotencyKey
  readonly action: TradeAction;
  readonly quantity: number;
  readonly referencePrice: number;
  readonly estimatedValueLi: Li;
  readonly reason: string;
  readonly attribution: SignalAttribution; // primary contributor attribution
  /** All consolidated signals that triggered this instruction (>=1 for signal-driven, empty/undefined for RISK_SURVEILLANCE). */
  readonly contributors?: readonly SignalContributor[];
  readonly signal?: KernelSignal;
}

export interface TradeRejection {
  readonly idempotencyKey: string;       // primary contributor's idempotencyKey
  readonly signal: AttributedSignal;     // primary signal
  /** Present when multiple valid same-direction signals were rejected together by an account/regime/sizing gate. */
  readonly contributors?: readonly SignalContributor[];
  readonly reason: TradeRejectionReason;
  readonly detail: string;
}
```

- **Zero-DDL `virtual_fill_events` Compatibility**:
  - `primary.idempotencyKey` in realtime is the numerically smallest `alertEvent.id` in the consolidated bucket (a positive integer string).
  - `VirtualFillLogService.append()` continues writing `alert_event_id = primary.idempotencyKey` with ZERO table schema change.
  - `VirtualFillEvent.instruction` JSON payload MAY additionally store `contributorKeys: readonly string[]` and `contributorsSummary: string` for full post-mortem auditability.
  - Sibling-channel concurrent deduplication in `AlertChannelDeliveryService` (`currentAlertEventIds.has(fill.idempotencyKey)`) remains 100% intact because `primary.idempotencyKey` is guaranteed to be a member of `currentAlertEventIds`.
- **`TradingEngineDeps` Cleanup**:
  - Remove `groupOrdering?: GroupOrderingStrategy` from `TradingEngineDeps` and physically delete `libs/strategy/src/trading/ordering.ts` (`sellFirstByConfidence`), replacing it with `libs/strategy/src/trading/consolidation.ts` (`consolidateGroupByDirection` / `compareContributorOrder`).

### 2.4 Trading Manual Rendering (`libs/strategy/src/trading/manual.ts`)
- Remove `[HIGH XX.X%]` suffix completely from both `renderInstruction` and `renderRejection`.
- Single contributor (`contributors.length <= 1`):
  ```text
  ▶ 买入 8,000股 @ 12.50 ≈ 100,000 ｜ 策略A 30m first_buy
      主门禁 ✓ → 买点因子 ✓
  ```
- Multiple consolidated contributors (`contributors.length > 1`, resonance):
  ```text
  ▶ 买入 8,000股 @ 12.50 ≈ 100,000 ｜ 共振(2): 策略A 30m first_buy + 策略B 日线 golden_pocket
      [1] 策略A 30m: 主门禁 ✓ → 买点因子 ✓
      [2] 策略B 日线: 趋势过滤 ✓ → 回撤因子 ✓
  ```
- Consolidated rejection (`contributors.length > 1`):
  ```text
  ✗ 买入已拒绝：ALREADY_HOLDING（虚拟账户已持仓 8,000 股）｜ 共振(2): 策略A 30m first_buy + 策略B 日线 golden_pocket
  ```

---

## 3. Idempotency & Execution Edge-Case Hardening

### 3.1 Fix Offline Synthetic `idempotencyKey` Collision
- **Current defect**: `run-trading-pipeline.ts:236`, `backtest-run.executor.ts:539`, and `tools/strategy-dev/server.ts:995` synthesize `offline-${definitionId}-${signalTime.getTime()}-${signalKind}`. When one definition runs across multiple periods aligning at `15:00`, or emits both a `VIRTUAL_EXIT` and a decision-flow `EXIT` on the same bar, keys collide.
- **Fix**: Extract a single shared helper `buildOfflineSignalIdempotencyKey(signal, period)` in `libs/strategy/src/trading/consolidation.ts`:
  ```ts
  `offline-${signal.definitionId}-${period}-${signal.signalTime.getTime()}-${signal.signalKind}-${signal.signalType}`
  ```
  (If an adapter ever receives two identical tuples from multi-instance evaluation, append an ordinal suffix `-idx` strictly in deterministic traversal order.)

### 3.2 Fix Same-Group `SELL + BUY` Limit-Down (`BLOCKED`) Penetration in `next_bar_open`
- **Current defect**: When a group produces `[SELL, BUY]` and both orders are submitted to `SimulatedBroker` for the next bar, if the next bar opens at one-word limit-down (`isOneWordLimitDown`), `SELL` transitions to `BLOCKED` without releasing cash, while the paired `BUY` in the same `onBar` pass can still execute against residual buffer cash or fail unpredictably.
- **Fix**: In `SimulatedBroker.onBar(bar)` (and verified across `run-trading-pipeline.ts`, `backtest-run.executor.ts`, `tools/strategy-dev/server.ts`):
  - Track blocked sells encountered in the current bar pass (`blockedSellSecurityIds: Set<number>`).
  - If a `SELL` for `securityId` becomes `BLOCKED` (or an existing open order for `securityId` is `BLOCKED`), any queued `BUY` order for the same `securityId` in the same bar pass MUST NOT execute (it is cancelled with reason `PAIRED_SELL_BLOCKED_LIMIT_DOWN`, preventing phantom buys when exit liquidity is frozen).
- **Paired Buy Quantity Alignment**: Ensure `backtest-run.executor.ts` and `tools/strategy-dev/server.ts` stay consistent with `SimulatedBroker` cash/quantity validation when executing paired `SELL → BUY` on Next-Bar Open.

---

## 4. Physical Removal of Confidence, `minConfidence`, and `CONSENSUS`

### 4.1 Decision Flow Engine & Factor Plugin Contracts (`mist/libs/strategy/`)
1. **`FactorOpinion` (`libs/strategy/src/factor/factor.types.ts`)**:
   - Remove `readonly confidence: number;`.
   - Remaining canonical fields: `{ action: FactorAction; reason: string; badgeText?: string; displayTag?: string; styleMeta?: ...; evidence?: ... }`.
   - Remove `BSP_CONFIDENCE` and `DEFAULT_TECHNICAL_FACTOR_CONFIDENCE` from `libs/strategy/src/strategy.constants.ts`.
   - Update all public plugins (`chan-bsp`, `fibonacci`, `financial-guard`, `legacy-rule-dsl`, `northbound-capital`, `price-defense-exit`) and `VirtualExitProposal` / `PriceLevelExitPolicy` to drop `confidence`.
2. **`DecisionFlowNode` & `DecisionFlowEvaluator` (`libs/strategy/src/decision-flow/`)**:
   - Remove `ConsensusNode`, `ConsensusPluginWeight`, `ConsensusVoteBreakdown`, `ConfidenceLevel`, and `GuardNode.minConfidence`.
   - `DecisionFlowNode` becomes `GuardNode | BranchNode | ExtractorNode | TerminalNode`.
   - `GuardNode` evaluation passes strictly on `actionMatches && directionConsistent` (zero numeric threshold check; removes the broken `nextScore = currentScore ?? ...` state completely).
   - Remove `confidence`, `confidenceLevel`, `score`, `threshold`, `breakdown` from `DecisionExecutionTraceItem` and `DecisionResult`.
   - Remove `resolveConfidenceLevel()` from `DecisionFlowEvaluator`.
   - Update `DecisionTraceBuilder`: remove `[LEVEL XX.X%]` prefix and `CONSENSUS` breakdown branch.
   - Remove `case 'CONSENSUS'` branches from `stored-definition-compiler.ts`, `context-prefetch.ts`, `collect-bindings.ts`.
   - **Strict Fail-Closed Validation (Zero Compatibility Handling)**:
     - The compile boundary SHALL NOT silently ignore legacy `minConfidence` residuals or retired `CONSENSUS` nodes.
     - `stored-definition-compiler.ts` MUST recursively validate every `DecisionFlowNode` in the compiled tree and **fail closed** with `StoredDefinitionCompileError('DECISION_FLOW_RULE_INVALID', ...)` if any node still carries `minConfidence` (`minConfidence !== undefined`), has `type === 'CONSENSUS'`, or has any unrecognized node type.
     - `StrategyDefinitionService.validateRuleForCreate` and `validateStoredVersion` (`apps/mist/src/strategy/services/strategy-definition.service.ts`) MUST validate `StrategyKind.DECISION_FLOW` via `compileStoredDefinitionVersion` so creation and activation also fail closed immediately.
3. **Signal Kernel & Persistence Mapping (`libs/strategy/src/kernel/`, `libs/strategy/src/simulation/`, `libs/signal/`)**:
   - Remove `confidence` and `confidenceLevel` from `KernelSignal`, `buildVirtualExitSignal` (eliminating the `0.9` vs `90` bug at the root), `buildSignal`, `decisionTrace` / `contextSnapshot` payloads, `SignalPersistenceMapper`, `SimulationSignal`, `ShadowStrategyCandidate`, and `StrategySignalParityRecord`.
   - Update `tools/strategy-dev/` (`server.ts`, `runner.ts`, `data/presets/pure-chan-bsp.json`) and `standard-simulation-flows.ts` to remove `minConfidence`, `confidence`, and hardcoded `confidenceLevel: 'HIGH'`.

### 4.2 Database Migration (Forward-Only Monotonic Gate)
- Highest existing migration in `mist/deploy/database/migrations/` verified as `037_create_virtual_fill_events.sql`.
- Create **`mist/deploy/database/migrations/038_drop_signal_confidence_columns.sql`**:
  - Drop `confidence` and `confidence_level` from `strategy_signals` and `backtest_signal_results`.
  - Following Migration 026's precedent (preserving immutable `strategy_versions` audit rows rather than mutating historical JSON), set `strategy_definitions.status = 'disabled'` for any definition whose `current_version_id` references a `strategy_versions` row whose `rule` JSON still contains a `minConfidence` key or a `CONSENSUS` node type (`JSON_CONTAINS_PATH(v.rule, 'one', '$**.minConfidence') = 1 OR JSON_SEARCH(v.rule, 'one', 'CONSENSUS', NULL, '$**.type') IS NOT NULL`), preventing `SignalRegistryService` startup failure while letting operators publish clean confidence-free versions:
  ```sql
  -- 038: 物理移除信号置信度列（confidence / confidence_level）并停用含废弃字段的旧策略定义
  -- 交易引擎已收口为先出后进 + 同向归并，决策流移除 minConfidence 与 CONSENSUS，
  -- 编译边界严格 fail-closed（零兼容忽略），历史 strategy_versions 保留不可变审计记录。
  ALTER TABLE `strategy_signals`
    DROP COLUMN `confidence`,
    DROP COLUMN `confidence_level`;

  ALTER TABLE `backtest_signal_results`
    DROP COLUMN `confidence`,
    DROP COLUMN `confidence_level`;

  UPDATE `strategy_definitions` d
  INNER JOIN `strategy_versions` v ON d.`current_version_id` = v.`id`
  SET d.`status` = 'disabled'
  WHERE d.`kind` = 'decision_flow'
    AND d.`status` = 'enabled'
    AND (
      JSON_CONTAINS_PATH(v.`rule`, 'one', '$**.minConfidence') = 1
      OR JSON_SEARCH(v.`rule`, 'one', 'CONSENSUS', NULL, '$**.type') IS NOT NULL
    );
  ```
- **Deploy Sequencing Rule (Production Safeguard)**:
  - Because TypeORM entities (`StrategySignal`, `BacktestSignalResult`) will remove these properties in the same release, **application code MUST stop selecting/writing `confidence` / `confidence_level` before or atomically with Migration 038**; per deployment checklist, execute outside trading hours (after 15:30) and run `038_drop_signal_confidence_columns.sql` cleanly alongside image rollout (or in two-step zero-downtime order: deploy new app image ignoring columns → apply Migration 038).
- Update Entities, VOs & Query Services:
  - `libs/shared-data/src/entities/strategy-signal.entity.ts` & `backtest-signal-result.entity.ts`
  - `apps/mist/src/strategy/vo/strategy-signal.vo.ts` & `backtest-signal-result.vo.ts`
  - `apps/mist/src/strategy/services/backtest-run-query.service.ts` & `strategy-signal.service.ts`
  - `apps/backtest/src/backtest-run.executor.ts`
  - `apps/signal/src/realtime/live-strategy-persistence.service.ts`
  - `apps/notification/src/delivery/alert-channel-delivery.service.ts`

### 4.3 Frontend Cleanup (`mist-fe/`)
- `app/api/client.ts`: remove `confidence` / `confidenceLevel` from `StrategySignal`, `StrategyBacktestSignalResult`, `SimulationSignalVo`.
- `app/backtests/components/BacktestSignalTable.tsx`: remove `?? 85.0` fabrication, remove `high_conf` filter pill, remove Confidence column.
- `app/backtests/utils/backtest-signal-visual.util.ts`: remove `confidence` passthrough and hardcoded `confidenceLevel: "HIGH"`.
- `app/components/DecisionTraceDrawer.tsx`: remove `?? 85.0` fabrication, remove header confidence badge, remove `CONSENSUS` node rendering & vote breakdown UI.
- `app/strategies/StrategiesWorkspace.tsx`: remove `?? 85.0` fabrication and Confidence column.
- `app/strategies/components/DecisionFlowBuilder.tsx`: remove `minConfidence` slider from `GUARD` editor and remove `CONSENSUS` node template/editor.
- Update frontend unit tests (`ChanDiagnosisDrawer.test.tsx`, `backtest-signal-visual.util.test.ts`, `StrategiesPage.test.tsx`).

### 4.4 Downstream External Plugin Repository Alignment
- Any external plugin bundle implementing `FactorPlugin` (loaded via `ExternalFactorPluginLoader`) MUST synchronously update its local `FactorOpinion` mirror interface, plugin return payloads, preset JSON files (`minConfidence` removal), and unit tests, verified via structural compatibility guard specs (`factor-plugin-compat.spec.ts` / `preset-schema.guard.spec.ts`).

---

## 5. Verification, Golden Fixtures & Guardrails

1. **Golden Fixtures (`libs/strategy/src/trading/__fixtures__/`)**:
   - Strip legacy `confidence` input fields from all 6 existing fixture JSONs (`regime-gates`, `rejections`, `round-trip`, `sell-first-buy-same-group`, `surveillance`, `t1-frozen`) and verify all expected outputs remain deterministic.
   - Add 3 new golden fixtures:
     - `consolidate-multi-entry.json`: 2 valid `ENTRY` signals + 1 invalid-price `ENTRY` in the same group → 1 consolidated `BUY` instruction (with 2 `contributors`) + 1 individual `INVALID_PRICE` rejection (zero `ALREADY_HOLDING` noise).
     - `consolidate-multi-exit-then-entry.json`: 2 valid `EXIT` signals + 2 valid `ENTRY` signals in the same group → 1 consolidated `SELL` instruction (2 `contributors`) releasing cash + 1 consolidated `BUY` instruction (2 `contributors`).
     - `consolidate-rejected-group.json`: 2 valid `ENTRY` signals while already holding (or `T1_FROZEN` multi-exit) → 1 consolidated rejection carrying both `contributors`.
2. **Static Hygiene Gate**:
   - Add / extend guard test verifying **zero** production references to `sellFirstByConfidence`, `GroupOrderingStrategy`, `minConfidence`, `ConsensusNode`, `confidenceLevel`, or `BSP_CONFIDENCE` across `mist/libs`, `mist/apps`, `mist/tools`, and `mist-fe/app` (explicitly excluding `libs/indicators/src/risk-performance/risk-performance.ts` statistical VaR/CVaR `confidence`).
3. **Full CI & Parity Regression**:
   - `mist`: `pnpm typecheck`, `pnpm lint:check`, `pnpm test:ci` (all 3 architecture guards + coverage floor ≥ 82.72%), `pnpm check:magic`.
   - `mist-fe`: `pnpm typecheck`, `pnpm test`, `pnpm build`.
   - External plugin bundle repo: full unit tests, schema/compat guards, bundle build, and offline pipeline manual inspection.
