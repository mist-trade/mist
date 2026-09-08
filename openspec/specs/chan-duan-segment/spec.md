# chan-duan-segment Specification

## Purpose
Define Duan (段, segment) derivation from Bi via the standard characteristic-sequence method as a pure
ChanCore facade, mirroring the ChanBi output contract without altering existing Chan output.
## Requirements
### Requirement: ChanCore Shall Derive Duan From Bi Via The Standard Characteristic-Sequence Method

ChanCore SHALL expose a stateless `createDuan(bis)` facade that consumes the `ChanBi[]` Phase B sequence returned by
`createBi` (the final Bi sequence, not raw K) and derives Duan (段, segment) using the
standard characteristic-sequence method (缠论 line-segment division). The implementation SHALL follow the orthodox
algorithm: maintain the current segment direction and its characteristic sequence, process characteristic-sequence
inclusion, identify the directional fenxing, and confirm segment termination through the two gap cases (the second
case requiring retrospective confirmation). In accordance with 缠论 65 课公理 ("线段至少由三笔组成。线段的破坏只有一种情况，就是被另一条线段所破坏，不可能被单笔破坏"), a complete Duan MUST consist of at least three constituent Bi (`originBis.length >= 3`, `endIdx - segStartIdx >= 2`), and the engine SHALL NOT finalize single-Bi complete segments.
The semantic change SHALL be released with `ChanCore.algorithmVersion` incrementing `7 → 8`.

#### Scenario: A Duan is derived from Bi
- **WHEN** a caller passes the `ChanBi[]` Phase B sequence returned by `createBi` to `createDuan`
- **THEN** it MUST derive Duan from that final Bi sequence directly (no two-phase envelope)
- **AND** it MUST NOT re-derive Bi from raw K or with a different algorithm than `createBi`
- **AND** the Duan algorithm MUST be the single-pass characteristic-sequence method, NOT the span-merge (`mergeSpans`)
  fixed-point mechanism used by Bi Phase B and Channel

#### Scenario: The characteristic sequence is constructed
- **WHEN** an upward segment is in progress
- **THEN** its characteristic sequence MUST consist of the downward Bi, each element carrying that Bi's high/low
- **WHEN** a downward segment is in progress
- **THEN** its characteristic sequence MUST consist of the upward Bi, each element carrying that Bi's high/low

#### Scenario: Characteristic-sequence inclusion is processed within the segment
- **WHEN** two adjacent characteristic-sequence elements before a candidate turning point have an
  overlapping interval
- **THEN** they MUST be merged using the same directional inclusion rule as K-line containment
- **AND** the post-inclusion sequence (standard characteristic sequence) MUST supply the fenxing's
  first element

#### Scenario: A directional fenxing is identified
- **WHEN** the standard characteristic sequence is evaluated for an upward segment
- **THEN** it MUST consider only top fenxing
- **WHEN** the standard characteristic sequence is evaluated for a downward segment
- **THEN** it MUST consider only bottom fenxing

#### Scenario: The termination fenxing uses the lesson-71 boundary elements
- **WHEN** a candidate turning point (the start of a reverse Bi) is evaluated
- **THEN** the fenxing MUST be checked on three elements: the first element = the last standard
  characteristic-sequence element before the turning point, the second element = the reverse Bi from
  the turning point (raw), and the third element = the next reverse Bi (raw)
- **AND** the first and second elements MUST NOT be merged by inclusion (they are boundary elements
  across the turning point, not elements of the same characteristic sequence)
- **AND** the fenxing MUST require the second element's extremum to be the most extreme of the three
  (bottom fenxing's low lowest for a downward segment, top fenxing's high highest for an upward segment)

#### Scenario: The lesson-71 first-Bi-break rule confirms termination when the first element is missing
- **WHEN** a candidate turning Bi is the first reverse Bi of the current segment (the standard
  characteristic sequence before it is empty — 缠论 71 课「最早破坏那笔就是转折点下来的第一笔」)
- **THEN** termination MUST NOT be evaluated by a fenxing on a missing first element
- **AND** termination MUST be evaluated by the lesson-71 first-Bi-break rule: the turning Bi (转笔, from
  the assumed turning point) counting as the first Bi, once it has extended three or more Bi, the first
  same-direction Bi after the third that breaks the turning Bi's end extremum (破点第一笔的结束位置) MUST
  confirm the current segment ending at the assumed turning point (endIdx = the Bi before the turning Bi)
- **AND** if a segment-direction Bi breaks the turning Bi's start extremum (the assumed turning point
  itself — 先破第一笔的开始位置) first, the current segment MUST continue (the rule is voided)
- **AND** the end/start break competition MUST be resolved in temporal order (the first breaker wins)
  and MAY scan without a bounded horizon (71 课复杂分支「最终还是先破…谁先破…」)

