## Why

The deployed TDX datasource now proves the normalized Python gateway can serve
real market data end to end, but the official TdxQuant data surface is much
wider than the current `/v1` routes. We need a controlled interface coverage
plan so Mist can build a near-complete non-trading data adapter without leaking
provider-specific details into NestJS, and so the same datasource contract can
later be implemented by QMT.

## What Changes

- Add a TDX interface coverage matrix based on the official TdxQuant function
  families, with each method classified as normalized-now, normalized-later,
  admin-only, raw-only, internal-only, example-helper-not-api, or
  do-not-expose.
- Define provider-neutral datasource capability groups for market data,
  security metadata, trading calendar, sectors, finance/report data, formulas,
  subscriptions, reference data, instrument data, and provider diagnostics.
- Extend the normalized `/v1` contract beyond the current bars, snapshots,
  sectors, raw call, health, and WebSocket bridge so read-only TDX data APIs can
  be covered in implementation phases.
- Keep `/v1/raw/tdx/call` as an operator/debug escape hatch, not as a stable
  application dependency.
- Require every new normalized endpoint to declare how TDX maps to the common
  contract and whether QMT has an equivalent provider implementation path.
- Explicitly keep trading/account APIs out of the datasource API unless a
  separate audited trading boundary is designed.
- Keep client-control, file, message, refresh, and mutation-style utilities out
  of ordinary data endpoints; classify them as admin-only or do-not-expose
  unless a separate operator workflow is designed.
- Add smoke and contract-test expectations that validate both native TDX HTTP
  shape and normalized Mist datasource shape.

## Capabilities

### New Capabilities

- `datasource-provider-contract`: Provider-neutral datasource contracts,
  coverage classifications, endpoint families, compatibility rules, and QMT
  alignment expectations for TDX/QMT market-data providers.
- `tdx-interface-coverage`: TDX official function coverage matrix, exposure
  policy, normalized endpoint priorities, raw-call boundaries, and smoke-test
  requirements.

### Modified Capabilities

No archived OpenSpec capabilities are modified by this change. This change
builds on the deployed `refactor-tdx-python-datasource` work and introduces
follow-up capabilities that can later be archived into the main specs.

## Impact

- `mist-datasource` provider interface, TDX provider, future QMT provider,
  Pydantic models, `/v1` FastAPI routes, WebSocket protocol, smoke scripts,
  fixtures, and live test references.
- Mist backend datasource consumers under the TDX source and collector paths
  whenever new normalized endpoints are adopted.
- OpenSpec documentation for TDX/QMT datasource boundaries and implementation
  priorities.
- Operator workflows that currently use raw TDX calls for diagnosis or live
  smoke verification.
