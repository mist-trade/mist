## 1. Frontend Image Packaging

- [x] 1.1 Enable production standalone output in `mist-fe` Next config.
- [x] 1.2 Add a multi-stage Dockerfile for the frontend image.
- [x] 1.3 Add a `.dockerignore` for reproducible frontend image context.
- [x] 1.4 Add a GitHub Actions workflow that builds and pushes `ghcr.io/mist-trade/mist-fe` with commit SHA and `latest` tags.
- [x] 1.5 Add manual frontend image workflow inputs for Docker and npm mirrors.
- [x] 1.6 Add frontend packaging tests or config assertions.
- [x] 1.7 Document frontend image publishing and local container smoke commands.

## 2. Windows Frontend And Gateway Deployment

- [x] 2.1 Add the Windows `mist-fe` service to default production compose.
- [x] 2.2 Change Windows nginx to a tracked config that proxies `/` to `mist-fe:3000`.
- [x] 2.3 Add frontend image repository/tag wiring to the Windows deploy workflow/script.
- [x] 2.4 Add frontend rollback handling with `previous_frontend_image_tag`.
- [x] 2.5 Update deploy, compose, health-check, and workflow tests.
- [x] 2.6 Update deployment docs with the Windows frontend and nginx split.

## 3. Verification

- [x] 3.1 Run frontend unit tests, lint, and production build.
- [x] 3.2 Run frontend Docker build or an equivalent packaging check.
  - `docker build` passes with `NODE_IMAGE=docker.m.daocloud.io/library/node:22.13-alpine`
    and `NPM_REGISTRY=https://registry.npmmirror.com`.
- [x] 3.3 Run relevant `mist-deploy` PowerShell tests with `pwsh-preview`.
- [x] 3.4 Run OpenSpec strict validation for `package-mist-fe-image`.
