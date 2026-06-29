## Context

The current green baseline has a working TDX Python datasource on the Windows
API machine behind the Docker-managed Mist backend. It exposes normalized
`/v1/bars/query`,
`/v1/snapshots/query`, `/v1/sectors/query`, `/v1/raw/tdx/call`, health, and a
WebSocket bridge. Live verification has proven that TDX native HTTP at
`http://127.0.0.1:17709/` returns real K-line, snapshot, and sector data when
TongDaXin is running and logged in.

The official TdxQuant surface is broader than those endpoints. It includes
market data, security metadata, sectors, calendars, finance/report data,
formula execution, subscription functions, client utilities, user sector
mutation, and trading/account methods. Now that the Docker backend plus host
datasource path is working, Mist should aim for a broad non-trading data adapter instead of only a
thin smoke-test surface. The datasource must still define a stable
provider-neutral contract, classify the official TDX methods by exposure policy,
and require any future QMT provider to map into the same contract.

This change builds on `refactor-tdx-python-datasource`; it does not replace the
green deployment baseline.

## Goals / Non-Goals

**Goals:**

- Create an OpenSpec-owned coverage model for TDX official functions.
- Define normalized datasource endpoint families that can be implemented by TDX
  now and QMT later.
- Build toward a complete non-trading TDX data adapter, implemented in
  verifiable phases.
- Keep NestJS dependent on normalized datasource contracts, not TDX method
  names, native HTTP shapes, SDK DataFrames, or QMT SDK details.
- Decide which TDX methods become normalized endpoints, which remain raw/debug
  only, which are admin/operator-only, which are internal implementation
  details, and which are excluded.
- Add implementation tasks for docs, tests, smoke scripts, and incremental
  endpoint work.

**Non-Goals:**

- Mirror every official TDX method name directly as a public `/v1` endpoint.
- Implement QMT provider parity in this change.
- Expose trading/account operations through the market datasource.
- Add Python-owned durable cache or SQLite persistence for bars or
  subscriptions.
- Change the already-green Windows deployment service boundary.

## Decisions

### Use a coverage matrix instead of direct method mirroring

The system will maintain a TDX interface coverage matrix. Each official method
is classified as:

- `normalized-now`: exposed or implemented through a stable `/v1` datasource
  contract in the near-term implementation.
- `normalized-later`: useful, but not part of the immediate product or smoke
  path; still part of the target non-trading data adapter when it is a
  read-data API.
- `admin-only`: not part of ordinary product data reads, but can be considered
  for a separate operator/admin workflow.
- `raw-only`: allowed through `/v1/raw/tdx/call` for operator diagnostics or
  temporary development use, but not a stable application dependency.
- `internal-only`: used by Python internals, especially subscription and
  callback management.
- `example-helper-not-api`: found in official examples but not an official
  `tq.*` method, so it must not become a coverage row for provider
  implementation.
- `do-not-expose`: outside the market datasource boundary, especially trading,
  account, and dangerous client-control operations.

Alternative considered: expose one generic normalized route for every official
TDX method. That keeps the gateway thin but gives NestJS a provider-shaped API
and makes QMT parity nearly impossible.

### Normalize endpoint families, not provider method names

The datasource contract should be organized by Mist use cases:

- Market bars: current `/v1/bars/query`, backed by TDX `get_market_data`.
- Market snapshots: current `/v1/snapshots/query`, backed by
  `get_market_snapshot` and later optional quote-depth methods.
- Lightweight quote/price-volume reads: a normalized endpoint backed by
  `get_pricevol` where it gives faster batch access than full snapshots.
- Trading calendar: a normalized endpoint backed by `get_trading_dates`.
- Securities and metadata: normalized endpoints backed by
  `get_stock_list`, `get_valid_stock_codes`, `get_stock_info`,
  `get_more_info`, and related information methods.
- Sectors: current `/v1/sectors/query` plus later sector-list support, backed
  by `get_sector_list` and `get_stock_list_in_sector`.
- Reference instrument data: normalized endpoints for IPO, share-capital,
  dividend, convertible bond, ETF, and related data.
- Finance and reports: normalized endpoints backed by financial/report TDX
  methods after the core quote and metadata endpoints are stable.
- Formulas: normalized formula request/response endpoints with execution
  limits, explicit error mapping, and QMT alignment notes.
- Diagnostics: `/v1/raw/tdx/call` stays provider-specific and non-contractual.

Every normalized endpoint must return the same envelope shape, symbol format,
time format, numeric format, and error shape regardless of provider.

### Treat QMT as a peer provider with explicit capability reporting

