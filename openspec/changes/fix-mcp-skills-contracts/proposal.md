## Why

The review found two adjacent contract risks: MCP tools can expose stubs or
crash on non-`Error` throws, and `mist-skills` scripts can crash or diverge
when backend envelopes or connection errors vary. These are user-facing
automation paths, so the fixes need targeted tests before broader cleanup.

## What Changes

- Select review IDs CODE_REVIEW C6, C8, C9 and CODE_SMELL D1.5, T1.4, T1.6,
  P4.1, P4.2, D4.2, U4.1.
- Normalize unknown MCP tool errors through a shared helper instead of reading
  `error.message` directly.
- Ensure unimplemented MCP tools are not exposed as callable stubs or return a
  structured `not_implemented` error.
- Ensure `mist-skills` treats successful backend envelopes without `data` as a
  `MistApiError`, not a `KeyError`.
- Add shared `mist-skills` runner helpers for simple indicator/Chan POST
  scripts and shared K-line collect/retry behavior.
- Add tests for MCP error handling, stub visibility, skills response parsing,
  connection-error handling, and shared runner behavior.

## Capabilities

### New Capabilities

- `mcp-tool-contracts`: MCP server tool registration, error normalization, and
  not-implemented behavior.

### Modified Capabilities

- `astrbot-integration`: strengthen `mist-skills` response parsing and script
  runner requirements.

## Impact

- Affected repositories:
  - `mist`
  - `mist-skills`
- Affected code areas:
  - `apps/mcp-server/src/base/base-mcp-tool.service.ts`
  - `apps/mcp-server/src/services/segment-mcp.service.ts`
  - MCP service tests
  - `mist-skills/shared/mist_client.py`
  - `mist-skills/shared/*runner*.py`
  - `mist-skills/skills/**/scripts/*.py`
  - `mist-skills/tests`
- Runtime topology impact:
  - No deployment topology change. This only hardens MCP and AstrBot-facing
    skill contracts.
