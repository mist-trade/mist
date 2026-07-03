## Why

The prior deploy/runtime P2 batch closed the required M6.1, S6, L14, and T9
scope, but two optional governance tails remain easy to misunderstand: deploy
defaults are still visible in several scripts, and PowerShell self-tests still
lean on source-string guards. This change finishes those optional tails without
changing the validated Windows production topology.

## What Changes

- Add a shared deploy defaults module for Windows paths, datasource URLs, ports,
  gateway hostnames, image defaults, monitoring defaults, and smoke defaults.
- Update deploy PowerShell and Mac watchdog scripts to read their default values
  from the shared defaults while preserving existing operator parameters and
  production defaults.
- Add Pester-compatible behavior tests for deploy defaults and keep existing
  string guards as additional contract checks.
- Record evidence that this is an optional M6.1/S6 governance tail and does not
  reopen L14 or T9.

## Capabilities

### New Capabilities

- `review-p2-deploy-governance-tail`: Covers the optional M6.1/S6 governance
  tail for centralized deploy defaults and Pester-compatible behavior tests.

### Modified Capabilities

- None.

## Impact

- `mist-deploy/scripts/common/*`
- `mist-deploy/scripts/*.ps1`
- `mist-deploy/scripts/deploy-mac-watchdog.sh`
- `mist-deploy/scripts/test-*.ps1`
- `mist-deploy/README.md`
- `mist/REVIEW_ITEM_INVENTORY.md` evidence notes only
