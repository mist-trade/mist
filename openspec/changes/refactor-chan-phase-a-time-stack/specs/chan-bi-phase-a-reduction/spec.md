## ADDED Requirements

### Requirement: Phase A maintains one chronological Bi stack

Phase A SHALL process complete candidate Bis in one time-ordered stack instead
of splitting them between confirmed and pending collections. Every pair of
neighboring Complete Bis in the Phase A result MUST share the same boundary
index, and no final sort SHALL be required to repair their order.

#### Scenario: Adjacent candidates remain in time order

- **WHEN** Phase A receives candidate Bis built from an alternating fenxing
  sequence
- **THEN** it SHALL push them in ascending fenxing time order
- **AND** every neighboring Complete Bi pair SHALL satisfy
  `previous.endFenxing.middleIndex == current.startFenxing.middleIndex`

#### Scenario: Leading Invalid candidates are retained

- **WHEN** one or more leading Invalid candidate Bis cannot be reduced by the
  three-Bi rule
- **THEN** Phase A SHALL retain them at the beginning of the stack
- **AND** it SHALL pass them to Phase B without clearing or reordering them

#### Scenario: Final unfinished Bi is appended

- **WHEN** source data continues beyond the last Complete Bi fenxing
- **THEN** Phase A SHALL build or extend only the trailing UnComplete Bi
- **AND** the preceding Complete Bi stack SHALL remain in chronological order

### Requirement: Phase A reduces adjacent top-three Bis to a local fixed point

After each candidate push, Phase A SHALL repeatedly inspect only the top three
stack entries. It SHALL reduce those three when at least one is Invalid and the
existing three-Bi merge predicate succeeds, then immediately reconsider the
new stack top.

#### Scenario: One candidate triggers cascading reductions

- **WHEN** a top-three reduction creates a replacement that forms another
  mergeable top-three group with the preceding two stack entries
- **THEN** Phase A SHALL perform the next reduction during the same candidate
  step
- **AND** it SHALL continue until the top three cannot be reduced

#### Scenario: Top three are all Valid

- **WHEN** all three top stack entries are Valid
- **THEN** Phase A SHALL stop local reduction
- **AND** it SHALL preserve all three entries

#### Scenario: Top three contain Invalid but cannot merge

- **WHEN** at least one top stack entry is Invalid and the existing three-Bi
  merge predicate returns false
- **THEN** Phase A SHALL stop local reduction for the current candidate
- **AND** it SHALL retain all three entries for later candidates and Phase B

#### Scenario: Successful reduction is revalidated

- **WHEN** Phase A replaces three stack entries with one merged Bi
- **THEN** it SHALL evaluate the merged Bi with the existing candidate-validity
  predicate before any further reduction
- **AND** the resulting Valid or Invalid status SHALL be used by the next
  top-three decision

### Requirement: Phase A rejects non-contiguous stack input and reduction

Phase A MUST verify index continuity before each candidate push and every
three-Bi reduction. It MUST NOT accept a gap into the stack or merge across a
Complete Bi range already present elsewhere in the stack.

#### Scenario: Incoming candidate does not continue the stack tail

- **WHEN** a Complete candidate's start `middleIndex` differs from the current
  Complete stack tail's end `middleIndex`
- **THEN** Phase A SHALL report an internal invariant failure containing both
  index ranges
- **AND** it SHALL NOT push the discontinuous candidate

#### Scenario: Top-three boundaries are discontinuous

- **WHEN** either `bi1.endFenxing.middleIndex` differs from
  `bi2.startFenxing.middleIndex` or `bi2.endFenxing.middleIndex` differs from
  `bi3.startFenxing.middleIndex`
- **THEN** Phase A SHALL report an internal invariant failure containing the
  offending index ranges
- **AND** it SHALL NOT create a replacement Bi spanning the gap

#### Scenario: Adjacent reduction preserves the outer boundary

- **WHEN** three contiguous stack entries are successfully reduced
- **THEN** the replacement SHALL start at the first entry's start fenxing
- **AND** it SHALL end at the third entry's end fenxing
- **AND** neighboring entries outside the replacement SHALL remain contiguous

### Requirement: Phase B receives the complete Phase A fixed point

Phase B SHALL receive the complete ordered Phase A output, including every
unmergeable Invalid Bi, and SHALL continue to apply its standalone
variable-length invalid-span reduction without a public API change.

#### Scenario: Phase A leaves residual Invalid Bis

- **WHEN** Phase A reaches a local fixed point with one or more Invalid Bis
- **THEN** Phase B SHALL receive those Invalid Bis in the same chronological
  positions
- **AND** it MAY reduce a longer contiguous span under the existing Phase B
  rules

#### Scenario: Consumer requests Bi results

- **WHEN** `BiService.getBi` completes both stages
- **THEN** it SHALL continue returning `{ phaseA, phaseB }`
- **AND** Channel processing SHALL continue consuming Phase B

### Requirement: Real-data regressions protect Phase A stack integrity

The backend test suite SHALL include the complete CSI 300 2024-2025 merged-K
snapshot and SHALL verify Phase A stack integrity before snapshot fixtures are
regenerated for frontend inspection.

#### Scenario: Refactored CSI 300 Phase A is structurally ordered

- **WHEN** the single-stack Phase A implementation processes the full CSI 300
  snapshot
- **THEN** every neighboring Complete Bi pair SHALL be contiguous
- **AND** no valid Complete Bi ranges SHALL overlap
- **AND** Phase A SHALL contain no remaining mergeable adjacent three-Bi group
- **AND** the previous `206 -> 302` / `222 -> 228` overlap witness SHALL be
  absent

#### Scenario: Existing Phase B real-data cases remain stable

- **WHEN** the refactored Phase A feeds the existing October 2024 and May 2025
  Phase B regression fixtures
- **THEN** all six existing `bi-merge-cases` expectations SHALL pass
- **AND** the expected long down and long up Phase B endpoints SHALL remain
  unchanged
