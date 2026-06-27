## ADDED Requirements

### Requirement: Provider-neutral response contract
The datasource SHALL expose normalized responses that are independent of TDX,
QMT, or any provider-native SDK shape.

#### Scenario: Successful provider response
- **WHEN** a normalized datasource endpoint succeeds
- **THEN** the response includes `ok: true`, `requestId`, `provider`, `data`,
  `meta`, and `error: null`

#### Scenario: Provider failure response
- **WHEN** a provider cannot satisfy a normalized datasource request
- **THEN** the response includes `ok: false`, `data: null`, `provider`, and a
  stable error object with `code`, `message`, `retryable`, and `details`

#### Scenario: Provider-native payload is not exposed
- **WHEN** product code calls a normalized datasource endpoint
- **THEN** the endpoint returns provider-neutral fields and MUST NOT require the
  caller to parse TDX `Value` wrappers, pandas DataFrames, or QMT SDK objects

### Requirement: Provider capability manifest
The datasource SHALL expose provider capability metadata that describes which
normalized endpoint families each provider supports.

#### Scenario: TDX capability manifest is requested
- **WHEN** a client requests provider capability metadata for TDX
- **THEN** the datasource reports supported, unsupported, and experimental
  capability families without requiring a live data request

#### Scenario: QMT capability manifest is requested
- **WHEN** a client requests provider capability metadata for QMT
- **THEN** the datasource reports the same capability family names used for TDX
  and marks unavailable families explicitly

#### Scenario: Capability status changes
- **WHEN** an implementation adds or removes support for a normalized endpoint
  family
- **THEN** the provider capability manifest is updated in the same change as the
  endpoint implementation and tests

### Requirement: Normalized endpoint families
The datasource SHALL group public market-data functionality by provider-neutral
endpoint family rather than by provider method name.

#### Scenario: Market bars are queried
- **WHEN** a client queries historical or recent bars
- **THEN** the datasource uses the market-bars family and returns normalized bar
  objects with market-suffixed symbols, ISO 8601 `+08:00` timestamps, and
  numeric OHLCV fields

#### Scenario: Snapshots are queried
- **WHEN** a client queries latest market snapshots
- **THEN** the datasource uses the snapshots family and returns normalized
  snapshot objects with provider-independent price, volume, amount, and time
  fields

#### Scenario: Security metadata is queried
- **WHEN** a client queries tradable instruments or security details
- **THEN** the datasource uses security metadata endpoints instead of exposing
  provider-native stock-list or info method names directly

#### Scenario: Trading calendar is queried
- **WHEN** a client queries trading dates
- **THEN** the datasource uses a calendar endpoint that can be implemented by
  both TDX and QMT providers

#### Scenario: Non-trading reference data is queried
- **WHEN** a client queries reference, instrument, finance, report, or formula
  data
- **THEN** the datasource uses provider-neutral endpoint families and MUST NOT
  require callers to know whether TDX or QMT uses the same native method names

### Requirement: Explicit unsupported capabilities
The datasource SHALL return a stable unsupported-capability error when a
provider cannot implement a normalized endpoint family.

#### Scenario: QMT lacks a TDX-equivalent feature
- **WHEN** a client calls a normalized endpoint that QMT does not support
- **THEN** the datasource returns `PROVIDER_CAPABILITY_UNSUPPORTED` with the
  provider, capability family, requested operation, and recommended fallback in
  `details`

#### Scenario: Provider implementation is incomplete
- **WHEN** an endpoint family is listed as planned but not implemented for a
  provider
- **THEN** the provider capability manifest marks it unsupported or
  experimental and the endpoint MUST NOT silently return partial fake data

### Requirement: Raw provider calls are diagnostic-only
The datasource SHALL keep raw provider calls available only for diagnostics,
smoke verification, and temporary development workflows.

#### Scenario: Operator calls raw TDX method
- **WHEN** an operator calls `/v1/raw/tdx/call`
- **THEN** the datasource proxies the requested TDX method and returns the
  provider-native result without changing the normalized endpoint contract

#### Scenario: Product code needs a raw result
- **WHEN** regular NestJS product code depends on a raw TDX method
- **THEN** the method MUST be promoted to a normalized endpoint or explicitly
  rejected by review before the dependency is accepted

### Requirement: Subscription boundary
The datasource SHALL use provider-specific subscription APIs only behind the
normalized WebSocket subscription and event bridge.

#### Scenario: NestJS syncs subscriptions
- **WHEN** NestJS sends desired subscriptions over the datasource WebSocket
- **THEN** the provider implementation reconciles provider-native subscriptions
  internally and returns normalized accepted and rejected symbol sets

#### Scenario: Provider subscription callback arrives
- **WHEN** a provider callback reports that a symbol changed
- **THEN** the datasource converts it into normalized runtime state and bar
  collection work rather than forwarding provider-native callback payloads as
  product events

### Requirement: Trading operations are excluded
The market datasource SHALL NOT expose trading, account, order, or cancel
operations through normalized market-data endpoints.

#### Scenario: Trading method appears in provider documentation
- **WHEN** a provider offers account query, order, or cancel methods
- **THEN** those methods are classified outside the market datasource boundary
  and MUST NOT be exposed as ordinary datasource APIs

#### Scenario: Trading support is requested later
- **WHEN** Mist needs provider trading operations
- **THEN** a separate trading service design is required with authentication,
  audit logging, idempotency, account isolation, and risk controls

### Requirement: Admin and mutation utilities are separate from data endpoints
The datasource SHALL NOT mix provider client-control, file, message, refresh, or
mutation utilities into ordinary read-data endpoint families.

#### Scenario: Client utility is needed for operations
- **WHEN** an operator workflow needs a provider utility such as file sending,
  client messaging, cache refresh, or user-sector mutation
- **THEN** the utility is designed as an admin/operator capability or kept
  raw-only instead of being added to ordinary data endpoints

### Requirement: Contract and smoke tests
The datasource SHALL include tests that validate provider-native inputs,
normalized outputs, unsupported-provider behavior, and live smoke paths.

#### Scenario: TDX live smoke runs
- **WHEN** the Windows live smoke script runs against a logged-in TDX terminal
- **THEN** it validates native TDX HTTP shape first and then validates the
  normalized datasource response for the same operation

#### Scenario: QMT contract test runs
- **WHEN** QMT is unavailable or not configured
- **THEN** the QMT contract test can still validate manifest shape and explicit
  unsupported responses without requiring a live QMT terminal
