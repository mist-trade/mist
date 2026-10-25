# vendor-market-data-import Specification

## Purpose
TBD - created by archiving change add-vendor-market-data-import. Update Purpose after archive.
## Requirements
### Requirement: Each Vendor Provider SHALL Be A Distinct Source Value

Every third-party provider SHALL be stored under its own `k.source` value following the
`vendor_<slug>` convention (the first provider being `vendor_a`). Bars from different vendors
SHALL coexist without conflict under the `(security_id, source, period, timestamp)` unique key.
Registering an additional provider SHALL require only one `DataSource` enum value and one
migration; the replay, indicator and visualisation read paths MUST NOT require per-provider
changes.

Vendor sources SHALL NOT be collectable: the collector registry, post-close sync and the
realtime subscription allowlist MUST continue to recognise only `ef`, `tdx` and `qmt`.

#### Scenario: A vendor dataset is imported
- **WHEN** a vendor dataset is imported for a security and period
- **THEN** every inserted row MUST carry the provider's own `vendor_<slug>` source value
- **AND** no row MAY be written under `ef`, `tdx` or `qmt`

#### Scenario: Two providers cover the same bar
- **WHEN** `vendor_a` and `vendor_b` both contain a bar for the same security, period and timestamp
- **THEN** both rows MUST be persisted under their own source values
- **AND** neither MAY overwrite the other

#### Scenario: A collection run scans sources
- **WHEN** the post-close sync or realtime subscription paths enumerate data sources
- **THEN** they MUST NOT include any `vendor_*` source
- **AND** no collection job MAY be created for a vendor source

### Requirement: Vendor Import SHALL Preserve Bar-End Semantics And Be Idempotent

Vendor timestamps SHALL be stored unchanged as Beijing wall-clock bar-end timestamps matching the
existing `k` convention (`09:35` denotes `09:30-09:35`, `15:00` denotes `14:55-15:00`). The import
MUST NOT shift, localize or timezone-convert timestamps, and MUST NOT fabricate missing bars.

Re-running the same import MUST converge to the same rows: inserts SHALL be upserts over the
unique key.

#### Scenario: A vendor CSV row is imported
- **WHEN** a row has vendor timestamp `2026-09-30 15:00:00`
- **THEN** `k.timestamp` MUST be `2026-09-30 15:00:00`
- **AND** no ±5 minute offset or timezone conversion MAY be applied

#### Scenario: The same dataset is imported twice
- **WHEN** the same dataset is imported a second time
- **THEN** the row count under that vendor source MUST remain unchanged
- **AND** price, quantity and quality values MUST reflect the latest import

#### Scenario: A trading day is missing bars in the source
- **WHEN** a vendor dataset omits bars for part of a trading day
- **THEN** only the bars present in the source MUST be stored
- **AND** no bar MAY be synthesized or forward-filled

### Requirement: Quality SHALL Be Numeric And Directly Computable

Quality SHALL be expressed as numeric per-field flags rather than descriptive labels. Each bar
SHALL persist `open_valid`, `high_valid`, `low_valid`, `close_valid`, `volume_valid` and
`amount_valid` as `0|1`, plus `volume_scale` and `amount_scale` (default `1`) and
`caliber_epoch` (segment number: comparable within an epoch, not across epochs). No
free-text or growing reason vocabulary SHALL be stored per bar; the numeric flags are the
contract.

The quality row SHALL be stored in `k_quality`, a one-to-one extension of `k` keyed by `k_id`
with `ON DELETE CASCADE`, applicable to every source rather than only vendor sources. Bars
flagged invalid SHALL still be imported and MUST NOT create date gaps.

#### Scenario: A field is known to be wrong
- **WHEN** a bar's high and low are known to be wrong while open and close are correct
- **THEN** the quality row MUST have `high_valid = 0` and `low_valid = 0`
- **AND** `open_valid` and `close_valid` MUST remain `1`
- **AND** the bar MUST still be inserted into `k`

#### Scenario: A quantity caliber is unusable
- **WHEN** a provider's volume or amount is materially wrong and cannot be corrected by a known
  constant factor
- **THEN** the corresponding `volume_valid` or `amount_valid` MUST be `0`
- **AND** the raw `k.volume` / `k.amount` values MUST still be written unchanged

#### Scenario: A caliber changes without invalidating the values
- **WHEN** a provider changes its aggregation basis at a known date but the values remain correct
  within each basis
- **THEN** `caliber_epoch` MUST change at that date
- **AND** the validity flags MUST remain `1`

