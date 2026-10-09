# chan-central-extension Specification Delta

## MODIFIED Requirements

### Requirement: ChanCore Shall Resolve Channel Central Expansion At Both Levels

`ChanCore.createChannels` (Bi-level) and `ChanCore.createDuanChannels` (Duan-level) SHALL derive
Channels using a sequential confirmation lifecycle state machine:
1. Base Channel formation from valid confirmed units;
2. Extension strictly bounded by Lesson 20 touch-zone condition (`high >= ZD` AND `low <= ZG`);
3. Closure (sealing) triggered by departure with 3rd Buy/Sell-Point confirmation (`low > ZG` or `high < ZD` on callback) or 9-wave extension upgrade (`upgradedLevel: ChannelLevel.Macro`, Duan-level only);
4. Adjacent pairwise central expansion resolution per Lesson 20 Theorem 2 without unbounded transitive collapsing.

The derivation MUST NOT produce multi-month single-channel artifacts in oscillating markets.

#### Scenario: Channel level enlargement via 9-wave accumulation applies only to Duan-level and sets upgradedLevel
- **WHEN** a Duan-level Channel extends continuously without departure for 9 constituent units (3+3+3)
- **THEN** the Channel MUST be marked with `extended: true` AND `upgradedLevel: ChannelLevel.Macro`
- **AND** the Channel MUST NOT be marked with `expanded: true` (it is an extension upgrade of a single central, not an expansion of multiple centrals)
- **AND** Bi-level Channels SHALL NOT trigger 9-unit level enlargement (retaining Bi-level micro purity)
- **AND** it MUST be closed as a completed higher-level Central

#### Scenario: The merged expansion Central carries explicit expanded geometry and preserves absorbed components
- **WHEN** two adjacent same-level Channels are merged as an expansion
- **THEN** the outer bounding Central MUST carry `expanded: true` AND `upgradedLevel: ChannelLevel.Macro` AND `absorbed: false`
- **AND** the constituent participant Channels MUST be preserved in the output with `absorbed: true` AND `expanded: false`
- **AND** absorbed participant Channels MUST NOT generate buy/sell points in downstream spans
