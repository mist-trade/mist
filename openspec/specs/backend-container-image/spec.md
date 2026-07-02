# backend-container-image Specification

## Purpose
TBD - created by archiving change harden-docker-deploy-path. Update Purpose after archive.
## Requirements
### Requirement: Backend runtime image runs as non-root

The backend Docker image SHALL run application processes as a dedicated
non-root user in the production stage.

#### Scenario: Runtime container starts application

- **WHEN** the backend Docker image starts the default Mist application command
- **THEN** the active Dockerfile stage MUST create an app user and group
- **AND** runtime files copied into `/app` MUST be owned by that app user
- **AND** the Dockerfile MUST switch to that app user before `ENTRYPOINT` and
  `CMD`

### Requirement: Backend dependencies have one runtime source

The backend Docker image SHALL install dependencies once through the builder
stage and SHALL NOT run a second production dependency install in the runtime
stage.

#### Scenario: Backend image is built

- **WHEN** the Dockerfile installs Node dependencies
- **THEN** pnpm cache mounts MUST target the pnpm store rather than the npm cache
- **AND** the runtime stage MUST copy the installed `node_modules` tree from the
  builder stage
- **AND** the runtime stage MUST NOT run `pnpm install --prod`
- **AND** the runtime stage MUST NOT copy only `node_modules/.pnpm`

### Requirement: Backend npm registry is configurable

The backend Docker build SHALL allow registry selection through a build
argument and SHALL default to the official npm registry.

#### Scenario: Builder installs dependencies

- **WHEN** no registry override is supplied to `docker build`
- **THEN** dependency installation MUST use `https://registry.npmjs.org`
- **AND** the Dockerfile MUST NOT hard-code `https://registry.npmmirror.com`
  as the only registry option

### Requirement: Backend Docker context excludes non-runtime artifacts

The backend Docker context SHALL exclude generated or non-runtime repository
artifacts while keeping migration files required by the production image.

#### Scenario: Docker build context is prepared

- **WHEN** Docker applies `.dockerignore`
- **THEN** generated `dist`, `coverage`, `test-results`, `test-data`, OpenSpec,
  local Codex/Claude metadata, docs, and unrelated deploy artifacts MUST be
  excluded
- **AND** `tools/run-migrations.mjs` MUST remain available to the image
- **AND** `deploy/database` migration files MUST remain available to the image

### Requirement: Backend entrypoint is strict and singular

The backend Docker image SHALL use one active entrypoint script with strict
shell failure behavior.

#### Scenario: Runtime command is launched

- **WHEN** the container starts
- **THEN** the active entrypoint MUST enable `set -euo pipefail`
- **AND** it MUST tolerate missing optional environment variables in log output
- **AND** there MUST NOT be an unused `docker-start.sh` wrapper in the image
  path

### Requirement: Local compose uses compiled production commands

The local backend Docker Compose file SHALL run production commands from the
built image instead of development Nest commands.

#### Scenario: Local mcp-server service starts

- **WHEN** the local `mcp-server` compose service starts from the backend image
- **THEN** it MUST run `node dist/apps/mcp-server/main.js`
- **AND** the backend Docker build MUST compile `mcp-server`
- **AND** it MUST NOT use `pnpm run start:dev:mcp-server`

