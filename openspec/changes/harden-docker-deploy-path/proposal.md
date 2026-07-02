## Why

The current Docker/deploy path still has several review-confirmed gaps: the
backend image runs as root, production dependency installation is duplicated,
the MCP compose command uses a development entrypoint, deployment image tags
default to mutable `latest`, and rollback does not remember the last successful
tags. These issues make production releases harder to reproduce and harder to
recover when a rollout fails.

## What Changes

- Select review IDs INFRA D1, D2, D3, D4, D5, D6, D8, S5 and CODE_REVIEW L14.
- Harden the backend Dockerfile so the production stage runs as a non-root user,
  uses a configurable npm registry, uses pnpm cache mounts correctly, and copies
  one dependency tree from the builder stage.
- Remove the unused backend `docker-start.sh` path and make the active
  entrypoint use strict shell options.
- Add backend Docker configuration tests for Dockerfile, `.dockerignore`,
  compose, and entrypoint behavior.
- Update `docker-compose.yml` so `mcp-server` uses the compiled production
  command.
- Update `mist-deploy` defaults and tests so production deployment requires
  explicit image tags instead of defaulting backend/frontend images to `latest`.
- Persist last successful backend/frontend image tags under the Docker root and
  use them as rollback fallback when explicit previous tags are not supplied.
- Keep the Windows runner nginx mirror strategy, but document and test the image
  source boundary for `WEB_GATEWAY_IMAGE` instead of pretending it is pinned by
  default.

## Capabilities

### New Capabilities

- `backend-container-image`: Backend Docker image build/runtime requirements for
  non-root execution, deterministic dependency flow, configurable registries,
  strict entrypoint behavior, and production compose commands.

### Modified Capabilities

- `windows-docker-appliance`: Deployment requirements for immutable app image
  tags, recorded successful tags, rollback fallback, diagnostics isolation, and
  nginx gateway image-source policy.

## Impact

- Affected repositories:
  - `mist`
  - `mist-deploy`
- Affected `mist` areas:
  - `Dockerfile`
  - `.dockerignore`
  - `docker-compose.yml`
  - `docker-entrypoint.sh`
  - `docker-start.sh`
  - backend Docker config tests
- Affected `mist-deploy` areas:
  - `.github/workflows/deploy-windows-docker-appliance.yml`
  - `docker/.env.example`
  - `docker/compose.yaml`
  - `README.md`
  - `scripts/deploy-docker-appliance.ps1`
  - deployment script/config tests
- Runtime impact:
  - No API behavior change.
  - Backend containers run as a non-root user.
  - Production deploys must provide explicit backend/frontend image tags; `latest`
    remains a Docker Compose fallback only for local/manual env files.
  - Failed app rollouts can fall back to recorded successful tags when explicit
    previous tags are not provided.
