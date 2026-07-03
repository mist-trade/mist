## 1. Baseline Contracts

- [ ] 1.1 Add route contract tests that capture current legacy `/api/tdx/*`, normalized `/v1/*`, and `/ws/quote/{client_id}` registrations before moving files.
- [ ] 1.2 Add provider facade tests proving existing callers can import `TdxDatasourceProvider` and call representative market, finance, sector, formula, raw, health, and close methods through the facade.
- [ ] 1.3 Add repository hygiene tests that fail if legacy REST, normalized REST, and WebSocket route modules live in the same route package after the refactor.
- [ ] 1.4 Run the new baseline tests and confirm they fail only on the intended structural expectations before implementation.

## 2. Route Package Separation

- [ ] 2.1 Move adapter-backed legacy REST route modules into `tdx/routes/legacy/` while preserving existing `/api/tdx/*` prefixes and dependency behavior.
- [ ] 2.2 Update app router registration imports and legacy route tests for the new package paths.
- [ ] 2.3 Move normalized product REST route code into `tdx/routes/v1/` while preserving existing `/v1/*` paths and provider-backed dependencies.
- [ ] 2.4 Update normalized route imports, OpenAPI/export tests, and route contract tests for the new `v1` package paths.
- [ ] 2.5 Keep WebSocket route code outside both REST route packages and add/update tests proving it still uses subscription, bridge, collector, and manager dependencies.

## 3. Provider Normalizer Extraction

- [ ] 3.1 Extract shared native response helpers from `tdx_provider.py` into a focused internal normalizer/helper module and add direct unit tests for supported mapping, sequence, scalar, and error shapes.
- [ ] 3.2 Extract security, relation, IPO, share-capital, dividend, convertible-bond, and ETF normalizers into reference/security-focused modules and add direct unit tests for each moved normalizer family.
- [ ] 3.3 Extract finance and trade-aggregate normalizers into finance-focused modules and add direct unit tests for financial data, single finance value, stock aggregate, sector aggregate, and market aggregate payloads.
- [ ] 3.4 Extract sector normalizers into a sector-focused module and add direct unit tests for sector list and member normalization.
- [ ] 3.5 Extract formula normalizers and formula error helpers into a formula-focused module and add direct unit tests for formula data, metadata, execution, batch execution, timeout, and request-limit behavior.
- [ ] 3.6 Update existing provider tests to import only public facade behavior unless they are intentionally testing internal normalizers.

## 4. Provider Operation Extraction

- [ ] 4.1 Create a TDX provider internal package for operation modules without changing the public `src.datasource.tdx_provider.TdxDatasourceProvider` import path.
- [ ] 4.2 Move market operations into a market operation module and add facade-level unit tests for bars, recent bar collection, snapshots, and price-volume behavior.
- [ ] 4.3 Move security/reference operations into focused operation modules and add facade-level unit tests for trading dates, securities, security info, relations, IPO, share-capital, dividend, convertible-bond, and ETF behavior.
- [ ] 4.4 Move finance and trade-aggregate operations into a finance operation module and add facade-level unit tests for financial data, by-date queries, single finance values, and aggregate variants.
- [ ] 4.5 Move sector operations into a sector operation module and add facade-level unit tests for sector list and sector member behavior.
- [ ] 4.6 Move formula operations into a formula operation module and add facade-level unit tests for formula data, metadata, execution, batch execution, timeout, and request-limit behavior.
- [ ] 4.7 Keep diagnostics, raw call, health, and close behavior on or behind the facade and add unit tests proving raw call, health failure, health success, and close still work.
- [ ] 4.8 Add boundary tests proving normalized routes and collectors depend on the facade and do not import internal operation classes directly.

## 5. Capability Metadata

- [ ] 5.1 Extend provider capability models to expose separate `providerMethods` and `nativeMethods` fields without removing existing capability status or unsupported reason fields.
- [ ] 5.2 Update TDX and QMT capability metadata so `providerMethods` contains facade method names and `nativeMethods` contains native backing method names where known.
- [ ] 5.3 Add unit tests for capability manifest serialization, supported capabilities, planned capabilities, unsupported capabilities, and raw diagnostics metadata.
- [ ] 5.4 Update datasource dependency-flow documentation to describe the new manifest semantics and route package boundaries.

## 6. Runtime Composition And Health

- [ ] 6.1 Add a `TdxRuntime` composition object that can create owned adapter, provider, bridge, collector, subscription client, and WebSocket manager components in dependency order.
- [ ] 6.2 Add unit tests for runtime startup with owned components, injected components, startup failure cleanup, and ownership-aware shutdown.
- [ ] 6.3 Migrate `tdx/main.py` lifespan startup and shutdown to delegate to `TdxRuntime` while preserving app-state keys consumed by existing dependencies.
- [ ] 6.4 Add or update unit tests proving route dependencies still read adapter, provider, bridge, collector, subscription client, and WebSocket manager from app state after runtime migration.
- [ ] 6.5 Move health aggregation into the runtime or a runtime-owned health helper while preserving existing top-level `/health` response fields.
- [ ] 6.6 Add health unit tests for provider HTTP success, provider HTTP failure, adapter initialization state, bridge state, collector state, subscription state, WebSocket connection state, and backwards-compatible top-level fields.

## 7. Verification And Documentation

- [ ] 7.1 Run datasource formatting and lint/type checks required by the repository.
- [ ] 7.2 Run targeted provider, normalizer, route, capability, runtime, health, WebSocket, and repository hygiene unit tests.
- [ ] 7.3 Run datasource integration tests covering normalized `/v1/*`, legacy `/api/tdx/*`, and `/ws/quote/{client_id}` behavior.
- [ ] 7.4 Update implementation evidence in the OpenSpec tasks or related docs with the exact commands and outcomes.
- [ ] 7.5 Review the final diff for accidental API path changes, WinSW XML changes, or unrelated repository churn before committing.
