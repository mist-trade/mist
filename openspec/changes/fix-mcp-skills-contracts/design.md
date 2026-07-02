## Context

The Mist automation surface has two layers:

- NestJS MCP server tools under `apps/mcp-server`.
- Python `mist-skills` scripts used by AstrBot to call Mist REST endpoints.

The current MCP base class assumes caught values are always `Error` instances,
and Segment tools are registered even though they only throw placeholder
errors. The skills client assumes every successful backend envelope has a
`data` key, while several skill scripts duplicate the same request/argument
logic and handle connection/API errors inconsistently.

## Goals / Non-Goals

**Goals:**

- Normalize unknown MCP errors through one helper.
- Prevent unimplemented MCP tools from appearing as normal callable tools, or
  return a structured `not_implemented` response if they must remain visible.
- Make `MistClient` convert malformed success envelopes into `MistApiError`.
- Add shared skill runner helpers for simple POST scripts and K-line collect
  retry behavior.
- Add tests for each selected review item before implementation.

**Non-Goals:**

- Redesign the MCP protocol or replace `@rekog/mcp-nest`.
- Implement Segment algorithms.
- Repackage all skill scripts or remove all `sys.path.insert` usage.
- Add skills CI/lock/pyright changes; those belong to the infra child change.

## Decisions

### Decision 1: Normalize unknown errors at the MCP base boundary

`BaseMcpToolService` should convert any caught value into a safe string with a
local helper before logging or returning it. `McpError` codes remain the only
structured code path.

Alternative considered: require every tool implementation to catch unknown
values. That repeats the same risk and misses the shared base class.

### Decision 2: Hide or structure unimplemented tools

Segment tools should not be exposed as ordinary successful tools while they are
not implemented. Removing them from module providers is preferred; if exposure
must remain for compatibility, calls must return a structured not-implemented
MCP error.

Alternative considered: keep throwing human-readable placeholder text. That is
the exact contract break reported by the review.

### Decision 3: Skills client validates envelopes before indexing `data`

`MistClient._parse_response` should require `data` when `success` is true. A
missing key is a backend contract error and should raise `MistApiError` with a
stable message/code instead of leaking `KeyError`.

Alternative considered: return `None` for missing `data`. That hides backend
contract drift from callers.

### Decision 4: Shared runners first, packaging later

This change should create reusable runner helpers and migrate representative
duplicate scripts, but not solve package import structure in the same pass.
Tests should prove scripts call the shared runner path.

Alternative considered: convert the entire skills repo to a package layout.
That is useful later but too broad for this child change.

## Risks / Trade-offs

- Removing Segment provider registration could affect callers that discovered
  stub tools -> mitigate by testing module provider metadata and documenting
  that Segment is not implemented.
- Shared skills runners can obscure script-specific payload details -> keep
  runner API explicit: endpoint, code, period, dates, source.
- `MistApiError` for missing `data` may surface backend bugs earlier -> this is
  intended and should be covered by tests.

## Migration Plan

1. Add red tests for MCP unknown errors and Segment stub visibility.
2. Add red tests for `MistClient` missing `data` and shared runner usage.
3. Implement MCP base helper and Segment stub handling.
4. Implement skills client validation and shared runners.
5. Run MCP targeted tests, skills pytest, lint/typecheck, and OpenSpec
   validation.
