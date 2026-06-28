# Change: Integrate deployed NapCat-AstrBot with mist-skills

## Why

The project needs a clear chat integration path for the deployed Docker-based
NapCat-AstrBot stack. The earlier Saya path is no longer needed for this goal.

The existing `mist-skills` repository already implements the right integration
shape: AstrBot loads Skills, the Skills call the Mist REST API, and Mist keeps
all market data and analysis logic centralized.

## What changes

- Use NapCat-AstrBot as the QQ/IM runtime and message entrypoint.
- Use `mist-skills` as the AstrBot Skill source.
- Configure the AstrBot container with `MIST_API_BASE_URL` so Skills can reach
  the Mist backend.
- Stabilize the REST API contract used by Skills, especially `period` values.
- Add an operator-facing smoke-test path for Docker network, Skill loading, and
  backend API readiness.
- Keep Saya out of the integration path.

## Non-goals

- Rebuilding the stock analysis logic inside AstrBot.
- Replacing the Mist REST API with MCP for AstrBot.
- Reworking the existing MCP server.
- Implementing proactive alert push in the first phase.
- Implementing or maintaining Saya for this integration.
- Changing data collector strategy behavior unless it blocks the Skill queries.

## Expected outcome

After this change, a QQ user can ask AstrBot market-data or analysis questions.
AstrBot invokes the relevant `mist-skills` script, the script calls the Mist
backend, and AstrBot sends the analysis result back through NapCat.

## Impacted areas

- `mist-skills`: configuration, docs, script compatibility, and smoke tests.
- `mist` backend: REST API compatibility for Skill calls.
- Docker deployment: network and environment configuration for AstrBot.
- Operations docs: runbook for starting, checking, and debugging the path.

## Open questions

- Is the Mist backend deployed in Docker with AstrBot, or does AstrBot reach it
  through the host machine?
- Should friendly periods such as `daily` and `5min` be normalized in the
  backend or translated inside `mist-skills`?
- Should the first public bot experience be command-like, natural language, or
  both?
- Which QQ groups or private chats should be allowed to use the market-analysis
  commands?
