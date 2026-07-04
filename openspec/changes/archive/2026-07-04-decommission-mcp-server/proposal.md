## Why

Mist no longer needs a standalone NestJS MCP server because the supported
agent-facing tool path has moved to `mist-skills`. Keeping the MCP app, Docker
service, package scripts, dependencies, and active specs creates dead code and
keeps obsolete review contracts alive.

## What Changes

- **BREAKING**: Remove the `apps/mcp-server` NestJS application and the
  `mist-mcp` package binary.
- Remove MCP server build, debug, development, Docker Compose, and CI contract
  references from the active backend repository.
- Remove MCP-only dependencies and MCP error constants/tests from the backend
  package.
- Update backend docs so the supported AI/robot integration path is
  `mist-skills`.
- Remove active OpenSpec requirements that only describe MCP server behavior.
- Keep archived OpenSpec evidence unchanged for historical auditability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `astrbot-integration`: clarify that `mist-skills` is the only supported
  agent/bot tool integration path.
- `backend-container-image`: remove local Docker Compose and image-build
  requirements for `mcp-server`.
- `mcp-tool-contracts`: retire this capability because the MCP server is no
  longer a supported runtime surface.
- `review-p2-backend-runtime-sweep`: retire MCP-specific review scenarios that
  no longer apply after the app is deleted.
- `review-p3-backend-quick-wins`: retire MCP-specific cleanup scenarios that no
  longer apply after the app is deleted.

## Impact

- `apps/mcp-server`, MCP service tests, MCP README, and MCP-only constants.
- `package.json`, `pnpm-lock.yaml`, `nest-cli.json`, `docker-compose.yml`, and
  Docker/runtime config tests.
- Repository docs such as `README.md` and `CLAUDE.md`.
- `tools/test-ci-contracts.mjs` MCP guard sections.
- Active OpenSpec specs under `openspec/specs/`.
