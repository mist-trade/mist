## 1. Capture Coverage Baseline

- [x] 1.1 Create a versioned TDX interface coverage document in
      `mist-datasource/docs/references` with reviewed date, official source
      links, method family, classification, endpoint family, QMT note, risk,
      and test strategy.
- [x] 1.2 Seed the coverage matrix with core market methods:
      `get_market_data`, `get_market_snapshot`, `get_pricevol`,
      and `get_benchmark_data`.
- [x] 1.3 Seed the matrix with security, sector, and calendar methods:
      `get_stock_list`, `get_sector_list`, `get_stock_list_in_sector`,
      `get_valid_stock_codes`, `get_stock_info`, `get_more_info`,
      `get_match_stkinfo`, and `get_trading_dates`.
- [x] 1.4 Seed the matrix with reference security methods:
      `get_relation`, `get_ipo_info`, `get_kzz_info`, `get_cb_info`,
      `get_trackzs_etf_info`, `get_gb_info`, `get_gb_info_by_date`, and
      `get_divid_factors`.
- [x] 1.5 Seed the matrix with finance and report methods:
      `get_financial_data`, `get_financial_data_by_date`,
      `get_gp_one_data`, `get_gpjy_value`, `get_gpjy_value_by_date`,
      `get_bkjy_value`, `get_bkjy_value_by_date`, `get_scjy_value`,
      `get_scjy_value_by_date`, and `get_report_data`.
- [x] 1.6 Seed the matrix with formula methods:
      `formula_format_data`, `formula_set_data`, `formula_set_data_info`,
      `formula_get_data`, `formula_get_all`, `formula_get_info`,
      `formula_zb`, `formula_xg`, `formula_exp`,
      `formula_process_mul_zb`, `formula_process_mul_xg`, and
      `formula_process_mul_exp`.
- [x] 1.7 Seed the matrix with subscription, client utility, user-sector, and
      trading/account methods, marking subscription methods internal-only and
      trading/account methods do-not-expose.
- [x] 1.8 Record `get_real_time_data` as an official-example helper rather than
      an official TdxQuant API unless a native `tq.get_real_time_data` method is
      verified in the target runtime.
- [x] 1.9 Update the existing live smoke reference so it links to the coverage
      matrix instead of duplicating classification decisions.
- [x] 1.10 Link the coverage matrix to the captured official-page reference
      that records the `get_real_time_data` finding.

## 2. Add Provider Capability Contract

- [x] 2.1 Add provider capability models for capability family, support status,
      provider method mapping, stability, and unsupported reason.
- [x] 2.2 Extend `GET /providers` or add an equivalent provider metadata route
      that returns TDX and QMT capability manifests using the same family
      names.
- [x] 2.3 Add TDX capability metadata for current supported families: bars,
      snapshots, sector membership, raw diagnostics, health, and WebSocket
      subscriptions.
- [x] 2.4 Add planned TDX capability metadata for trading calendar, security
      metadata, sector list, reference data, instrument data, finance/report
      data, and formulas.
- [x] 2.5 Add QMT capability metadata that reports supported, planned, or
      unsupported status without requiring QMT to be running.
- [x] 2.6 Add `PROVIDER_CAPABILITY_UNSUPPORTED` error mapping and tests for
      provider requests that cannot be satisfied.
- [x] 2.7 Add unit tests that assert TDX and QMT manifests share the same
      provider-neutral capability family names.

## 3. Normalize Phase 1 TDX Data Endpoints

- [x] 3.1 Add normalized trading-calendar request and response models backed by
      TDX `get_trading_dates`.
- [x] 3.2 Add a normalized calendar route and tests that validate TDX success,
      TDX HTTP failure, and QMT unsupported behavior.
- [x] 3.3 Add normalized security-list and security-info models backed by TDX
      `get_stock_list`, `get_valid_stock_codes`, `get_stock_info`, and
      `get_more_info` where live docs and runtime behavior are verified.
- [x] 3.4 Add normalized security metadata routes and tests with TDX native
      fixtures and provider-neutral expected responses.
- [x] 3.5 Add normalized sector-list support backed by TDX `get_sector_list`
      while keeping existing sector-membership behavior intact.
- [x] 3.6 Add normalized price-volume support backed by TDX `get_pricevol`
      after live HTTP shape and QMT alignment are documented.
- [x] 3.7 Add normalization tests for native TDX result wrappers, empty results,
      provider errors, symbol variants, and numeric coercion for each new
      endpoint.

## 4. Normalize Phase 2 Reference And Instrument Data

- [ ] 4.1 Add normalized reference-data models for relation, IPO, share-capital,
      dividend-factor, convertible-bond, ETF, and related instrument data.
- [ ] 4.2 Add TDX provider mappings for `get_relation`, `get_ipo_info`,
      `get_gb_info`, `get_gb_info_by_date`, and `get_divid_factors`.
- [ ] 4.3 Add TDX provider mappings for `get_kzz_info`, `get_cb_info`, and
      `get_trackzs_etf_info`.
