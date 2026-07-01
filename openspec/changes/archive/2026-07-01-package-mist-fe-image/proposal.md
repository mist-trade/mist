## Why

The live K-line MVP needs a repeatable frontend runtime, but the frontend
repository does not yet publish a production Docker image. The desired runtime
split is now: `mist-fe` runs in the Windows Docker stack behind nginx, while the
Windows host keeps the TDX datasource as a WinSW service.

Without this, frontend deployment remains manual and browser requests either hit
different origins or depend on an untracked Windows-local nginx edit.

## What Changes

- Add a production Docker image contract for `mist-fe`.
- Add a GitHub Actions workflow in `mist-fe` that builds and publishes
  `ghcr.io/mist-trade/mist-fe` with commit-SHA tags and `latest` on `master`.
- Allow manual frontend image workflow runs to override the Docker base image
  and npm registry for mirror-based builds.
- Update the Windows Docker stack to run `mist-fe` behind nginx alongside
  backend, Chan, and MySQL.
- Add tests for frontend packaging config and Windows gateway/deploy wiring.

## Capabilities

### New Capabilities

- `frontend-image-deployment`: Defines how the Mist frontend is packaged,
  published, deployed in the Windows Docker stack, and reached through the nginx
  web gateway.

### Modified Capabilities

- `windows-docker-appliance`: The production Docker deployment SHALL run the
  backend services, `mist-fe`, and nginx gateway on the Windows API machine.

## Impact

- Affected repositories: `mist-fe`, `mist-deploy`, and OpenSpec artifacts in
  `mist`.
- Affected CI/CD: new frontend image publishing workflow with optional manual
  build mirror inputs; Windows deploy gains frontend image tag inputs.
- Affected runtime: Windows Docker `.env` owns `MIST_FE_IMAGE` and
  `MIST_FE_IMAGE_TAG`.
- Non-goals: no datasource packaging changes, no nginx runtime hot-reload
  endpoint, no production secrets committed to git.
