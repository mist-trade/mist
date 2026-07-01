## Why

Mist has a working hybrid production path, but the current state is distributed
across repository commits, Docker image tags, GitHub Actions runs, Windows
host services, datasource smoke output, and Mac-side probes. Before expanding
features or changing realtime behavior, the project needs a durable known-good
baseline that proves the full stack works end to end.

## What Changes

- Define a production baseline evidence ledger for the current Docker stack plus
  host TDX datasource topology.
- Require pinned refs for backend, frontend, datasource, deployment scripts,
  and monitoring when monitoring is included.
- Require evidence from `Deploy Windows Mist Stack`, hybrid health checks,
  datasource runtime smoke, MySQL backup restore rehearsal, and Mac-side
  gateway probes.
- Require datasource evidence that distinguishes normal datasource management
  from explicit TDX terminal recovery.
- Require a final baseline summary that can be used by later child specs as
  their starting point.
- Do not modify application code, deployment scripts, datasource behavior,
  frontend behavior, monitoring behavior, or AstrBot skills in this change.

## Capabilities

### New Capabilities

- `mist-production-baseline`: Evidence requirements and acceptance criteria for
  a known-good Mist production deployment baseline across Docker, WinSW
  datasource, gateway, backup, smoke, and Mac-side probes.

### Modified Capabilities

None. Existing runtime behavior remains governed by the existing deployment,
datasource, frontend, monitoring, and AstrBot specs.

## Impact

- Affected repositories for evidence collection:
  - `mist`
  - `mist-fe`
  - `mist-datasource`
  - `mist-deploy`
  - optionally `mist-monitoring`
- Affected runtime surfaces:
  - Windows Docker Desktop stack under `E:\quant\MistDocker`
  - host WinSW service `mist-tdx-datasource` under
    `F:\quant\MistAPI\datasource`
  - nginx gateway `www.moyui.mist`
  - MySQL backup and restore rehearsal path
  - datasource runtime smoke scripts
  - Mac-side LAN probes
- This change is verification-only. It records required evidence and commands;
  it does not run production workflows by itself.
