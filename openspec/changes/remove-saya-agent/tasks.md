## 1. Inventory Saya Usage

- [x] 1.1 Record current `mist` git status before deletion.
- [x] 1.2 Inventory current `Saya`/`saya` references in source, config, scripts,
      docs, and OpenSpec current specs.
- [x] 1.3 Inventory `@langchain`, `@app/prompts`, `agentsConfig`, and
      `sayaEnvSchema` imports outside `apps/saya`.

## 2. Remove Saya Runtime Surface

- [x] 2.1 Remove `apps/saya` source, tests, README, and app tsconfig.
- [x] 2.2 Remove the `saya` project from `nest-cli.json`.
- [x] 2.3 Remove Saya run scripts from `package.json`.
- [x] 2.4 Remove Saya-only config exports and validation schema.
- [x] 2.5 Remove Saya-only prompt library files and project aliases when no
      supported app imports them.

## 3. Remove Saya-Only Dependencies

- [x] 3.1 Remove LangChain/DeepSeek dependencies if no supported source imports
      them.
- [x] 3.2 Regenerate package lock metadata after dependency changes.

## 4. Update Current Documentation

- [x] 4.1 Update `README.md` so the current architecture omits Saya and points
      AI-facing usage at `mist-skills`/AstrBot and MCP where relevant.
- [x] 4.2 Update `Roadmap.md` to remove Saya as the active agent runtime and
      describe strategy/alert work as future deterministic backend work.
- [x] 4.3 Scan current docs/specs for active Saya setup claims and remove or
      rewrite them while preserving archived historical records.

## 5. Verify Cleanup

- [x] 5.1 Run reference scans for `Saya`, `saya`, `LangChain`, `LangGraph`,
      `DeepSeek`, `@langchain`, `@app/prompts`, `agentsConfig`, and
      `sayaEnvSchema`.
- [x] 5.2 Validate the OpenSpec change with strict validation.
- [x] 5.3 Run package/project verification covering Nest project metadata and
      package lock consistency.
- [x] 5.4 Update this task list with completed checkboxes.
