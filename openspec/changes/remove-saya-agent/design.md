## Context

The supported AI-facing path is now AstrBot loading `mist-skills`, with those
skills calling Mist REST endpoints for data, indicators, and Chan Theory. The
legacy `apps/saya` service still appears in Nest project configuration, npm
scripts, documentation, app-specific config, prompt templates, and dependencies,
but it is not part of the current deployment or AstrBot path.

## Goals / Non-Goals

**Goals:**

- Remove the obsolete Saya application and the first-order repository references
  that make it look runnable or supported.
- Keep `mist-skills` as the agent-facing integration layer.
- Remove dependencies that were only needed by Saya after import checks confirm
  no supported app still uses them.
- Leave the Mist REST API, `mcp-server`, datasource, schedule, Chan, frontend,
  and Windows appliance flows intact.
- Make verification proportional to the changed surface: static reference
  checks, package/install consistency checks, and targeted build/test commands.

**Non-Goals:**

- Replacing Saya with a new backend AI workflow.
- Changing AstrBot skill behavior or adding proactive alerts.
- Removing `mcp-server`; it is a separate supported integration surface.
- Reworking strategy, backtest, datasource, or Windows deployment behavior.

## Decisions

1. Delete Saya as a tracked application instead of leaving a stub.

   Keeping an empty `apps/saya` stub would preserve old entrypoints but continue
   to advertise an unsupported path. Removing the project registration and run
   script makes unsupported usage fail at the repository boundary.

2. Remove Saya-only shared libraries/config with import verification.

   `libs/prompts` and `libs/config/src/agents.config.ts` were built for Saya's
   role orchestration. They should be removed only after `rg` confirms no
   supported application imports `@app/prompts`, `agentsConfig`, or
   `sayaEnvSchema`.

3. Keep documentation forward-looking rather than preserving historical agent
   plans.

   README and Roadmap should describe the current shape: Mist backend plus
   datasource plus `mist-skills`/AstrBot. Historical Saya architecture details
   can be removed or rewritten as obsolete context.

4. Validate with dependency and app-level checks.

   After removal, run package-manager consistency checks and the smallest
   backend verification that exercises Nest project metadata. A successful
   `pnpm install --lockfile-only` or equivalent is needed if dependencies are
   removed from `package.json`; otherwise package files drift.

## Risks / Trade-offs

- Removing LangChain dependencies could break hidden imports outside the normal
  source tree -> mitigate with repo-wide `rg` before and after editing.
- Documentation may still mention old "AI multi-agent" claims -> mitigate with
  reference scans for `Saya`, `saya`, `LangChain`, `LangGraph`, and agent-role
  wording.
- Package lock updates can be noisy -> limit dependency removal to packages that
  are confirmed Saya-only and verify the generated lockfile.
- Existing archived OpenSpec changes will still mention Saya historically -> keep
  archived records intact unless they advertise current behavior.
