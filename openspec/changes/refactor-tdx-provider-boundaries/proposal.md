## Why

The TDX datasource service has the right deployment boundary as a single host-side WinSW service, but its Python internals have accumulated too many responsibilities in one provider file and one runtime wiring path. The current 1415-line `tdx_provider.py` makes every new provider capability touch the same module, while old `/api/tdx/*` routes, normalized `/v1/*` routes, and WebSocket runtime components still need clearer structural boundaries.

## What Changes

- Split the TDX datasource provider implementation by capability while preserving the existing `TdxDatasourceProvider` public facade and normalized `/v1/*` behavior.
- Move provider normalization, native response shape handling, and formula-specific helpers out of the monolithic provider module into focused domain modules.
- Keep legacy `/api/tdx/*` route code structurally separated from normalized product `/v1/*` route code; legacy routes remain adapter-backed migration/debug endpoints, while normalized routes remain the product-facing contract.
- Introduce an explicit datasource runtime composition boundary that owns adapter, provider, bridge, collector, subscription client, and shutdown ordering instead of scattering lifecycle state across route dependencies and app state assignments.
- Clarify provider capability metadata so product provider methods and native TDX backing methods are not conflated.
- Improve datasource health/readiness reporting so WinSW's process restart behavior is complemented by application-level runtime state and provider readiness.
- No API path removals are included in this change.

## Capabilities

### New Capabilities

- `tdx-provider-boundaries`: Defines the structural boundaries for TDX provider modules, normalized versus legacy route ownership, capability metadata semantics, and facade compatibility expectations.

### Modified Capabilities

- `datasource-runtime-safety`: Adds runtime composition and health/readiness requirements for the TDX datasource process so lifecycle ownership and failure reporting are explicit.

## Impact

- Affected repository: `mist-datasource`.
- Affected files are expected under `src/datasource/`, `tdx/routes/`, `tdx/main.py`, `tdx/routes/dependencies.py`, tests, and datasource architecture docs.
- The WinSW service XML and process boundary stay unchanged unless documentation needs to reference existing behavior.
- Existing normalized `/v1/*`, legacy `/api/tdx/*`, and `/ws/quote/{client_id}` contracts must remain backward compatible.
- Implementation must include focused unit tests for every moved provider capability, normalizer, runtime lifecycle boundary, capability metadata change, and health/readiness behavior.
