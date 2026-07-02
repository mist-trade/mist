## Why

The review found that release and CI gates are too weak to protect the first
remediation wave. The backend release workflow can create tags and publish
without a test gate or environment approval, several repositories have no CI at
all, and local environment files are still tracked.

## What Changes

- Select review IDs CODE_REVIEW C1 and INFRA I1, I2, I3, I5, I8, D9, and 共性1.
- Split backend lint into fix and check scripts, then make CI use the read-only
  check command.
- Align Node-based workflows and package metadata on Node 24.
- Add CI validation before Docker image publishing and release publishing.
- Require `production-release` environment approval for backend releases.
- Add minimal CI workflows for `mist-datasource`, `mist-monitoring`, and
  `mist-skills`.
- Stop tracking backend `.env.development` and `.env.production` while keeping
  examples available.
- Add a local CI contract verification script that proves the workflow and
  package invariants for this change.

## Impact

- Affected repositories:
  - `mist`
  - `mist-fe`
  - `mist-datasource`
  - `mist-monitoring`
  - `mist-skills`
- Affected operational surfaces:
  - GitHub Actions validation, release, and Docker publishing.
  - Node toolchain expectations.
  - Local env-file tracking policy.

