## 1. Red Tests

- [x] 1.1 Add a repository guard test proving MCP server app/config/runtime
      entries must be absent.
- [x] 1.2 Run the guard test before deletion and verify it fails because the MCP
      server still exists.

## 2. Remove Runtime Surface

- [x] 2.1 Delete `apps/mcp-server`.
- [x] 2.2 Delete MCP-only constants and tests.
- [x] 2.3 Remove MCP server entries from `package.json`, `pnpm-lock.yaml`, and
      `nest-cli.json`.
- [x] 2.4 Remove the `mcp-server` Docker Compose service and MCP runtime
      comments/ports.

## 3. Update Tests, Contracts, And Docs

- [x] 3.1 Update backend Docker/runtime config tests for no MCP service.
- [x] 3.2 Update `tools/test-ci-contracts.mjs` so it guards MCP absence instead
      of inspecting deleted MCP files.
- [x] 3.3 Update README/CLAUDE/release-note text to point to `mist-skills`
      instead of MCP Server.
- [x] 3.4 Update active OpenSpec specs by deleting `mcp-tool-contracts` and
      removing stale MCP scenarios from current specs.

## 4. Verification

- [x] 4.1 Run targeted Jest tests for repository guard and Docker/runtime
      config.
- [x] 4.2 Run `node tools/test-ci-contracts.mjs`.
- [x] 4.3 Run `pnpm run typecheck`.
- [x] 4.4 Run `pnpm run build:docker`.
- [x] 4.5 Run `openspec validate --all --strict`.
