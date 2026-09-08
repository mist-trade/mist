# cross-repo-redundancy-pruning Specification

## Purpose
Define the cross-repository redundancy pruning process: candidate classification, contract-preserving deletions, legacy-interface protection and verification before completion.
## Requirements
### Requirement: Candidate Classification
The cleanup process SHALL classify every redundancy candidate before deletion as local-only cleanup, tracked safe removal, tracked migration candidate, or keep-with-rationale.

#### Scenario: Local artifact candidate is discovered
- **WHEN** a candidate is ignored, reproducible, and not referenced by active repository workflows
- **THEN** the cleanup plan records it as local-only cleanup rather than a tracked code change

#### Scenario: Tracked file candidate is discovered
- **WHEN** a candidate is tracked by a child repository
- **THEN** the cleanup plan records reference-search evidence and required verification before removal

### Requirement: Cross-Repository Contract Preservation
The cleanup process SHALL preserve files and scripts that are part of active cross-repository contracts unless a migration path is included in the same plan.

#### Scenario: Fixture duplication appears across backend and frontend
- **WHEN** frontend fixtures or results appear duplicated from backend outputs
- **THEN** the cleanup plan checks sync scripts and frontend imports before marking them removable

#### Scenario: Backend fixture directory contains mixed roles
- **WHEN** `mist/test-data` contains active test fixtures, stale sync docs, and generated-result references
- **THEN** the cleanup plan preserves imported fixtures, classifies unreferenced tracked pattern files separately, and resolves the generated-result path before deleting sync-related files

#### Scenario: Deployment scripts appear duplicated across repositories
- **WHEN** appliance scripts in `mist` overlap with runner scripts in `mist-deploy`
- **THEN** the cleanup plan treats packaged artifact scripts and runner deployment scripts as separate contracts unless the artifact workflow no longer references one side

### Requirement: Legacy Interface Protection
The cleanup process SHALL NOT remove legacy provider routes, compatibility endpoints, or rollback helpers while current tests, deployment scripts, or product code still exercise them.

#### Scenario: Datasource exposes legacy and normalized routes
- **WHEN** `/api/tdx/*` or `/api/qmt/*` routes coexist with `/v1` routes
- **THEN** the cleanup plan preserves the legacy route until tests and consumers no longer require it

#### Scenario: Backend retains a legacy helper
- **WHEN** backend code still calls a legacy datasource helper for a product field such as dividend factors
- **THEN** the cleanup plan treats removal as a migration candidate rather than a safe deletion

### Requirement: Verification Before Completion
The cleanup process SHALL verify each tracked removal with repository-appropriate checks before reporting the cleanup as complete.

#### Scenario: Backend code is removed
- **WHEN** tracked backend TypeScript code is removed
- **THEN** focused Jest or TypeScript checks covering the touched module run successfully or the skipped verification is explicitly reported

#### Scenario: Frontend fixtures or assets are removed
- **WHEN** tracked frontend assets, pages, or fixtures are removed
- **THEN** frontend import search and targeted Jest, lint, or TypeScript checks run successfully or the skipped verification is explicitly reported

#### Scenario: Deployment assumptions change
- **WHEN** Windows Docker deployment or datasource runner scripts are changed
- **THEN** the related PowerShell script tests run successfully or the skipped verification is explicitly reported

#### Scenario: Deep integration harness is changed or removed
- **WHEN** `test-integration/deep-test` scripts, configs, or docs are changed
- **THEN** the cleanup plan either verifies the modernized deep-test command against the current datasource contract or removes the package scripts and docs together with the retired harness

### Requirement: Shared Utility Single Authority
The workspace SHALL enforce single-authority reuse for all foundational domain utilities (timezone, trading day resolution, date formatting, Chan momentum forces calculation, and currency/decimal formatting), prohibiting inline or local reimplementations across backend apps, libs, and frontend components.

#### Scenario: Trading day formatting or previous trading day resolution is needed
- **WHEN** an application component needs to format a trading day as `YYYYMMDD` or resolve a previous trading day with holiday awareness
- **THEN** it MUST invoke `@app/timezone` (`TimezoneService` or `formatTradingDayString`) rather than constructing date strings or lookback loops manually.

#### Scenario: Chan unit momentum forces are computed for buy/sell points
- **WHEN** visual adapter or signal pipeline evaluates momentum forces across Bi or Duan sequences
- **THEN** it MUST invoke the shared `computeChanUnitForces` helper rather than maintaining private MACD area and peak extraction logic.

### Requirement: Over-Engineering and Dead Code Elimination
The workspace SHALL eliminate speculative wrappers, unused DTOs, and orphaned controllers that provide zero production value, adhering to the principle: "If deleting this code preserves full functionality and contracts, delete it."

#### Scenario: Residual persistence DTOs exist without database storage
- **WHEN** CRUD DTOs exist for derived-only computational models (e.g. Chan analysis)
- **THEN** they MUST be removed entirely to prevent confusion.

#### Scenario: Generic fetcher or wrapper is unconsumed in production
- **WHEN** a frontend wrapper (such as `useApi`) is only exercised by its own test suite and not by any business pages
- **THEN** it MUST be pruned in favor of standard direct client calls.

