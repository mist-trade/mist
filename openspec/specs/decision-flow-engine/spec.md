# decision-flow-engine Specification

## Purpose
Define the directed rooted tree decision flow engine, combining hierarchical gating (`GuardNode`), conditional routing (`BranchNode`), feature extraction (`ExtractorNode`), localized weighted scoring (`ConsensusNode`), and leaf signals (`TerminalNode`) with full whitebox decision tracing and dual-track parity.
## Requirements
### Requirement: Tree-Structured Decision Flow Execution
Decision flows SHALL be structured as a directed rooted tree composed exclusively of `GuardNode`, `BranchNode`, `ExtractorNode`, and `TerminalNode`, executed top-down without cycles or deadlock possibilities. Unselected branches and failed gates MUST be short-circuited with zero downstream calculation overhead.

- `GuardNode` evaluation SHALL pass strictly when `opinion.action` satisfies `requiredAction` and direction consistency with any upstream inherited action; numeric `minConfidence` gating is physically removed.
- The compilation boundary (`compileStoredDefinitionVersion`) and strategy creation/activation validation (`StrategyDefinitionService`) SHALL enforce strict schema validation with zero legacy JSON compatibility handling: any `DecisionFlowNode` containing `minConfidence` or `type: 'CONSENSUS'` (or any unrecognized node type) MUST fail closed with `StoredDefinitionCompileError('DECISION_FLOW_RULE_INVALID', ...)`.

#### Scenario: Guard node fails and short-circuits subtree
- **WHEN** a `GuardNode` evaluates its required plugin and `opinion.action` does not satisfy `requiredAction` or conflicts with an upstream inherited action
- **THEN** execution MUST NOT traverse `onPass` child nodes
- **AND** if `onFail` is specified, it MUST route to `onFail`; otherwise execution terminates immediately with `status: 'ABORTED'`

#### Scenario: Stored flow with retired minConfidence or CONSENSUS node fails closed
- **WHEN** `compileStoredDefinitionVersion` or `StrategyDefinitionService` validates a `decision_flow` payload containing a `minConfidence` property or a node with `type: 'CONSENSUS'`
- **THEN** compilation MUST fail closed by throwing `StoredDefinitionCompileError` with code `'DECISION_FLOW_RULE_INVALID'`
- **AND** it MUST NOT silently ignore `minConfidence`

#### Scenario: Branch node routes based on attribute predicate
- **WHEN** a `BranchNode` evaluates an attribute key against an expected value (`eq`, `gt`, `lt`, etc.)
- **THEN** execution MUST traverse strictly into the matching branch (`true` or `false`)

### Requirement: Feature Extraction And Shared Blackboard
The decision flow SHALL provide an in-memory blackboard (`context.attributes`) during a single evaluation run. `ExtractorNode`s SHALL compute domain features via designated plugins and export them into the blackboard for consumption by downstream nodes.

#### Scenario: Extractor enriches context attributes
- **WHEN** an `ExtractorNode` executes
- **THEN** its plugin result MUST be stored in `context.attributes` under `exportAttributeKey`
- **AND** subsequent branch predicates and guard nodes MUST be able to read this value

### Requirement: Unified Decision Trace And Whitebox Attribution
Every evaluation SHALL generate an immutable `DecisionTrace` capturing the full execution traversal: visited nodes (`GUARD`, `BRANCH`, `EXTRACTOR`, `TERMINAL`), branch decisions, guard pass/fail outcomes, and plugin evidences, without synthetic `confidence`, `confidenceLevel`, `score`, `threshold`, or `breakdown` fields.

#### Scenario: Trace is emitted for frontend inspection
- **WHEN** a decision flow completes evaluation (whether triggering a signal or aborting)
- **THEN** the returned `DecisionResult` and `DecisionTrace` MUST include node-by-node execution details and omit `confidence` and `confidenceLevel`
- **AND** `DecisionTraceBuilder` summary strings MUST omit `[HIGH/MEDIUM/LOW XX.X%]` prefixes
- **AND** the frontend `DecisionTraceDrawer` MUST render this trace identically for both realtime alerts and backtest events without fabricating fallback confidence scores

### Requirement: Realtime And Backtest Dual-Track Parity
The decision flow engine SHALL execute the identical evaluation logic in both offline backtesting and live tick processing. Given the same bar window and timestamps, the decision flow MUST output byte-for-byte identical decisions and traces.

#### Scenario: Parity test verifies identical execution
- **WHEN** an identical historical slice of bars is fed into backtest executor and realtime evaluation harness
- **THEN** the emitted signals, action opinions, and decision traces MUST match 100%

### Requirement: Isomorphic Exit Plugins And Signal-Layer Virtual Position Context
Exit factor plugins SHALL implement the standard `FactorPlugin` contract with `category: 'EXIT'` and SHALL be discovered and registered identically to entry plugins via `ExternalFactorPluginLoader` and `FactorPluginRegistry`.

- Decision flow `BranchNode`, `GuardNode`, and `TerminalNode` SHALL support `SELL` exit routing (including `position.virtual.state` predicates) and preserve `matchedSignalId` / `badgeText` / `displayTag` attribution in `DecisionTrace`.
- Any virtual position state machine maintained in the signal layer (`VirtualExitPolicyPort` or plugin-side trackers) exists **solely to compute and emit `KernelSignal`s**; it SHALL remain strictly decoupled from trading-engine cash balances, `virtual_fill_events`, and broker execution ledgers.

#### Scenario: External EXIT plugin registers alongside entry plugins
- **WHEN** `ExternalFactorPluginLoader.loadPlugins()` loads a bundle containing `category: 'EXIT'` plugins
- **THEN** those plugins MUST be registered in `FactorPluginRegistry` on equal footing with entry plugins
- **AND** when no external bundle is present, the loader MUST gracefully no-op without breaking open-source CI

### Requirement: Decision Flow Validation Enforces Unique Node IDs And Required Node Fields
The compilation boundary (`validateDecisionFlowTree` and `collectPluginReferences`) SHALL fail closed with `StoredDefinitionCompileError('DECISION_FLOW_RULE_INVALID', ...)` when:
- Any two distinct node objects share the same `node.id` (while permitting intentional shared-reference DAG nodes);
- A `GUARD` or `EXTRACTOR` node lacks a non-empty string `pluginId`, an `EXTRACTOR` lacks a non-empty string `exportAttributeKey`, a `BRANCH` lacks a valid `condition` object (or has an empty string `condition.pluginId`), or a `TERMINAL` has an invalid `action`.
- `collectPluginReferences` SHALL include `BRANCH.condition.pluginId` when declared so context derivation validates every referenced plugin.

#### Scenario: Duplicate node ID across distinct nodes fails closed
- **WHEN** `validateDecisionFlowTree` validates a tree containing two distinct node objects with identical `id`
- **THEN** it MUST throw `StoredDefinitionCompileError` with code `'DECISION_FLOW_RULE_INVALID'`

