## REMOVED Requirements

### Requirement: Backtest SHALL Dispatch Evaluation By Run Kind

**Reason**: the backtest executor no longer dispatches by run kind. All runs replay through the
production bar-driven kernel (`StrategySimulationEngine` + decision flow tree); legacy kinds are
compiled to decision flow plans at the compile boundary.

**Migration**: superseded by `strategy-evaluation-pipeline` "Batch Backtest Shall Be Driven By
The Production Bar-Driven Kernel".

### Requirement: Chan Bsp Replay SHALL Evaluate Over The Correction Layer

**Reason**: the standalone chan_bsp replay branch is removed. The correction-layer (imputer)
evaluation semantics are owned by the shared sliding window inside the production kernel, which
the backtest lane now drives directly.

**Migration**: superseded by `strategy-evaluation-pipeline` "Strategy Evaluation Shall Use A
Single Production Pipeline".

### Requirement: Chan Bsp Replay SHALL Emit The Complete Signal Flow

**Reason**: the standalone chan_bsp replay signal flow is removed; buy/sell-point signals are
emitted by the `plugin.chan.bsp` factor node inside the decision flow tree with identical
type semantics (first/second/third buy/sell).

**Migration**: signal types and emission semantics are preserved by the factor plugin and locked
by the existing dual-timestamp guard.

### Requirement: Chan Bsp Backtest Signal Results SHALL Carry Structural Context

**Reason**: structural context persistence is retained but generalized: decision-flow signals
persist `decisionTrace` evidence (including chan bsp structural fields such as point type, unit
level, channel bounds, pivot and trigger timestamps) through the single persistence path.

**Migration**: superseded by `strategy-evaluation-pipeline` "Signal Persistence Shall Carry Dual
Timestamps"; existing `decisionTrace`/`contextSnapshot` JSON columns continue to carry the
evidence.

### Requirement: Chan Bsp Replay SHALL Restrict Periods

**Reason**: the chan_bsp-specific replay period whitelist branch is removed together with the
standalone branch; period validation is owned by the unified plan compilation and validation.

**Migration**: period support follows the unified decision flow plan validation.

### Requirement: Chan Bsp Replay SHALL Skip Quantity Profile Gating

**Reason**: quantity profile gating was already removed repo-wide
(`2026-08-24-remove-quantity-profile-gates`); the requirement only documented the standalone
chan_bsp replay branch which no longer exists.

**Migration**: none; the production kernel has no quantity profile gates.