TDX and QMT providers must implement a common provider contract and expose a
capability manifest. QMT does not need to support every TDX capability before it
is introduced, but missing capabilities must be explicit. A provider that cannot
serve an endpoint returns `PROVIDER_CAPABILITY_UNSUPPORTED` with a stable
details object; it must not fake data, silently downgrade semantics, or leak SDK
exceptions upstream.

Alternative considered: keep QMT on a separate route family. That would be
faster locally but would force NestJS to branch on provider-specific contracts.

### Keep raw TDX calls as an operator tool

`/v1/raw/tdx/call` remains useful for smoke tests, official-doc exploration,
and emergency diagnostics. It must not be consumed by regular NestJS collection
logic except inside temporary experiments guarded by tests and tasks. Any raw
usage that graduates into production must be promoted into a normalized
endpoint with a QMT alignment decision.

### Build non-trading data coverage in phases

The target is broad data coverage, but not one unreviewable implementation
burst. The implementation should progress in phases:

1. Core market and discovery: bars, snapshots, price-volume, sectors, calendar,
   security lists, and security details.
2. Reference instrument data: relation, IPO, share capital, dividend factors,
   convertible bonds, ETF, and related instruments.
3. Finance and reports: financial statements, trading data aggregates, market
   data aggregates, and report data.
4. Formula data and execution: formula storage/query/execution with limits and
   stable error mapping.

Every phase must keep the normalized contract provider-neutral and update QMT
capability metadata, even when QMT initially returns explicit unsupported
responses.

### Exclude trading/account methods from the market datasource

TDX trading/account methods are not part of this market-data datasource
contract. If Mist later needs trading, it must be designed as a separate
audited trading service with authentication, account isolation, idempotency,
risk controls, and audit logging. The datasource can document those TDX methods
as `do-not-expose` so they are not accidentally proxied into application flows.

Client-control, file, message, refresh, and mutation utilities are also not
ordinary read-data APIs. They should be admin-only or do-not-expose unless a
separate operator workflow is designed.

### Test both native and normalized shapes

Smoke tests should validate:

1. TDX native HTTP works for the selected official method and returns the
   documented native shape.
2. The normalized `/v1` endpoint returns the provider-neutral envelope and data
   model.
3. The same scenario is expressible as a QMT contract test, even when QMT is
   currently skipped or marked unsupported.

This preserves the fastest live-debug path while keeping product code anchored
to normalized contracts.

## Risks / Trade-offs

- Official TDX documentation includes methods with overlapping or ambiguous
  semantics -> the coverage matrix records the chosen classification and the
  normalized endpoint owner before implementation starts.
- QMT lacks a direct equivalent for a TDX method -> the provider capability
  manifest and `PROVIDER_CAPABILITY_UNSUPPORTED` response keep the contract
  honest.
- Raw calls become convenient production dependencies -> contract tests and
  backend lint checks should catch new NestJS dependencies on `/v1/raw/tdx/call`.
- Normalized endpoints grow too broad -> each new endpoint requires a Mist use
  case or data-adapter family, a TDX mapping, a QMT alignment note, fixtures,
  and smoke coverage.
- Live TDX behavior differs from official examples -> smoke scripts validate the
  native shape first and fixtures record known shape variants such as `Value`
  wrappers.
- Official examples define helper functions that look like API methods -> the
  coverage matrix records `example-helper-not-api`, as with
  `get_real_time_data`, before implementation tasks are created.

## Migration Plan

1. Add the OpenSpec coverage matrix and provider-contract requirements.
2. Create a repository document in `mist-datasource` that mirrors the OpenSpec
   coverage matrix and links to the official TDX source pages.
3. Add provider capability manifest models and tests for TDX and QMT.
4. Promote phase-1 normalized endpoints for trading calendar, security
   metadata, sector list, and price-volume data.
5. Promote phase-2 reference instrument endpoints, then phase-3 finance/report
   endpoints, then phase-4 formula endpoints.
6. Extend runtime smoke checks to cover native TDX HTTP shape, normalized TDX
   shape, and provider capability reporting.
7. Add backend tests that prevent product code from using raw TDX calls as a
   stable dependency.
8. When QMT work starts, implement the same provider contract capability by
   capability, returning explicit unsupported responses where needed.

Rollback: this change is additive at the spec level. Implementation rollback
means disabling newly added normalized endpoints or leaving them behind feature
flags while preserving the current green bars/snapshots/sectors/WebSocket
baseline.

## Open Questions

- What is the exact phase order inside finance/report data after the core data
  adapter endpoints are complete?
- What execution limits should formula endpoints enforce before they are
  enabled outside operator smoke tests?
- Should the first QMT parity pass target only bars, snapshots, sectors, and
  calendar, or include metadata and finance data as well?
