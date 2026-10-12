# chan-channel-departure-guard Specification

## Purpose
Enforce structural boundaries, central departure extreme guarantees, and third-class buy/sell point verification for central departure strokes in ChanCore lifecycle state machines.

## Requirements

### Requirement: Central Departure Extreme and Third Point Axiom
`ChannelLifecycleEngine` and `CentralStateMachine` SHALL enforce that an aligned candidate departure stroke (`curr`) can only be sealed as a `Complete` central departure stroke if and only if:
1. Subsequent pullback stroke forms an authentic third-class buy or sell point (`pullback.low > ZG` for Up centrals, or `pullback.high < ZD` for Down centrals); OR
2. The departure stroke breaks the global extreme boundary of the central (`curr.high > GG` for Up centrals, or `curr.low < DD` for Down centrals).

#### Scenario: Departure stroke failing both extreme break and 3rd point is not sealed
- **WHEN** a directional departure stroke fails to break the global extreme boundary (`curr.high <= GG` for Up centrals, or `curr.low >= DD` for Down centrals) AND fails to form a third-class buy/sell point
- **THEN** the state machine MUST NOT record or seal the stroke as a `Complete` central departure stroke.

#### Scenario: Bounded series ending requires extreme break
- **WHEN** processing the end of a series or a bounded slice (`!pullback`)
- **THEN** the state machine SHALL NOT seal a departure stroke as `Complete` solely based on breaking the $[ZD, ZG]$ boundary (`hasBrokenOut`), but MUST require that the stroke breaks the global extreme boundary (`breaksExtreme`).

### Requirement: Anti-Leakage Across Higher-Timeframe Boundaries
`ChannelLifecycleEngine` SHALL ensure that sub-level centrals do not cross or absorb strokes belonging to opposing higher-timeframe trends (such as a 30m central absorbing strokes from a daily downward trend).

#### Scenario: Sharp reverse breakdown terminates central extension
- **WHEN** a sub-level central experiences a sharp reverse breakdown that violates the entry stroke origin or pierces opposing boundaries without a valid upward departure
- **THEN** the engine MUST NOT absorb subsequent downward trend strokes as central extensions, but MUST either seal at the best historical extreme candidate or mark the candidate central as collapsed.
