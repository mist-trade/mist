## Why

Mist backend APIs currently use mixed path styles: `/security/v1/*`,
`/indicator/*`, `/chan/*`, and `/v1/collector/*`. The strategy platform should
not add another style, so the backend needs a version-first `/v1/<resource>`
standard with compatibility paths for existing clients.

## What Changes

- Add standardized `/v1` aliases for existing security, indicator, and Chan
  business endpoints.
- Keep existing `/security/v1/*`, `/indicator/*`, and `/chan/*` endpoints
  compatible during migration.
- Keep production gateway prefixes such as `/api/mist` and `/api/chan` outside
  backend controller path definitions.
- Document `/v1/<resource>` as the preferred path style for new Mist product
  APIs, including the strategy platform.
- Do not change datasource normalized APIs or the existing `/v1/collector/*`
  endpoints.

## Capabilities

### New Capabilities

- `mist-api-path-standardization`: Version-first backend API path aliases,
  compatibility behavior, client migration boundaries, and verification
  requirements for Mist business endpoints.

### Modified Capabilities

None. Existing endpoint behavior remains compatible; this change adds preferred
aliases without removing old paths.

## Impact

- Affects `mist` backend controllers for security, indicators, and Chan Theory.
- Affects docs and client migration planning for `mist-fe` and `mist-skills`.
- Requires route compatibility tests proving both old and new paths remain
  available.
- Does not change MySQL schema, datasource service routes, or nginx gateway
  prefixes.
