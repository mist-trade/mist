# chan-divergence Specification Delta

## MODIFIED Requirements

### Requirement: ChanCore Shall Detect Divergence As A Shared Pure Function

ChanCore SHALL expose a stateless `detectDivergences(input)` facade that detects divergence (背驰) as a
shared pure function reusable across Bi-level and Duan-level structures. The input SHALL carry the unit
sequence (Bi or Duan), the Channel sequence (Bi-level or Duan-level) and caller-computed per-unit force values;
ChanCore SHALL NOT compute MACD or any momentum indicator itself. Each unit's force SHALL carry two positive
scalars — directional histogram area (red bars for up, green bars for down, per lesson 24) and absolute
yellow-white-line (DIF) peak (per lesson 25) — and ChanCore SHALL compare them using conjunction hard gates.
Both trend divergence and consolidation divergence SHALL be detected: consolidation divergence compares a
Channel's entering unit with its leaving unit, and trend divergence compares the force of the LAST Channel
of a same-direction Channel chain.

#### Scenario: Force comparison uses strict inequality on both components
- **WHEN** the leaving force is compared to the entering force for any divergence (consolidation or trend)
- **THEN** divergence MUST be reported only when the leaving unit's area AND its peak are BOTH strictly less
  than the entering unit's (`leave.peak < enter.peak && leave.area < enter.area`, strict less-than on each component, no epsilon)
- **AND** when either component equals or exceeds, it MUST NOT be reported as divergence (specifically, when peak is equal or higher, divergence is vetoed regardless of area)

#### Scenario: Trend divergence enforces level-differentiated zero-axis pull-back prerequisite
- **WHEN** a trend divergence candidate is evaluated on a Channel chain
- **THEN** for Bi-level structures (`level === ChannelLevel.Bi` or omitted), the zero-axis retracement prerequisite ($G_1$) SHALL be waived
- **AND** for Duan-level structures (`level === ChannelLevel.Duan` or higher), the last Channel's `difRetracedToZero` evidence MUST NOT be explicitly false (`difRetracedToZero !== false`)
- **WHEN** a Duan-level Channel explicitly has `difRetracedToZero === false` (MACD histogram failed to alternate red and green across the central)
- **THEN** trend divergence MUST NOT be reported for this Channel
