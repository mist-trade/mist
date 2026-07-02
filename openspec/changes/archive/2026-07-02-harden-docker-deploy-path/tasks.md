# Tasks: Harden Docker deploy path

## 1. Select Scope And Baseline

- [x] 1.1 Record selected review IDs: INFRA D1, D2, D3, D4, D5, D6, D8,
      S5; CODE_REVIEW L14.
- [x] 1.2 Inspect current `mist` Dockerfile, `.dockerignore`,
      `docker-entrypoint.sh`, `docker-start.sh`, `docker-compose.yml`, and
      `package.json` before editing.
- [x] 1.3 Inspect current `mist-deploy` workflow, compose/env templates,
      README, deploy script, and script self-tests before editing.
- [x] 1.4 Identify targeted tests/substitute verification for backend Docker
      config, deploy workflow config, compose config, rollback, and gateway
      image policy.

## 2. Add Failing Tests First

- [x] 2.1 Add a backend Docker config test proving the Dockerfile creates and
      uses a non-root app user.
- [x] 2.2 Add a backend Docker config test proving pnpm cache uses the pnpm
      store and the runtime stage does not reinstall production dependencies
      or copy only `.pnpm`.
- [x] 2.3 Add a backend Docker config test proving `NPM_REGISTRY` is
      configurable and `npmmirror` is not hard-coded.
- [x] 2.4 Add a backend Docker config test proving `.dockerignore` excludes
      non-runtime artifacts while keeping migration runner inputs.
- [x] 2.5 Add a backend Docker config test proving the active entrypoint is
      strict and `docker-start.sh` is absent.
- [x] 2.6 Add a backend Docker config test proving local `mcp-server` compose
      uses the compiled command and `build:docker` compiles `mcp-server`.
- [x] 2.7 Update `mist-deploy` PowerShell tests so default app tags are not
      `latest`, deploy history is expected, rollback falls back to recorded
      tags, diagnostics is safe, and gateway image policy is explicit.
- [x] 2.8 Run targeted tests and confirm the new assertions fail for the
      intended reasons before implementation.

## 3. Implement Backend Image Hardening

- [x] 3.1 Update `Dockerfile` to use configurable `NPM_REGISTRY`, pnpm store
      cache mounts, builder-only dependency install, runtime non-root user, and
      copied builder `node_modules`.
- [x] 3.2 Update `package.json` so `build:docker` builds `mist`, `chan`, and
      `mcp-server`.
- [x] 3.3 Update `.dockerignore` to reduce build context while preserving
      `tools/run-migrations.mjs` and `deploy/database` migrations.
- [x] 3.4 Update `docker-entrypoint.sh` to strict shell options and safe env
      logging.
- [x] 3.5 Remove the unused `docker-start.sh` wrapper and remove it from the
      Dockerfile image path.
- [x] 3.6 Update local `docker-compose.yml` so `mcp-server` runs
      `node dist/apps/mcp-server/main.js`.
- [x] 3.7 Update `apps/mcp-server/tsconfig.app.json` so Docker production
      builds exclude `*.spec.ts` files.
- [x] 3.8 Update `apps/mcp-server/.eslintrc.js` so the app lint context can
      resolve spec files through `tsconfig.spec.json`.

## 4. Implement Deploy Path Hardening

- [x] 4.1 Update `deploy-windows-docker-appliance.yml` so backend/frontend app
      image tag inputs are explicit and do not default to `latest`.
- [x] 4.2 Update `deploy-docker-appliance.ps1` to validate backend/frontend app
      tags and reject blank or `latest` tags.
- [x] 4.3 Add deploy-history helpers to persist last successful backend and
      frontend app tags under the Docker root.
- [x] 4.4 Update rollback to prefer explicit previous tags, then deploy-history
      tags, and avoid restarting app services when no rollback tags exist.
- [x] 4.5 Wrap diagnostics collection so diagnostics failures warn but do not
      block rollback or mask the original deployment error.
- [x] 4.6 Update `mist-deploy` compose/env/docs/tests for gateway image-source
      policy and explicit app-tag behavior.

## 5. Verify And Record Evidence

- [x] 5.1 Run the targeted backend Docker config tests in `mist`.
- [x] 5.2 Run `pnpm run lint:check` in `mist`.
- [x] 5.3 Run `pnpm run typecheck` in `mist`.
- [x] 5.4 Run `pnpm run test:ci` in `mist`.
- [x] 5.5 Run targeted PowerShell deploy tests in `mist-deploy`.
- [x] 5.6 Run all relevant `mist-deploy` script/config tests.
- [x] 5.7 Run `openspec validate harden-docker-deploy-path --strict`.
- [x] 5.8 Record `review-id -> changed files -> test/verification command` in
      `evidence.md`.
- [x] 5.9 Update the parent `stabilize-review-remediation` tasks after this
      child change is created and verified.
- [x] 5.10 Run `pnpm run build:docker` in `mist` to verify the Docker build
      entrypoint compiles `mist`, `chan`, and `mcp-server`.