#### Scenario: Candidate turning point with fewer than three bis cannot terminate a complete Duan
- **GIVEN** a segment scan starting from `segStartIdx`
- **WHEN** the algorithm detects a reverse break or candidate turning point, but `endIdx - segStartIdx < 2`
- **THEN** that turning point MUST NOT be finalized as the current segment's complete termination endpoint
- **AND** the current segment MUST continue scanning and extending
- **AND** any Duan emitted as `type: complete, status: valid` MUST contain at least three constituent Bi (`originBis.length >= 3`)

#### Scenario: Termination is confirmed without a gap (first case)
- **WHEN** a characteristic-sequence fenxing forms and its first and second elements have NO gap (their intervals
  overlap)
- **THEN** the segment MUST be confirmed to terminate at the fenxing extremum
- **AND** a new segment of the opposite direction MUST begin

#### Scenario: Termination awaits retrospective confirmation with a gap (second case)
- **WHEN** a characteristic-sequence fenxing forms and its first and second elements HAVE a gap (disjoint intervals)
- **THEN** the segment MUST enter a pending state and MUST NOT be confirmed yet
- **AND** it MUST be confirmed only when the opposite-direction characteristic sequence starting after the fenxing
  extremum also forms its directional fenxing
- **AND** if that opposite-direction confirmation never forms, the segment MUST continue to extend

#### Scenario: An incomplete tail Duan is emitted
- **WHEN** the Bi sequence ends before a segment termination is confirmed (including an unconfirmed pending state)
- **THEN** the tail Duan MUST use `type=uncomplete`, `status=unknown` and `endBi=null`
- **AND** `startBi` MAY be the preceding confirmed Duan endpoint Bi or `null` when no Duan has formed

#### Scenario: Duan numeric and identity comparisons
- **WHEN** ChanCore evaluates Duan geometry, characteristic-sequence intervals, gaps or fenxing extrema
  (including the lesson-71 first-Bi-break end/start break comparisons)
- **THEN** it MUST preserve the existing strict and non-strict JavaScript number comparisons
- **AND** it MUST NOT introduce epsilon equality, rounding, tick normalization or Decimal conversion
- **AND** `volume/amount` MUST NOT participate in Duan decisions

### Requirement: ChanDuan Output Contract Shall Mirror ChanBi

`createDuan` SHALL return a flat `readonly ChanDuan[]` (no phaseA/phaseB envelope) containing the confirmed Duan
sequence. `ChanDuan` SHALL mirror `ChanBi`'s field structure, with endpoint Bi in place of endpoint Fenxing and
constituent Bi in place of constituent raw K. The characteristic sequence and its fenxings are internal algorithm
intermediates and SHALL NOT be exposed as separate result fields.

#### Scenario: A complete Duan is emitted
- **WHEN** `createDuan` emits a complete `ChanDuan`
- **THEN** it MUST contain endpoint `startTime/endTime`, algorithm-derived `high/low`, `trend`, `type`, `status`,
  `independentCount`, ordered identity-deduplicated `originIds`, the constituent `originBis` and both endpoint Bi
  (`startBi`/`endBi`)
- **AND** `originIds` MUST identify the raw K values covered by the constituent Bi
- **AND** `startBi` and `endBi` MUST both be non-null for a complete Duan

#### Scenario: The confirmed Duan list is returned
- **WHEN** `createDuan` completes its characteristic-sequence fenxing detection and gap-case retrospection
- **THEN** it MUST return the confirmed Duan as a flat `ChanDuan[]` in temporal order
- **AND** each Duan MUST be either a confirmed complete Duan or the final uncomplete tail Duan
- **AND** callers MUST NOT need to flatten, merge or select a phase

#### Scenario: An empty Bi sequence is evaluated
- **WHEN** `createDuan` receives an empty `ChanBi[]`
- **THEN** it MUST return `[]`
- **AND** no empty result MUST be represented as a database, contract or algorithm error

### Requirement: Existing Chan Output Shall Remain Unchanged By Duan Introduction

Introducing Duan SHALL NOT alter the output of the existing `mergeK/findFenxings/createBi/createChannels`
facades. `ChannelLevel.Duan` is wired by the Duan-level Channel change (`createDuanChannels`), not by the Duan
change itself. The Duan division algorithm evolves independently through versioned behavior changes
(`ChanCore.algorithmVersion`) that keep the full-output characterization fingerprint in lockstep.

#### Scenario: Existing facades are replayed after Duan introduction
- **WHEN** the same approved ordered input is supplied to `mergeK/findFenxings/createBi/createChannels`
- **THEN** their output MUST equal the pre-Duan full-output fingerprint exactly
- **AND** `ChanCore.algorithmVersion` MUST advance monotonically with each algorithm-behavior change and stay in
  lockstep with the characterization fingerprint

#### Scenario: The Duan-level Channel enum is wired by the Duan-level Channel change
- **WHEN** the Duan-level Channel (段级中枢) change introduces `createDuanChannels`
- **THEN** `ChannelLevel.Duan` MUST be used as the `level` of Duan-level Channels emitted by
  `createDuanChannels`
- **AND** the Bi-level Channel scope requirement (`createChannels` produces `level=bi` only) MUST remain
  unchanged

