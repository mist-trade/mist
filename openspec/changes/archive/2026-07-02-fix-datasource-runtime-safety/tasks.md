# Tasks: Fix datasource runtime safety

## 1. Select Scope And Baseline

- [x] 1.1 Record selected review IDs: CODE_REVIEW C2, C3, C4; CODE_SMELL
      D2.6, U2.3, F2.1, F2.2.
- [x] 1.2 Inspect current TDX/QMT provider, subscription, callback, and native
      response lookup code paths before editing.
- [x] 1.3 Identify the smallest targeted test files for async SDK isolation,
      callback loop handoff, dirty-symbol serialization, unsupported
      subscription capabilities, and native symbol lookup.

## 2. Add Failing Tests First

- [x] 2.1 Add or update a unit test proving blocking provider work does not run
      directly on the event loop for C2.
- [x] 2.2 Add or update a unit test proving SDK callbacks use a captured running
      loop and thread-safe handoff for C3.
- [x] 2.3 Add or update a unit test proving dirty-symbol state is mutated and
      deduplicated on the loop side for C4.
- [x] 2.4 Add or update a unit test proving unsupported `subscribe_quote`
      returns a stable capability error for D2.6.
- [x] 2.5 Add or update a unit test proving native response lookup fails when
      the requested symbol is missing for F2.1/F2.2.
- [x] 2.6 Add or update a unit or contract test for WSMessage usage or document
      any U2.3 residue that must move to `align-datasource-ws-contract`.
- [x] 2.7 Run the targeted tests and confirm the new assertions fail for the
      intended reason before implementation.

## 3. Implement Runtime Safety Fixes

- [x] 3.1 Move blocking provider work behind `asyncio.to_thread`, a dedicated
      executor, or an equivalent async-safe helper.
- [x] 3.2 Capture the running event loop during subscription startup and remove
      callback-thread `asyncio.get_event_loop()` usage.
- [x] 3.3 Route callback dirty-symbol updates through loop-side queueing or
      thread-safe scheduling.
- [x] 3.4 Make unsupported subscription paths raise structured capability
      errors instead of ambiguous stubs.
- [x] 3.5 Make native response lookup symbol-strict and remove broad values
      fallback for missing requested symbols.
- [x] 3.6 Keep provider quirks behind datasource code and preserve normalized
      product-facing routes.

## 4. Verify And Record Evidence

- [x] 4.1 Run the targeted unit tests added in this change.
- [x] 4.2 Run `env UV_CACHE_DIR=.uv-cache uv run ruff check .` in
      `mist-datasource`.
- [x] 4.3 Run `env UV_CACHE_DIR=.uv-cache uv run pytest -m "not live"` in
      `mist-datasource`.
- [x] 4.4 Run `openspec validate fix-datasource-runtime-safety --strict`.
- [x] 4.5 Record `review-id -> changed files -> test/verification command` in
      `evidence.md`.
- [x] 4.6 Update the parent `stabilize-review-remediation` tasks after this
      child change is created and verified.
