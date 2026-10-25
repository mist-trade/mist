# backtest-runtime Specification Delta

## REMOVED Requirements

### Requirement: Backtest V1 Shall Only Accept TDX And QMT Sources

**Reason**: The backtest runtime must consume the newly imported third-party long-history
sources (`vendor_<slug>`). Restricting the replay source to `tdx | qmt` makes 2005-2026
five-minute and thirty-minute history unreplayable, which is the primary purpose of the vendor
import.

**Migration**: Replaced by "Backtest Shall Accept TDX, QMT And Vendor Sources" below. `ef`
remains unsupported, the single-source-per-run rule is unchanged, and no cross-source query,
merge or fallback is introduced. Existing `tdx` and `qmt` runs are unaffected.

## ADDED Requirements

### Requirement: Backtest Shall Accept TDX, QMT And Vendor Sources

The public Backtest create contract SHALL accept `tdx`, `qmt` and every `vendor_<slug>` value
defined by the `DataSource` enum. `ef` and any value outside that set SHALL remain rejected. The
accepted set SHALL be derived from the enum rather than hand-maintained, so that registering a
new vendor source does not require a DTO change.

Every run SHALL still replay exactly one source: a run MUST NOT query, merge or fall back to
another source, including between two vendors or between a vendor and `qmt`.

#### Scenario: A supported Backtest source is submitted
- **WHEN** `CreateBacktestRunDto.source` is `tdx`, `qmt` or a defined `vendor_<slug>` value
- **THEN** source validation MAY proceed to the remaining request and business validation
- **AND** the HTTP/OpenAPI contract MUST expose the derived accepted set

#### Scenario: A new vendor source is registered
- **WHEN** a new `vendor_<slug>` value is added to the `DataSource` enum and migration
- **THEN** it MUST become selectable for backtests without editing the DTO or the executor
- **AND** no other read path MAY require a per-vendor change

#### Scenario: A vendor source is replayed
- **WHEN** a vendor run is claimed and executed
- **THEN** every replay group MUST read only `k` rows with that exact vendor source value
- **AND** the run MUST NOT read `qmt` or another vendor's bars to extend, fill or splice the series
- **AND** the run result MUST be reported as an independent experiment from runs of other sources

#### Scenario: A run contains multiple target securities
- **WHEN** a valid BacktestRun resolves one or more securities from `targetUniverse`
- **THEN** every replay group MUST use the single required `BacktestRun.source`
- **AND** a target item MUST NOT override or add another source
- **AND** one execution context MUST NOT merge bars from different sources

#### Scenario: The selected source has no bar for a security or time
- **WHEN** the run's selected source has no persisted K for part of the requested replay
- **THEN** Backtest MUST preserve that absence for the selected source
- **AND** it MUST NOT query, merge or fall back to another source

#### Scenario: Provider price-adjustment modes differ
- **WHEN** TDX supplies its configured `front` series, QMT supplies its configured `front_ratio`
  series, and a vendor supplies its delivered series
- **THEN** the strategy engine MUST evaluate each run only within its selected source series
- **AND** it MUST NOT normalize adjustment modes or claim cross-source price equivalence
- **AND** runs using different sources MUST be treated as independent experiments whose results
  need not match

#### Scenario: EF or an unknown source is submitted
- **WHEN** `CreateBacktestRunDto.source` is `ef` or any value outside `tdx | qmt | vendor_<slug>`
- **THEN** DTO validation MUST return actual HTTP `400` with `ApiErrorDto.code=VALIDATION_ERROR`
- **AND** no StrategyVersion query, `BacktestRun` insert or RPC submission MAY occur

#### Scenario: Startup or abnormal data exposes an unsupported pending run
- **WHEN** the runner claims a persisted PENDING run whose source is `ef` or an unknown value
- **THEN** it MUST enter the runner-owned FAILED path with safe class `BACKTEST_SOURCE_UNSUPPORTED`
- **AND** it MUST do so before the first historical page query, provider call or evaluation
- **AND** an existing COMPLETED or FAILED run MUST remain queryable through the existing run-resource contract

#### Scenario: EF scope is inspected
- **WHEN** this change is implemented or released
- **THEN** it MUST NOT add an EF replay reader, quantity profile, provider call, data repair or backfill
- **AND** any further Backtest source family MUST be introduced through focused review