#### Scenario: An operator computes with quality
- **WHEN** an operator or calculation needs usable values
- **THEN** it MUST be able to obtain them arithmetically, for example
  `volume * volume_valid * volume_scale`
- **AND** it MUST be able to restrict a computation to one caliber segment by `caliber_epoch`
- **AND** it MUST NOT need to parse a descriptive label to do so

### Requirement: Thirty-Minute Vendor Bars SHALL Be Derived By Session-Anchored Six-Bar Chunking

30-minute vendor bars SHALL be derived from the same vendor 5-minute series by chunking each
trading session into ordered groups of six 5-minute bars: a morning sequence ending at `11:30`
and an afternoon sequence ending at `15:00`. A group MAY contain fewer than six bars when the
session is truncated. The derived bar's `timestamp` SHALL equal the last consumed 5-minute bar
timestamp; `open` the first bar's open; `high` the maximum high; `low` the minimum low; `close`
the last bar's close; `volume`/`amount` the group sums. Clock-minute bucketing MUST NOT be used.

#### Scenario: A normal trading day is aggregated
- **WHEN** a day has 48 five-minute bars
- **THEN** exactly 8 thirty-minute bars MUST be emitted
- **AND** the timestamps MUST be `10:00, 10:30, 11:00, 11:30, 13:30, 14:00, 14:30, 15:00`

#### Scenario: A circuit-breaker day is aggregated
- **WHEN** a day ends early (for example 31 bars ending `13:35`, or 6 bars ending `10:00`)
- **THEN** only the truncated groups actually traded MUST be emitted
- **AND** no synthetic bar labelled outside the traded sequence MAY be emitted

#### Scenario: Quality is inherited by a derived bar
- **WHEN** a thirty-minute group is formed
- **THEN** each validity flag MUST be the logical AND of the source bars' flags
- **AND** `caliber_epoch` MUST equal the group's segment
- **AND** `derived_from_period` MUST be `5`
- **AND** `manual_fix` MUST be true if any source bar is manually fixed

### Requirement: Vendor Import SHALL Validate Before Commit And Be Reversible

The import pipeline SHALL validate a dataset before writing to production and SHALL provide a
single-statement rollback. Validation SHALL cover unique and strictly increasing timestamps, OHLC
envelope self-consistency, positive prices, per-day bar-count distribution, daily-close agreement
against an existing authoritative daily series, and a quality-distribution report.

Rollback SHALL be possible by deleting rows for the vendor source only, with quality rows removed
by cascade.

#### Scenario: A dataset fails pre-flight validation
- **WHEN** generated bars contain a duplicate timestamp, a non-positive price, or an OHLC envelope
  violation
- **THEN** the import MUST abort before any production write
- **AND** it MUST report the offending rows

#### Scenario: Post-import reconciliation is executed
- **WHEN** the import completes
- **THEN** row counts, per-day bar distribution, OHLC self-consistency, quality-row count and
  quality distribution MUST be verifiable by SQL against the manifest values

#### Scenario: The import is rolled back
- **WHEN** `DELETE FROM k WHERE source = '<vendor_source>'` is executed
- **THEN** all vendor bars and their `k_quality` rows MUST be removed
- **AND** rows of `ef`, `tdx`, `qmt` and other vendor sources MUST remain unchanged

### Requirement: Local Dev Data Layer SHALL Splice Sources With Explicit Precedence And Cache Parsed Series

The local development data layer (`tools/strategy-dev`) SHALL produce a single strictly
ascending series per `(code, period)` by merging all persisted sources and keeping exactly one
bar per timestamp, using the explicit precedence `qmt > tdx > vendor_* > ef`. Splicing MUST occur
only in the local file cache and MUST NOT write to the database or alter the single-source
backtest contract.

Parsed series SHALL be cached in-process keyed by absolute path with modification-time and size
invalidation.

#### Scenario: Local sync merges vendor and QMT
- **WHEN** the same symbol/period has both a `qmt` and a vendor bar for a timestamp
- **THEN** the emitted JSON MUST contain exactly one bar for that timestamp
- **AND** that bar MUST come from `qmt`

#### Scenario: Vendor extends beyond QMT coverage
- **WHEN** a timestamp exists only under a vendor source
- **THEN** the emitted JSON MUST contain the vendor bar
- **AND** the output sequence MUST remain strictly ascending with no duplicate timestamps

#### Scenario: A series is requested twice
- **WHEN** the same symbol/period is requested again and the backing file is unchanged
- **THEN** the parsed series MUST be served from the in-process cache
- **AND** a changed file MUST invalidate the entry by mtime and size

