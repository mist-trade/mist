## Why

The remaining review P2 tail is concentrated around deploy-time defaults and
live-test confidence: paths, IPs, domains, and gateway image policy are still
partly scattered, while datasource live coverage is visible but not replayable
in normal CI. Closing this batch reduces production drift without requiring a
state-changing Windows smoke run.

## What Changes

- Select and close `INFRA_REVIEW M6.1`, `INFRA_REVIEW S6`,
  `CODE_REVIEW L14`, and `INFRA_REVIEW T9`.
- Continue centralizing `mist-deploy` runtime paths, hostnames, URLs, and image
  defaults behind workflow env handoff, script parameters, or `.env` values.
- Upgrade selected `mist-deploy` tests from source-string guards toward
  behavior-oriented PowerShell checks for rendered env/compose/runtime config.
- Pin the default nginx gateway image by digest while preserving an explicit
  override path for private mirrors or runner-specific mirrors.
- Add a non-live datasource regression path that replays a representative live
  TDX payload or transcript in CI, while keeping true `pytest -m live` checks
  opt-in/manual.
- Keep existing Windows production ports, service names, Docker/host runtime
  boundaries, and live quote smoke workflow behavior compatible.

## Capabilities

### New Capabilities

- `review-p2-deploy-runtime-config-live-regression`: Tracks the selected P2
  deploy/runtime-config and datasource live-regression remediation batch.

### Modified Capabilities

- None.

## Impact

- Affected repositories: `mist`, `mist-deploy`, and `mist-datasource`.
- Affected areas: `mist-deploy` workflows, PowerShell scripts/tests,
  Docker compose env defaults, README/runtime docs, datasource CI/live-test
  tests and fixtures, and OpenSpec evidence.
- No production route rename, database schema change, Windows service rename,
  or mandatory live smoke execution is intended.
