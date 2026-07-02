## Context

The active Mist production path is a hybrid Windows Docker deployment: Docker
Compose runs MySQL, `mist-backend`, `chan-api`, `mist-fe`, and nginx, while the
TDX datasource remains a host-side WinSW service. The backend repository also
keeps a local `docker-compose.yml` that can run the backend image and
`mcp-server` from the same container image.

The review set selected for this child change spans two repositories. In
`mist`, the backend Dockerfile still runs as root, uses hard-coded npm mirror
configuration, installs production dependencies a second time, keeps an unused
`docker-start.sh`, and the local compose file starts `mcp-server` through a dev
command. In `mist-deploy`, production dispatch defaults still allow mutable app
tags, rollback depends on manually supplied previous tags, and the nginx mirror
image policy needs to be explicit.

## Goals / Non-Goals

**Goals:**

- Harden the backend image without changing API behavior.
- Keep the Docker build compatible with the existing Node 24 / pnpm 11.7.0
  toolchain.
- Make local compose use compiled production entrypoints.
- Preserve the current Windows production boundary: Docker owns app services and
  MySQL, WinSW owns `mist-tdx-datasource`.
- Make deployment app tags explicit and persist successful backend/frontend
  tags for fallback rollback.
- Keep the Windows runner nginx mirror default while documenting and testing the
  image-source boundary.
- Add targeted tests or script self-tests before implementation.

**Non-Goals:**

- Build or deploy a datasource container.
- Replace PowerShell deployment scripts with a new deploy tool.
- Pin MySQL or nginx by digest in this batch; nginx mirror choice is documented
  and configurable because the Windows runner currently needs mirror support.
- Change frontend image build behavior beyond deployment tag handling.
- Add production `mcp-server` to the Windows stack; the Windows production
  compose intentionally excludes it today.

## Decisions

### Decision 1: Copy one dependency tree from the builder stage

The backend image should install dependencies once in the builder stage, build
compiled apps, and copy `node_modules`, `dist`, `tools/run-migrations.mjs`, and
`deploy/database` into the runtime image. This removes the production-stage
`pnpm install --prod` path and the partial `.pnpm` copy that can drift from the
installed dependency tree.

Alternative considered: keep `pnpm install --prod` in the runtime image and
only fix the cache path. That still leaves two dependency sources and does not
remove the reviewed drift risk.

### Decision 2: Keep registry choice configurable at build time

The Dockerfile should expose `ARG NPM_REGISTRY` with the official npm registry
as default. Operators and local builders can still pass a mirror when needed,
but CI and production images are not forced onto a China-only mirror.

Alternative considered: remove registry configuration entirely. A build arg is
more flexible for the user's current mixed network reality.

### Decision 3: Make `mcp-server` production command viable

Changing compose to `node dist/apps/mcp-server/main.js` requires the Docker
build to compile `mcp-server`. The small package-script change keeps this
explicit and avoids relying on runtime Nest compilation inside the container.

Alternative considered: leave local compose on the dev command. That keeps the
reviewed production/development mismatch.

### Decision 4: Record successful tags in the deploy root

The deploy script should write the last successful backend and frontend app tags
to a small state file under the Docker root after health checks and diagnostics
complete. On failure, rollback should prefer explicit previous tags supplied by
the operator, then fall back to the recorded successful tags. If no rollback tag
exists, rollback must not restart the app services with the failed tag.

Alternative considered: require `previous_*_image_tag` forever. That is precise
but fragile in practice because the deploy script already owns the deployment
root and can maintain this small state safely.

### Decision 5: Separate diagnostics failures from rollback

Diagnostics are useful evidence, but diagnostics failures should not hide the
original deploy error or prevent rollback. The catch path should run diagnostics
through a safe wrapper, then attempt rollback, then rethrow the original failure.

Alternative considered: keep diagnostics in the main catch body. That is the
current behavior and can mask the deploy failure.

## Risks / Trade-offs

- Copying the full builder `node_modules` can include dev dependencies -> This
  batch prioritizes dependency-source consistency; image-size tuning can follow
  after build verification.
- Non-root containers can hit bind-mount permissions on local hosts -> The image
  files are owned by the app user, and Windows production compose does not bind
  app source into `/app`.
- Static Docker tests can miss a real image build failure -> Run static unit
  tests plus `docker build` when Docker is available; if Docker is unavailable,
  record the substitute verification.
- Recorded rollback tags may be stale if an operator edits `.env` manually ->
  Explicit `previous_*_image_tag` inputs still take precedence, and success
  history is rewritten on every healthy deploy.
- Digest pinning is deferred -> The nginx image remains configurable and the
  mirror rationale is documented so future digest pinning can be done without
  removing the Windows runner mirror option.

## Migration Plan

1. Add failing static tests in `mist` for Dockerfile, `.dockerignore`,
   entrypoint, local compose, and `build:docker`.
2. Add failing PowerShell assertions in `mist-deploy` for explicit app tag
   inputs, deploy-history behavior, rollback fallback, and nginx image policy.
3. Implement the backend Dockerfile, entrypoint, compose, package script, and
   ignore-file changes.
4. Implement deploy script history/rollback/diagnostics changes and update
   workflow/docs/tests.
5. Run targeted tests in both repositories, then run repository-appropriate
   lint/typecheck/test or script self-tests.
6. Record `review-id -> changed files -> verification command` in
   `evidence.md` and update the parent remediation change.

## Open Questions

None for this child change.
