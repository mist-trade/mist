## Context

The backend repository still contains a NestJS `apps/mcp-server` application,
MCP-specific dependencies, Docker Compose runtime configuration, package
scripts, Jest tests, and active OpenSpec requirements. The supported
agent-facing integration has moved to `mist-skills`, which calls Mist REST APIs
directly and is tested as a separate Python skills package.

The worktree already contains unrelated OpenSpec archive moves from the prior
task. This change will layer on top of them without reverting that work.

## Goals / Non-Goals

**Goals:**

- Remove the MCP server runtime and source code from the active backend
  repository.
- Remove MCP-only package dependencies, build targets, Docker services, docs,
  and active CI contract checks.
- Update active OpenSpec specs so they describe the skills-only integration
  reality.
- Add repository guard tests that fail if MCP server runtime entries return.

**Non-Goals:**

- Changing `mist-skills` behavior or its repository layout.
- Rewriting historical archived evidence or old review reports.
- Replacing MCP with another protocol surface.

## Decisions

1. **Delete rather than soft-deprecate.**
   The user selected full deletion. This avoids continuing to maintain dead app
   code, MCP dependencies, and tests for a runtime that has been replaced by
   skills.

2. **Keep historical archives unchanged.**
   Archived OpenSpec changes and review reports remain audit records. Current
   specs, docs, and code will describe the active state.

3. **Use tests as deletion guards.**
   A repository-level Jest test will assert that MCP app directories,
   package/nest/docker runtime entries, and MCP-only constants are absent. The
   existing CI contract script will also be updated to check for absence instead
   of style constraints inside deleted MCP files.

4. **Keep product backend services intact.**
   The `mist` and `chan` Nest apps remain buildable and runnable. The
   `mist-skills` repository remains the supported external AI/robot tool path.

## Risks / Trade-offs

- MCP clients that still expect `mist-mcp` will break. Mitigation: docs point to
  `mist-skills` and no compatibility shim is provided because the runtime is
  intentionally retired.
- Removing MCP dependencies may expose implicit imports. Mitigation: run
  targeted Jest, typecheck, build, and OpenSpec validation.
- Active review specs can become stale if only code is deleted. Mitigation:
  update or remove the MCP-specific active requirements in the same change.
