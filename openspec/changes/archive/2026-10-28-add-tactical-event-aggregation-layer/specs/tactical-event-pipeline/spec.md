# tactical-event-pipeline Specification

## Purpose
Define the dedicated intermediate Tactical Event Aggregation Layer (`TacticalEventAggregator`) situated between the raw strategy evaluation signal pipeline and downstream execution/notification consumers, providing edge detection for continuous factor states, temporal window consensus for multi-factor phase alignment, tactical cooldown debouncing, and multi-layer frontend visual command segregation.

## ADDED Requirements

### Requirement: Dedicated Tactical Event Aggregation Layer
The system SHALL provide an independent `TacticalEventAggregator` between the raw signal output of `StrategyEvaluationKernel` and downstream consumers (`SimulatedBroker`, `ExecutionRiskArbiter`, `LiveStrategyPersistenceService`, and frontend visualization). The raw signal layer SHALL remain 100% pure without delivery-level suppression or hidden mutation.

#### Scenario: Raw signal purity is preserved
- **WHEN** factor plugins evaluate during strategy execution
- **THEN** `StrategyEvaluationKernel` MUST emit raw `KernelSignal`s reflecting exact mathematical and decision-tree outcomes
- **AND** the kernel MUST NOT suppress, drop, or alter raw signals internally

#### Scenario: Consumers subscribe to tactical events
- **WHEN** real-time alert persistence or backtest execution operates
- **THEN** consumers MUST receive discrete `TacticalEvent`s synthesized by `TacticalEventAggregator`
- **AND** consumers MUST NOT receive un-edge-triggered raw state sprays

---

### Requirement: Edge Detection For Continuous Factor States
`TacticalEventAggregator` SHALL track prior state per plugin. For configured state-based factors (e.g. regime, moving-average trends), it SHALL emit a discrete rising-edge tactical pulse ONLY when the factor state transitions from a non-active state to an active state (`0 -> 1`), and MUST suppress repetitive signals during the sustained active state.

#### Scenario: Sustained bull regime emits only one initial edge event
- **WHEN** a regime plugin emits `action: BUY` continuously across 500 consecutive bars
- **THEN** `TacticalEventAggregator` MUST emit an edge event on the first transition bar
- **AND** it MUST suppress emissions on the subsequent 499 bars while the state remains unchanged

---

### Requirement: Temporal Window Consensus Across Phase-Lagged Factors
`TacticalEventAggregator` SHALL maintain active sliding observation windows to synthesize multi-factor resonance. When a primary trigger factor (e.g. Chan BSP structural pivot) emits, the aggregator SHALL open an observation window of up to $W$ bars. If the required secondary confirmation factors (e.g. volume surge, volatility squeeze fire) occur within the window, the aggregator SHALL synthesize a high-conviction `TacticalEvent`.

#### Scenario: Delayed volume confirmation synthesizes tactical event
- **WHEN** a structural buy trigger occurs at bar $t$
- **AND** a volume-price confirmation signal arrives at bar $t+2$ ($2 \le W$)
- **THEN** `TacticalEventAggregator` MUST synthesize a single `TacticalEvent` at bar $t+2$
- **AND** the synthesized event MUST set `timestamp` to bar $t+2$'s timestamp
- **AND** the synthesized event MUST inherit `pivotTime` and `pivotPrice` from the bar $t$ trigger

#### Scenario: Window expiration silently prunes unconfirmed trigger
- **WHEN** a structural buy trigger occurs at bar $t$
- **AND** no confirmation signal arrives within $W$ bars ($> t+W$)
- **THEN** the observation window MUST expire silently without emitting any tactical event
- **AND** no leftover memory state SHALL contaminate subsequent windows

---

### Requirement: Rate Limiting And Tactical Cooldown
`TacticalEventAggregator` SHALL enforce a configurable tactical cooldown period ($K$ bars) following any emitted `TacticalEvent`. During the active cooldown interval, subsequent entry triggers of the same direction SHALL be suppressed to prevent whipsaw overtrading in choppy consolidation markets.

#### Scenario: Cooldown suppresses rapid whipsaw entries
- **WHEN** an entry `TacticalEvent` is emitted at bar $t$ with cooldown $K = 5$
- **THEN** any subsequent entry triggers occurring between bar $t+1$ and bar $t+5$ MUST be suppressed

---

### Requirement: Dual-Track Parity And Homogeneity Verification
`TacticalEventAggregator` SHALL execute deterministically with 100% byte-for-byte output parity across offline batch backtesting, local simulation replay, and live tick processing given the identical input bar and signal sequence.

#### Scenario: Parity across backtest and realtime evaluation
- **WHEN** an identical bar stream is processed through historical backtest drive and realtime kernel pool
- **THEN** the emitted `TacticalEvent` sequence (timestamps, prices, tags, and evidences) MUST be completely identical
