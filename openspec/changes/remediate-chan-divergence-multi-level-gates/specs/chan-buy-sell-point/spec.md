# chan-buy-sell-point Specification Delta

## MODIFIED Requirements

### Requirement: First-Type Points Shall Derive Exclusively From Trend Divergence

A first-type buy point (一买) or sell point (一卖) SHALL be produced for each **trend** divergence
(the divergence of the last Channel of a same-direction Channel chain). Consolidation divergence
(occurring inside a Channel's oscillation) MUST NOT produce a first-type point under any circumstances —
buy/sell points inside a Channel belong exclusively to the second type or central oscillation points.
The direction SHALL be the trend of the leaving unit: a leaving unit trending down produces a
first-type buy point, and a leaving unit trending up produces a first-type sell point.

#### Scenario: A consolidation divergence does not produce a first-type point
- **WHEN** only a consolidation divergence is detected on a Channel, or when sorting candidate divergences
- **THEN** no first-type point MUST be produced from it, and consolidation divergences MUST NOT be consumed
  as fallback or supplemental candidates in `detectFirst`
- **AND** buy/sell points inside the Channel's oscillation MUST be classified as second-type points
  when their structural conditions hold
