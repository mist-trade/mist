## Context

The live K-line page should be served through one browser origin to avoid CORS
and to keep backend ports private. The latest deployment decision keeps nginx
and `mist-fe` together in the Windows Docker stack. The Windows gateway proxies
frontend requests to the local `mist-fe` service and API requests to local
Docker services.

## Goals / Non-Goals

**Goals:**

- Package `mist-fe` as a production Docker image.
- Publish `ghcr.io/mist-trade/mist-fe` with immutable commit-SHA tags and
  `latest` on `master`.
- Allow manual image workflow runs to override the Node base image and npm
  registry when Docker Hub or npmjs is slow.
- Run the frontend container in the Windows Docker stack.
- Let Windows nginx proxy `/` to `mist-fe:3000`.
- Keep nginx configuration source-controlled in `mist-deploy/docker/nginx` and
  deployed by the Docker stack script.
- Preserve the host-side TDX datasource boundary.

**Non-Goals:**

- No datasource containerization.
- No backend image publishing changes.
- No dynamic nginx configuration service or runtime hot reload endpoint.
- No direct browser route to the datasource service.
  selection.

## Decisions

### Build `mist-fe` as a standalone Next.js image

`mist-fe` will enable Next.js standalone output and use a multi-stage Dockerfile
based on Node 22.13 or newer. This keeps the runtime image focused on the built
server and static assets without copying development dependencies into the final
layer.

Alternative considered: run `pnpm start` with a full `node_modules` install in
the image. That is simpler, but it produces a larger runtime image and makes the
container less clearly production-only.

### Publish frontend images from the frontend repository

The frontend repository will own its Dockerfile and GHCR workflow. The deployed
image name defaults to `ghcr.io/mist-trade/mist-fe`, and the Windows deploy
workflow selects the image tag through `frontend_image_tag`.

Alternative considered: build the frontend image from `mist-deploy`. That would
couple deployment automation to frontend source checkout details and would make
the deploy repo responsible for application build concerns.

Manual workflow runs can override `NODE_IMAGE` and `NPM_REGISTRY` so operators
can use mirror sources when Docker Hub or npmjs is slow. Push-triggered builds
use the official defaults.

### Run frontend in the Windows Docker stack

The production Compose file runs `mist-fe` with the same-origin browser API
paths `/api/mist` and `/api/chan`. The nginx `web-gateway` depends on `mist-fe`
health and proxies `/` to `http://mist-fe:3000`.

Alternative considered: run `mist-fe` on the Mac beside AstrBot. That keeps
frontend close to AstrBot, but introduces an unnecessary LAN dependency for the
main browser entrypoint.

### Keep nginx on the Windows API machine

The nginx gateway remains in the Windows Docker stack. Its tracked config is
`mist-deploy/docker/nginx/nginx.conf`; Compose mounts it into nginx as the
default server config.

Alternative considered: run nginx on the Mac beside AstrBot. That would make the
browser entrypoint depend on the Mac machine and would require proxying API
traffic back to Windows. Keeping nginx on Windows keeps the full browser
gateway with the backend services.

## Risks / Trade-offs

- Windows gateway health now depends on the `mist-fe` container health, so
  frontend image publishing must happen before deploying a new frontend tag.
- The frontend image tag and backend image tag are built from different
  repositories; docs and workflow inputs must keep that split explicit.
- Next.js standalone output may miss static assets if Dockerfile copy paths are
  wrong; build and packaging checks cover `.next/standalone` and static assets.
- GHCR permissions can block image publishing; workflow uses `packages: write`
  with `GITHUB_TOKEN`, following the backend image publishing pattern.

## Migration Plan

1. Add the frontend Dockerfile, `.dockerignore`, standalone Next output, and
   image workflow.
2. Add manual image workflow inputs for `NODE_IMAGE` and `NPM_REGISTRY`.
3. Update Windows compose/nginx to run `mist-fe` and proxy `/` to
   `mist-fe:3000`.
4. Update Windows deployment script/workflow inputs for frontend image tags.
5. Update deployment tests and docs.
6. Publish the frontend image from `mist-fe`.
7. Deploy the Windows stack with backend and frontend tags, then verify the live
   K-line page through the Windows nginx origin.
