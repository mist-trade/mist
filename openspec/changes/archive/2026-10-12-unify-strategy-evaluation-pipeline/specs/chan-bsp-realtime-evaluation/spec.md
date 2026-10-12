## REMOVED Requirements

### Requirement: Chan Bsp Strategies Shall Be A Distinct Strategy Kind With A Declarative Configuration

**Reason**: the standalone `chan_bsp` strategy kind is retired (user decision 2026-09-27). All
buy/sell-point evaluation is unified into the decision flow tree via the `plugin.chan.bsp` factor
plugin; stored chan_bsp definitions are transparently compiled to decision flow trees and new
chan_bsp definitions are rejected. Configuration semantics survive inside the plugin parameters
(units/direction/points).

**Migration**: stored definitions are deactivated by migration 026; compile support remains in
`LegacyStrategyCompiler` for transparent evaluation of historical versions.

### Requirement: Chan Bsp Evaluation Shall Be A Stateless Window To Events Detector

**Reason**: the standalone detector invocation channel in the realtime evaluation service is
removed. The detector itself remains an internal implementation detail of the
`ChanBspFactorPlugin` factor node, which enforces the same stateless window-to-events semantics
plus the frontier confirmation gate.

**Migration**: superseded by `strategy-evaluation-pipeline` "Strategy Evaluation Shall Use A
Single Production Pipeline" and the factor plugin contract.

### Requirement: Chan Bsp Events Shall Carry Confirmation Semantics

**Reason**: confirmation semantics are retained but relocated into the factor plugin and the
dual-timestamp contract (`strategy-dual-timestamp.guard.spec.ts`): trigger semantics live on the
confirming bar, pivot semantics on the structural extremum.

**Migration**: superseded by `strategy-evaluation-pipeline` "Signal Persistence Shall Carry Dual
Timestamps" and the existing dual-timestamp guard.

### Requirement: Chan Bsp Emission Shall Be Incremental With A Monotonic Cursor

**Reason**: incremental emission with a strict monotonic cursor remains mandatory but is owned by
the `ChanBspFactorPlugin` cursor inside the decision flow tree; the standalone
`ChanBspEpisodeCursor` invocation channel is removed from the realtime lane.

**Migration**: the monotonic frontier gate is enforced by the existing
`strategy-dual-timestamp.guard.spec.ts` and the plugin's cursor semantics.

### Requirement: Index Multi-Period Multi-Structure Realtime Evaluation

**Reason**: multi-period/multi-structure realtime evaluation continues to work identically for
decision flow plans (one definition per level); the requirement described the standalone
chan_bsp kind channel which no longer exists.

**Migration**: no behavioral migration; the per-period throttling and candidate shape are
preserved by the single decision path.

### Requirement: Historical K-Line Window Pre-Warming

**Reason**: pre-warming semantics for the evaluation window are owned by the shared window store
and the production bar-driven kernel, not by the standalone chan_bsp channel.

**Migration**: superseded by `strategy-evaluation-pipeline` "Strategy Evaluation Shall Use A
Single Production Pipeline" and the pre-market hydration capability.
