# canonical-market-series Specification

## Purpose
Define the single canonical market series per security and period: an ordered, externally
configured splice policy that assembles one continuous read-only series from raw provider rows,
with no spliced rows stored, no provider selection exposed to consumers, and full per-bar origin
provenance.

## ADDED Requirements

### Requirement: Every Security And Period SHALL Have Exactly One Canonical Series

The system SHALL expose one canonical series per `(securityId, period)` to every consumer. The
provider source MUST NOT be a consumer-selectable dimension of any read contract. The canonical
series SHALL be assembled at read time from raw `k` rows and MUST NOT be stored as additional
`k` rows.

#### Scenario: A consumer reads a series
- **WHEN** a consumer requests a security, a period and a time range
- **THEN** it MUST receive one continuous ordered series
- **AND** it MUST NOT supply, select or override a provider source

#### Scenario: Storage is inspected
- **WHEN** the `k` table is inspected after any number of reads
- **THEN** no row representing a spliced or canonical series may exist
- **AND** raw provider rows MUST remain the only persisted bars

### Requirement: The Splice Policy SHALL Be External, Ordered And Versioned

The canonical series SHALL be defined by a splice policy supplied from the private plugin
channel. A policy SHALL contain a version, per-period default segment lists and optional
per-security overrides. A segment list SHALL support an arbitrary number of ordered segments; each segment SHALL declare
a source and MAY declare a `from` (inclusive) and a `before` (exclusive) boundary. Segments MAY
overlap; when they do, the earlier segment in the list SHALL win, and the resolver SHALL normalize
the overlapping ranges into disjoint effective intervals before any read. Only the first segment MAY omit `from` and only the last MAY
omit `before`. The public repository SHALL NOT contain any concrete boundary, provider
precedence or security list.

#### Scenario: A policy with three segments is applied
- **WHEN** a period declares three ordered segments
- **THEN** the resolver MUST read them in order and return one merged series
- **AND** no code change MAY be required to add or remove a segment

#### Scenario: A security overrides a period
- **WHEN** an override exists for the requested security and period
- **THEN** the override segments MUST be used instead of the period default

#### Scenario: Segments overlap
- **WHEN** two segments cover the same timestamps
- **THEN** bars in the overlap MUST come from the earlier segment
- **AND** the later segment MUST be clipped so that no timestamp is served twice

#### Scenario: The policy is invalid
- **WHEN** segments are out of order or reference an unknown source
- **THEN** the policy MUST be rejected before serving any read

### Requirement: Consumers SHALL Not Accept A Source Parameter

Backtest creation, indicator queries, visual command queries and local data sync SHALL NOT accept
a provider source parameter. The storage-level `k.source` column SHALL remain as a provenance
marker for raw rows and MUST NOT be removed.

#### Scenario: A legacy source parameter is submitted
- **WHEN** a caller submits a `source` field to a read contract that no longer defines it
- **THEN** the request MUST NOT select a provider by that value
- **AND** the canonical series MUST be returned regardless

#### Scenario: Raw rows are audited
- **WHEN** the raw `k` rows behind a canonical bar are inspected
- **THEN** each row MUST still expose its provider through `k.source`

### Requirement: Every Returned Bar SHALL Preserve Its Origin

Each bar returned by the canonical resolver SHALL carry the provider source of the raw row it came
from. Persisted strategy results SHALL record that per-bar origin rather than a run-level
provider.

#### Scenario: A signal is persisted
- **WHEN** a backtest or live signal is written for a bar
- **THEN** its `source` MUST equal the bar's raw provider origin
- **AND** it MUST NOT be a generic canonical marker

### Requirement: Cross-Segment Reads SHALL Be Correct And Deterministic

Window loads SHALL walk segments backwards from the requested end time until the required bar
count is collected. Page reads SHALL walk segments forwards from the cursor. The resolver
normalizes every policy into disjoint effective intervals (earlier segment wins), so a timestamp
cursor is sufficient. Reads MUST NOT duplicate bars at a
boundary, MUST NOT skip bars, and MUST remain strictly ascending.

#### Scenario: A prewarm window crosses two boundaries
- **WHEN** the required history spans three segments
- **THEN** the window MUST contain exactly the requested number of bars in ascending order
- **AND** no bar MAY appear twice

#### Scenario: A page ends exactly at a boundary
- **WHEN** a page fills its limit at the last bar of a segment
- **THEN** the next page MUST continue with the first bar of the next segment
- **AND** the cursor MUST advance monotonically

#### Scenario: A period has a data gap between segments
- **WHEN** the requested range covers a gap with no raw rows
- **THEN** the gap MUST appear as missing bars
- **AND** the resolver MUST NOT synthesize or forward-fill bars

### Requirement: Canonical Reads SHALL Fail Explicitly

When no policy, no policy version, or no segment definition exists for the requested period, the
read SHALL fail with an explicit error. The system MUST NOT return an empty series, fall back to
another provider, or silently guess a source.

#### Scenario: The private policy is missing
- **WHEN** a read is attempted without a loadable policy
- **THEN** the request MUST fail with an explicit error
- **AND** it MUST NOT return an empty array as success

#### Scenario: A segment read fails
- **WHEN** reading one segment fails
- **THEN** the whole read MUST fail
- **AND** it MUST NOT continue with the remaining segments

### Requirement: Backtest Runs SHALL Record The Policy Version

A backtest run executed against the canonical series SHALL persist the applied policy version.
Runs created before this capability SHALL retain their original provider value and MUST NOT be
rewritten.

#### Scenario: A canonical run completes
- **WHEN** a run is executed
- **THEN** `data_policy_version` MUST equal the version of the policy used
- **AND** the run's source marker MUST identify it as canonical

#### Scenario: A legacy run is queried
- **WHEN** a run created before this capability is read
- **THEN** its original provider source MUST remain unchanged
- **AND** its empty `data_policy_version` MUST identify the legacy semantics
