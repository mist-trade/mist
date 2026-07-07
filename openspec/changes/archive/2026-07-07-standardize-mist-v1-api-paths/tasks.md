# Tasks: Standardize Mist v1 API paths

## 1. Route Contract Tests

- [x] 1.1 Add or update backend tests that inspect controller route metadata
      for preferred `/v1/securities`, `/v1/security-sources`,
      `/v1/indicators/*`, and `/v1/chan/*` paths.
- [x] 1.2 Keep tests proving legacy `/security/v1/*`, `/indicator/*`, and
      `/chan/*` paths remain registered.
- [x] 1.3 Keep `/v1/collector/collect` route coverage unchanged.

## 2. Backend Alias Implementation

- [x] 2.1 Add preferred `/v1/securities` and `/v1/security-sources` security
      aliases without removing existing `/security/v1/*` routes.
- [x] 2.2 Add preferred `/v1/indicators/*` aliases for existing indicator
      endpoints without changing request or response DTOs.
- [x] 2.3 Add preferred `/v1/chan/*` aliases for existing Chan endpoints
      without changing request or response DTOs.
- [x] 2.4 Ensure gateway prefixes `/api/mist` and `/api/chan` are not included
      in backend controller paths.

## 3. Documentation

- [x] 3.1 Update README endpoint tables to list `/v1` paths as preferred and
      old paths as compatibility routes.
- [x] 3.2 Update strategy platform roadmap disposition to note that the API
      standardization child change has been created.

## 4. Verification

- [x] 4.1 Run focused backend tests for route alias metadata.
- [x] 4.2 Run `openspec validate standardize-mist-v1-api-paths --strict`.
- [x] 4.3 Run `openspec validate define-strategy-platform-roadmap --strict`
      after updating roadmap disposition.
- [x] 4.4 Confirm no template markers or trailing whitespace remains in the
      changed OpenSpec documents.
