## Why

Saya was the earlier NestJS AI-agent application, but the current QQ/AstrBot
integration is specified to use `mist-skills` directly against the Mist REST API.
Keeping both paths makes the repository and deployment story harder to reason
about, and risks reviving an unused agent layer.

## What Changes

- **BREAKING** Remove the `apps/saya` Nest application and its direct run/test
  entrypoints.
- Remove Saya-specific project registration, environment validation, agent LLM
  config, and prompt-template exports that are no longer used by supported
  runtime paths.
- Update docs and roadmap wording so the supported AI-facing integration is
  `mist-skills` plus AstrBot, not Saya.
- Keep `mist-skills`, Mist REST endpoints, `mcp-server`, indicators, Chan Theory,
  datasource, scheduler, and Windows appliance flows intact.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `astrbot-integration`: clarify that the supported agent-facing integration
  path is `mist-skills`, and Saya is not a runtime or fallback requirement.
- `repository-cleanup`: define safe tracked removal criteria for the obsolete
  Saya app and related configuration/docs.

## Impact

- Affected code: `apps/saya`, `nest-cli.json`, `package.json`,
  `libs/config`, `libs/prompts`, README/Roadmap docs, and tests that only cover
  Saya internals.
- Affected dependencies: LangChain/LangGraph/DeepSeek dependencies may be
  removed only if no remaining supported app imports them.
- Unaffected systems: `mist`, `chan`, `schedule`, `mcp-server`, `mist-skills`,
  `mist-datasource`, and deployment scripts.
