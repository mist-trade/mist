## Context

The current production boundary is a single host-side Windows service managed by WinSW. That boundary is appropriate because the TDX terminal, native SDK path, and local TDX HTTP endpoint are host-bound. The WinSW XML is intentionally small: it starts one Python FastAPI process, injects runtime configuration, restarts on process failure, and rotates logs.

The pressure point is inside the Python process. The datasource currently has three distinct TDX paths:

- Legacy REST: `/api/tdx/*` routes call the adapter and the in-process `tqcenter.tq` SDK.
- Normalized REST: `/v1/*` routes call `TdxDatasourceProvider`, which calls TDX HTTP/JSON-RPC.
- WebSocket: `/ws/quote/{client_id}` uses adapter-backed subscription callbacks and provider-backed snapshot collection.

`src/datasource/tdx_provider.py` has grown to 1415 lines because it contains provider facade methods, HTTP/RPC orchestration, native response unwrapping, domain normalization, formula-specific timeout/error handling, and raw diagnostics. That makes the file a shared edit hotspot and makes it harder to reason about which code belongs to product contracts versus TDX-specific quirks.

## Goals / Non-Goals

**Goals:**

- Preserve the single WinSW service and existing process boundary.
- Preserve all public API paths, including legacy `/api/tdx/*`, normalized `/v1/*`, and `/ws/quote/{client_id}`.
- Make old and new REST route ownership obvious from the file tree.
- Keep `TdxDatasourceProvider` as the public facade used by routes, collectors, tests, and future backend callers.
- Split provider code into domain operation and normalization modules so new capabilities do not expand one monolithic file.
- Introduce a runtime composition object that owns lifecycle and component health for adapter, provider, bridge, collector, subscription client, and WebSocket manager.
- Clarify capability metadata by separating product provider method names from native TDX backing method names.
- Add unit tests for every moved boundary and behavior-preserving refactor.

**Non-Goals:**

- Do not remove or deprecate legacy `/api/tdx/*` endpoints in this change.
- Do not split the datasource into multiple Windows services or containers.
- Do not change backend datasource integration contracts.
- Do not redesign QMT implementation scope beyond preserving provider-neutral metadata shape.
- Do not introduce new external dependencies.

## Decisions

### Keep WinSW as the deployment boundary

The service wrapper remains unchanged because it already expresses the right operational boundary: one host-side datasource process near the TDX terminal and SDK. Splitting into multiple Windows services would add deploy and recovery complexity before the code-level responsibilities are clean.

Alternative considered: split adapter, provider, and WebSocket collection into separate processes. This was rejected for this change because it would introduce cross-process state, readiness ordering, and subscription recovery concerns while the current pain is mostly module ownership.

### Preserve a thin `TdxDatasourceProvider` facade

`TdxDatasourceProvider` remains the import and dependency-injection surface. Internally it should compose focused domain operation objects such as market, security, finance, sector, formula, and diagnostics operations. Existing public methods delegate to these domain objects.

Alternative considered: expose multiple provider classes directly to routes. This was rejected because it would make the route migration larger and leak capability composition into endpoint code.

Alternative considered: use mixins to split the class. This was rejected because mixins hide shared state and make method ownership less explicit than composition.

### Move native response handling and normalizers out of the facade

Native shape helpers, field aliases, symbol lookup helpers, formula result normalizers, and domain-specific normalization functions should live in focused normalizer modules. Operation modules may call these helpers, but normalizers must not own HTTP clients or route dependencies.

The existing `tdx_normalization.py` should remain the home for common symbol, date, number, and bar/snapshot normalization. New domain modules should be added when helpers are clearly specific to security, finance, sector, formula, or diagnostics behavior.

### Separate route directories by contract generation

Legacy adapter-backed routes should move under `tdx/routes/legacy/` and keep their `/api/tdx` prefixes. Normalized product routes should move under `tdx/routes/v1/` and keep their `/v1` paths. WebSocket routes should remain separate from both REST route families.

This matches the user's direction: legacy and new endpoints should be naturally separated by file architecture, not only by comments or route prefixes.

### Add a datasource runtime composition object

Create a runtime object that builds and owns adapter, provider, bridge, collector, subscription client, and WebSocket manager. `tdx/main.py` should delegate startup, shutdown, app-state synchronization, and health aggregation to that runtime object.

The runtime object should still support tests that inject prebuilt components. Ownership flags can move into the runtime instead of remaining as scattered module globals.

### Keep `/health` compatible while adding clearer readiness

The current `/health` response should keep existing top-level fields used by scripts and operators. The change should add structured component status and readiness details rather than replacing the old shape. WinSW still restarts only on process failure, so application health must make semantic stuck states visible.

### Split capability metadata semantics

Provider metadata should distinguish:

- `providerMethods`: callable facade methods exposed by the normalized provider layer, such as `get_bars` or `get_snapshots`.
- `nativeMethods`: TDX backing method names, such as `get_market_data` or `get_market_snapshot`.

This avoids treating native SDK/RPC names as product provider methods and makes the `/providers` response easier to consume safely.

## Risks / Trade-offs

- [Risk] Large file movement can create noisy diffs and missed imports. -> Mitigation: split in small batches, preserve public imports, and run route/provider unit tests after each batch.
- [Risk] Capability metadata semantics may affect consumers that read `providerMethods`. -> Mitigation: add `nativeMethods` explicitly, document the distinction, and cover `/providers` with contract tests.
- [Risk] Moving route modules can accidentally change prefixes or OpenAPI operation behavior. -> Mitigation: add route registration tests proving legacy `/api/tdx/*`, normalized `/v1/*`, and `/ws/quote/{client_id}` still exist.
- [Risk] Runtime composition can break test injection patterns. -> Mitigation: design the runtime factory to accept optional components and add lifecycle tests for injected and owned components.
- [Risk] Health response expansion can confuse deploy scripts if status semantics change. -> Mitigation: preserve current top-level keys and add new readiness fields without changing successful status values in this change.

## Migration Plan

1. Add tests that capture current route registration, provider facade behavior, capability metadata shape, runtime lifecycle behavior, and health response compatibility.
2. Move legacy REST route modules into `tdx/routes/legacy/` and normalized REST route modules into `tdx/routes/v1/` while keeping prefixes and endpoint behavior unchanged.
3. Extract provider normalizers and native shape helpers into focused modules with behavior-preserving unit tests.
4. Extract provider domain operations behind the existing `TdxDatasourceProvider` facade and keep route callers unchanged.
5. Add runtime composition and migrate `tdx/main.py` to delegate startup, shutdown, state sync, and health aggregation.
6. Update capability metadata and documentation.
7. Run the datasource unit/integration test suite and targeted contract smoke tests.

Rollback is straightforward because no storage migration or API path removal is included. If a batch fails, revert the latest structural batch while keeping earlier behavior-preserving tests.

## Open Questions

- None for the initial implementation plan. The old API remains in a separate legacy route folder and is not removed by this change.
