## 1. Canonical Code Utility

- [x] 1.1 Add a shared `normalizeSecurityCode` utility in `libs/utils` with tests for pure, dotted suffix, and market-prefix stock symbols.
- [x] 1.2 Replace duplicated streaming/aggregator security-code conversion logic with the shared utility.
- [x] 1.3 Update `SecurityService.formatCode` or equivalent security-service boundary code to use canonical normalization.

## 2. Security API and Source Config Semantics

- [x] 2.1 Add tests proving initialize/find/activate/deactivate/source-config operations canonicalize provider-formatted input codes.
- [x] 2.2 Update controller docs and DTO examples so `Security.code` examples use pure internal codes and `formatCode` examples use provider-specific codes.
- [x] 2.3 Change `addSecuritySource` to update an existing `(securityId, source)` row instead of inserting duplicates.
- [x] 2.4 Add tests proving repeated source setup does not create duplicate `SecuritySourceConfig` rows and updates `formatCode`, `priority`, and `enabled`.

## 3. Database Migration and Cleanup

- [x] 3.1 Add an audit query/script for non-canonical `securities.code` rows and duplicate `security_source_configs` rows.
- [x] 3.2 Add a cleanup migration/script that removes exact duplicate `security_source_configs` rows while preserving one row per `(security_id, source)`.
- [x] 3.3 Add a uniqueness constraint or index for `(security_id, source)` after duplicates are cleaned.
- [x] 3.4 Document the manual resolution path for non-identical duplicate source configs or colliding security codes.

## 4. Verification

- [x] 4.1 Run focused security-service, collector, TDX streaming, and utility tests.
- [x] 4.2 Run TypeScript compile checks.
- [x] 4.3 Verify live data after deployment: `GET /security/v1/all`, source config query for `600519`, and one TDX streaming smoke test.
- [x] 4.4 Confirm repeated source setup no longer creates extra rows in production.