- [ ] 4.4 Add normalized routes and tests for reference/instrument endpoints,
      including TDX native fixtures and QMT unsupported behavior.
- [ ] 4.5 Extend provider manifests and documentation for each reference and
      instrument-data family.

## 5. Normalize Phase 3 Finance And Report Data

- [ ] 5.1 Add normalized finance-data models for `get_financial_data` and
      `get_financial_data_by_date`.
- [ ] 5.2 Add normalized report and aggregate-data models for
      `get_gp_one_data`, `get_gpjy_value`, `get_gpjy_value_by_date`,
      `get_bkjy_value`, `get_bkjy_value_by_date`, `get_scjy_value`,
      `get_scjy_value_by_date`, and `get_report_data`.
- [ ] 5.3 Add TDX provider mappings, routes, fixtures, and error handling for
      finance/report endpoints.
- [ ] 5.4 Add QMT manifest entries and explicit unsupported tests for
      finance/report endpoints until QMT equivalents are implemented.
- [ ] 5.5 Extend runtime smoke checks with at least one lightweight finance or
      report probe that is stable outside trading hours.

## 6. Normalize Phase 4 Formula Data And Execution

- [ ] 6.1 Add normalized formula-data models for `formula_format_data`,
      `formula_set_data`, `formula_set_data_info`, `formula_get_data`,
      `formula_get_all`, and `formula_get_info`.
- [ ] 6.2 Add normalized formula-execution models for `formula_zb`,
      `formula_xg`, `formula_exp`, `formula_process_mul_zb`,
      `formula_process_mul_xg`, and `formula_process_mul_exp`.
- [ ] 6.3 Add execution limits, timeout handling, stable formula error codes,
      and request-size validation before exposing formula execution beyond
      operator smoke tests.
- [ ] 6.4 Add TDX provider mappings, routes, fixtures, and contract tests for
      formula data and execution.
- [ ] 6.5 Add QMT manifest entries and explicit unsupported tests for formula
      endpoints until QMT equivalents are implemented.

## 7. Keep Raw Calls And Trading Boundaries Safe

- [ ] 7.1 Document that `/v1/raw/tdx/call` is an operator/debug escape hatch and
      is not a stable backend dependency.
- [ ] 7.2 Add a backend-side guard test or static check that fails when normal
      Mist collection code starts depending on `/v1/raw/tdx/call`.
- [ ] 7.3 Add tests that trading/account method names are classified as
      do-not-expose in the coverage matrix.
- [ ] 7.4 Add tests that subscription methods are classified internal-only and
      remain reachable to NestJS only through normalized WebSocket commands.
- [ ] 7.5 Add tests that `get_real_time_data` remains classified as
      example-helper-not-api unless a native TDX runtime method is verified.
- [ ] 7.6 Add review notes for client-control and user-sector mutation methods
      so future work cannot accidentally productize them without a separate
      admin/operator or trading spec.

## 8. Align QMT Implementation Path

- [ ] 8.1 Compare current `src/adapter/qmt` methods with the provider-neutral
      capability family list and record the first parity target set.
- [ ] 8.2 Add QMT mock/provider tests for bars, sector membership, calendar,
      security metadata, reference data, finance/report data, formulas, and
      explicit unsupported responses.
- [ ] 8.3 Ensure shared datasource models do not include TDX-only field names in
      normalized public responses.
- [ ] 8.4 Add QMT alignment notes to each normalized endpoint docstring or
      coverage-row owner so future QMT implementation has a concrete mapping.
- [ ] 8.5 Keep QMT service startup optional in Windows runtime checks until QMT
      SDK path and login requirements are finalized.

## 9. Extend Smoke And Verification

- [x] 9.1 Update `scripts/run-runtime-checks.ps1` to include provider manifest
      validation and normalized phase-1 probes.
- [ ] 9.2 Add optional smoke flags for phase-2 reference/instrument probes,
      phase-3 finance/report probes, and phase-4 formula probes.
- [ ] 9.3 Keep runtime smoke checks validating native TDX HTTP shape before the
      corresponding normalized `/v1` shape.
- [ ] 9.4 Add fixture-based tests for documented TDX HTTP `Value` wrappers and
      any live-runtime variants captured during Windows smoke testing.
- [x] 9.5 Add test commands to the datasource verification docs for unit tests,
      integration tests, script self-tests, and Windows live runtime checks.
- [x] 9.6 Run `uv run pytest tests/unit` in `mist-datasource`.
- [x] 9.7 Run targeted integration tests for the TDX `/v1` routes and WebSocket
      bridge in `mist-datasource`.
- [ ] 9.8 Run `uv run ruff check src tests` in `mist-datasource`.
      Current run is blocked by existing QMT mock/adapter `ARG002` unused
      argument findings outside this change's touched files; touched-file ruff
      passes.
- [ ] 9.9 Run the Windows runtime smoke script against a logged-in TDX terminal
      after deployment.
