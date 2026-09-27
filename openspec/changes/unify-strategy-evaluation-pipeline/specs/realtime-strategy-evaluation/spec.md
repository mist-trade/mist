## MODIFIED Requirements

### Requirement: Realtime Evaluation Shall Dispatch By Plan Kind

`RealtimeStrategyEvaluationService.evaluate` SHALL evaluate each eligible execution plan through
the single decision flow path. Plans compiled from legacy kinds (`rule_dsl`, `chan_bsp`) arrive
already compiled to decision flow trees at the compile boundary; the evaluation layer SHALL NOT
branch on legacy kinds. All kinds SHALL produce the shared `ShadowStrategyCandidate` shape, so
episode activation, persistence and delivery remain kind-agnostic. The evaluation level SHALL come
from the plan's period (the single configured level); evaluation SHALL run only when a bar of that
period is emitted, preserving the existing period-based throttling.

#### Scenario: An eligible rule_dsl plan is evaluated
- **WHEN** a bar is emitted for a plan compiled from a legacy `rule_dsl` definition
- **THEN** it MUST be evaluated through the decision flow tree produced by the shared compile
  helper
- **AND** the existing field/operator evaluation semantics MUST be unchanged inside the compiled
  guard

#### Scenario: An eligible chan_bsp plan is evaluated
- **WHEN** a bar is emitted for a plan compiled from a legacy `chan_bsp` definition and the
  projected window satisfies the plan's window budget
- **THEN** the `plugin.chan.bsp` factor plugin MUST be evaluated over the projected window inside
  the decision flow tree
- **AND** confirmed points MUST be mapped to candidates with the shared candidate shape
- **AND** `signalKind` MUST be derived from the point type (buy → `entry`, sell → `exit`)
- **AND** the candidate's context snapshot MUST carry the point type, unit level, confirmation
  time, price and related channel bounds

#### Scenario: A chan_bsp plan has an insufficient window
- **WHEN** the projected window is shorter than the plan's window budget
- **THEN** the plan MUST be evaluated as not matched (no candidate)
- **AND** it MUST NOT fail the job or be classified as evaluation `unavailable`

## REMOVED Requirements

### Requirement: Chan Bsp Candidates Shall Persist Through The Shared Candidate Pipeline

**Reason**: the standalone `chan_bsp` kind no longer exists at runtime; candidates from all
definitions flow through the single decision path and persist through the shared candidate
pipeline. The persistence requirement is superseded by
`strategy-evaluation-pipeline` "Signal Persistence Shall Carry Dual Timestamps" and the existing
shared candidate persistence requirements.

**Migration**: no behavioral migration; persistence continues through
`LiveStrategyPersistenceService` with the addition of the `pivot_time` column.
