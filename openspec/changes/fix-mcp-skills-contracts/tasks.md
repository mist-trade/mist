# Tasks: Fix MCP and skills contracts

## 1. Select Scope And Baseline

- [x] 1.1 Record selected review IDs: CODE_REVIEW C6, C8, C9; CODE_SMELL
      D1.5, T1.4, T1.6, P4.1, P4.2, D4.2, U4.1.
- [x] 1.2 Inspect current MCP base service, Segment service registration,
      MCP tests, skills client, skill scripts, and skills tests before editing.
- [x] 1.3 Identify targeted tests for unknown MCP errors, unimplemented tool
      registration, missing `data` envelopes, shared runners, and script
      entrypoint error handling.

## 2. Add Failing Tests First

- [x] 2.1 Add MCP base tests proving string/object/null throws return stable
      error responses without secondary crashes.
- [x] 2.2 Add MCP tests proving `McpError` code/recovery behavior is preserved.
- [x] 2.3 Add MCP module or service tests proving Segment placeholder tools are
      not exposed as ordinary registered tools, or return structured
      `not_implemented`.
- [x] 2.4 Add skills client tests proving `success: true` without `data`
      raises `MistApiError`.
- [x] 2.5 Add skills shared runner tests proving simple POST scripts call the
      shared runner path and preserve endpoint/body behavior.
- [x] 2.6 Add skills K-line runner tests proving intraday/daily collect-retry
      logic is shared and period-specific bodies remain correct.
- [x] 2.7 Add script entrypoint tests proving `MistConnectionError` and
      `MistApiError` are caught and printed consistently.
- [x] 2.8 Run targeted tests and confirm the new assertions fail for intended
      reasons before implementation.

## 3. Implement MCP Contract Fixes

- [x] 3.1 Add a shared unknown error message helper in the MCP base layer.
- [x] 3.2 Update `BaseMcpToolService` to use unknown-safe logging and error
      responses with `Record<string, unknown>` metadata types.
- [x] 3.3 Remove Segment placeholder tool registration or convert placeholder
      calls to structured `not_implemented` errors.
- [x] 3.4 Remove stale eslint-disable comments that only existed for unused
      Segment schemas.

## 4. Implement Skills Contract Fixes

- [x] 4.1 Update `MistClient._parse_response` to raise `MistApiError` when a
      successful envelope lacks `data`.
- [x] 4.2 Add shared script runner helpers for simple POST scripts and
      consistent CLI exception handling.
- [x] 4.3 Refactor technical indicator and Chan scripts to use the shared
      simple POST runner while preserving endpoints and bodies.
- [x] 4.4 Add shared K-line collect/retry helpers and refactor intraday/daily
      scripts to use them.
- [x] 4.5 Keep package/import restructuring out of this change unless required
      for the shared runner tests.

## 5. Verify And Record Evidence

- [x] 5.1 Run targeted MCP tests in `mist`.
- [x] 5.2 Run `pnpm run lint:check`, `pnpm run typecheck`, and relevant MCP
      test suites in `mist`.
- [x] 5.3 Run targeted `mist-skills` tests.
- [x] 5.4 Run full `mist-skills` pytest.
- [x] 5.5 Run `openspec validate fix-mcp-skills-contracts --strict`.
- [x] 5.6 Record `review-id -> changed files -> test/verification command` in
      `evidence.md`.
- [x] 5.7 Update the parent `stabilize-review-remediation` tasks after this
      child change is created and verified.
