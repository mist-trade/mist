# decision-flow-engine Specification

## Purpose
Define the directed rooted tree decision flow engine, combining hierarchical gating (`GuardNode`), conditional routing (`BranchNode`), feature extraction (`ExtractorNode`), localized weighted scoring (`ConsensusNode`), and leaf signals (`TerminalNode`) with full whitebox decision tracing and dual-track parity.

## Requirements

### Requirement: Tree-Structured Decision Flow Execution
Decision flows SHALL be structured as a directed rooted tree executed top-down without cycles or deadlock possibilities. Unselected branches and failed gates MUST be short-circuited with zero downstream calculation overhead.

#### Scenario: Guard node fails and short-circuits subtree
- **WHEN** a `GuardNode` evaluates its required plugin and the result does not satisfy `requiredAction` or `minConfidence`
- **THEN** execution MUST NOT traverse `onPass` child nodes
- **AND** if `onFail` is specified, it MUST route to `onFail`; otherwise execution terminates immediately with null decision

#### Scenario: Branch node routes based on attribute predicate
- **WHEN** a `BranchNode` evaluates an attribute key against an expected value (`eq`, `gt`, `lt`, etc.)
- **THEN** execution MUST traverse strictly into the matching branch (`true` or `false`)

### Requirement: Feature Extraction And Shared Blackboard
The decision flow SHALL provide an in-memory blackboard (`context.attributes`) during a single evaluation run. `ExtractorNode`s SHALL compute domain features via designated plugins and export them into the blackboard for consumption by downstream nodes.

#### Scenario: Extractor enriches context attributes
- **WHEN** an `ExtractorNode` executes
- **THEN** its plugin result MUST be stored in `context.attributes` under `exportAttributeKey`
- **AND** subsequent branch predicates and consensus nodes MUST be able to read this value

### Requirement: Localized Weighted Consensus Scoring
At branch leaves, `ConsensusNode` SHALL evaluate multiple parallel factor plugins according to assigned weights (summing to 100). If any plugin with `veto: true` votes `SELL`, the final consensus score MUST be forced to zero.

#### Scenario: Consensus scoring calculates weighted score
- **WHEN** all consensus plugins evaluate successfully without veto
- **THEN** the weighted composite score MUST equal the normalized sum of `(weight * confidence)` for `BUY` votes minus `SELL` penalties
- **AND** if composite score meets `minScoreThreshold`, the consensus passes to next node

#### Scenario: Veto plugin overrides consensus score
- **WHEN** a plugin designated with `veto: true` issues a `SELL` opinion
- **THEN** composite score MUST be reduced to 0.0 regardless of other plugins' high scores

### Requirement: Unified Decision Trace And Whitebox Attribution
Every evaluation SHALL generate an immutable `DecisionTrace` capturing the full execution traversal: visited nodes, branch decisions, guard results, consensus breakdowns, and plugin evidences.

#### Scenario: Trace is emitted for frontend inspection
- **WHEN** a decision flow completes evaluation (whether triggering a signal or aborting)
- **THEN** the returned `DecisionTrace` MUST include node-by-node execution details
- **AND** the frontend `DecisionTraceDrawer` MUST render this trace identically for both realtime alerts and backtest events

### Requirement: Realtime And Backtest Dual-Track Parity
The decision flow engine SHALL execute the identical evaluation logic in both offline backtesting and live tick processing. Given the same bar window and timestamps, the decision flow MUST output byte-for-byte identical decisions and traces.

#### Scenario: Parity test verifies identical execution
- **WHEN** an identical historical slice of bars is fed into backtest executor and realtime evaluation harness
- **THEN** the emitted signals, action opinions, confidence scores, and decision traces MUST match 100%
