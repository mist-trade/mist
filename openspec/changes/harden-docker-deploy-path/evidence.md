# Evidence: Harden Docker deploy path

## Review IDs

| Review ID | Changed files | Evidence |
| --- | --- | --- |
| INFRA D1 | `mist/Dockerfile`, `mist/apps/mist/src/docker-runtime-config.spec.ts` | Added a red test proving the runtime stage must create and switch to a non-root app user. Updated Dockerfile runtime stage with `addgroup`, `adduser`, `--chown=app:app`, and `USER app`. |
| INFRA D2 | `mist/Dockerfile`, `mist/apps/mist/src/docker-runtime-config.spec.ts` | Added a red test proving pnpm cache uses the pnpm store, runtime dependencies come from builder `node_modules`, and runtime does not run `pnpm install --prod` or copy only `.pnpm`. |
| INFRA D3 | `mist/docker-compose.yml`, `mist/package.json`, `mist/apps/mcp-server/tsconfig.app.json`, `mist/apps/mcp-server/.eslintrc.js`, `mist/apps/mist/src/docker-runtime-config.spec.ts` | Added a red test proving local `mcp-server` compose uses `node dist/apps/mcp-server/main.js`, `build:docker` compiles `mcp-server`, the mcp-server app build excludes spec files, and lint can resolve app specs through the spec tsconfig. |
| INFRA D4 | `mist/Dockerfile`, `mist/apps/mist/src/docker-runtime-config.spec.ts` | Added a red test proving `NPM_REGISTRY` defaults to `https://registry.npmjs.org` and `npmmirror` is not hard-coded. |
| INFRA D5 | `mist/.dockerignore`, `mist/apps/mist/src/docker-runtime-config.spec.ts` | Added a red test proving generated/non-runtime paths are excluded while `tools/run-migrations.mjs` and `deploy/database` remain available. |
| INFRA D6 | `mist-deploy/.github/workflows/deploy-windows-docker-appliance.yml`, `mist-deploy/docker/compose.yaml`, `mist-deploy/docker/.env.example`, `mist-deploy/scripts/deploy-docker-appliance.ps1`, `mist-deploy/scripts/test-workflow-config.ps1`, `mist-deploy/scripts/test-docker-compose-config.ps1`, `mist-deploy/scripts/test-deploy-docker-appliance.ps1`, `mist-deploy/README.md` | Added red tests proving workflow app tags have no `latest` default, compose app images require explicit tags, and the deploy script rejects blank or `latest` tags. |
| INFRA D8 | `mist/docker-entrypoint.sh`, `mist/docker-start.sh`, `mist/Dockerfile`, `mist/apps/mist/src/docker-runtime-config.spec.ts` | Added a red test proving the active entrypoint uses `set -euo pipefail`, optional env logging is safe with `set -u`, and the unused `docker-start.sh` wrapper is absent. |
| INFRA S5 | `mist-deploy/scripts/deploy-docker-appliance.ps1`, `mist-deploy/scripts/test-deploy-docker-appliance.ps1`, `mist-deploy/README.md` | Added red tests proving deploy history is recorded/read, rollback prefers explicit previous tags then recorded successful tags, no-tag rollback skips app restart, and diagnostics are non-fatal in failure flow. |
| CODE_REVIEW L14 | `mist-deploy/docker/.env.example`, `mist-deploy/docker/compose.yaml`, `mist-deploy/scripts/test-docker-compose-config.ps1`, `mist-deploy/README.md` | Kept the Windows runner nginx mirror default configurable, added env/docs policy text, and added tests that the gateway image is passed through from `WEB_GATEWAY_IMAGE`. |

## Red Test Evidence

- `pnpm exec jest docker-runtime-config --runInBand --watchman=false` failed before implementation because:
  - Dockerfile had no non-root runtime user;
  - pnpm cache targeted `/root/.npm`;
  - runtime stage reinstalled production dependencies and copied only `.pnpm`;
  - `NPM_REGISTRY` was missing and `npmmirror` was hard-coded;
  - `.dockerignore` lacked the selected exclusions/allowlist;
  - `docker-entrypoint.sh` used only `set -e` and `docker-start.sh` existed;
  - local `mcp-server` compose used `pnpm run start:dev:mcp-server`.
- After adding `mcp-server` to `build:docker`, `pnpm run build:docker` failed
  because `apps/mcp-server/tsconfig.app.json` included `*.spec.ts` files in the
  production app build.
- The mcp-server tsconfig guard in `docker-runtime-config.spec.ts` failed before
  fixing that exclusion.
- After excluding mcp-server spec files from the production build,
  `pnpm run lint:check` failed because the app ESLint config only pointed at
  `tsconfig.app.json`; the ESLint project guard failed before adding
  `tsconfig.spec.json`.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-docker-appliance.ps1` failed before implementation because script defaults were `latest`.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-workflow-config.ps1` failed before implementation because workflow app tag inputs still had defaults.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-compose-config.ps1` failed before implementation because compose app image tags defaulted to `latest`.

## Green Verification

- `pnpm exec jest docker-runtime-config --runInBand --watchman=false` -> 1 suite passed, 6 tests passed.
- `pnpm run lint:check` -> passed.
- `pnpm run typecheck` -> passed.
- `pnpm run test:ci` -> 55 suites passed, 455 tests passed.
- `pnpm run build:docker` -> `mist`, `chan`, and `mcp-server` webpack builds
  passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-docker-appliance.ps1` -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-compose-config.ps1` -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-workflow-config.ps1` -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-appliance-diagnostics.ps1` -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-health-check-docker-appliance.ps1` -> passed.
