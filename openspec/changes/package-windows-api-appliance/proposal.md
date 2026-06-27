# Change: Package Windows API appliance

> Superseded service-management note (2026-06-27): NSSM/`MistTDX`/`MistQMT`
> references in this historical change are superseded for the current appliance
> by `refactor-tdx-python-datasource`. Current deployment uses WinSW for
> `MistBackend` and `mist-tdx-datasource`; QMT service installation is skipped.

## Why

The deployment target has changed. The Windows machine with market-data
authorization should become the complete Mist API machine. It should host
MySQL, the datasource bridge, and the Mist backend. The Mac or LLM machine
should stay lightweight and call the Windows machine over the LAN through
`mist-skills`.

The current repositories and GitHub Actions are not aligned with this shape.
`mist` has Docker and executable workflows, while `mist-datasource` has the
Windows legacy service wrapper deployment script but no release workflow. The first production
path should be a Windows deployment zip, not a single exe.

## What changes

- Create a Windows API appliance deployment package.
- Use `mist` as the release owner for the first version.
- Have GitHub Actions build a Windows zip artifact instead of relying on `pkg`
  executable output.
- Include the Mist backend runtime, `mist-datasource` source, service install
  scripts, environment templates, database initialization assets, and health
  checks.
- Keep Redis optional and out of the first required deployment path.
- Move MySQL to the Windows API machine.
- Reference existing TDX/QMT SDK installations by absolute paths.
- Do not copy or bundle proprietary TDX/QMT SDK files or DLLs into the release
  package.

## Non-goals

- Producing a single-file exe in the first version.
- Bundling `TPythClient.dll`, `tqcenter.py`, `xtquant`, miniQMT, or TDX client
  binaries.
- Migrating all repositories into a monorepo.
- Rebuilding `mist-datasource` as a Docker image for this Windows deployment.
- Making Redis mandatory.
- Deploying Saya.
- Implementing new trading or alerting behavior.

## Expected outcome

An operator downloads `mist-api-appliance-win-x64.zip`, extracts it on the
Windows API machine, edits `.env` files, runs an administrator PowerShell
installer, and gets these local services:

```text
MistTDX      -> 127.0.0.1:9001
MistQMT      -> 127.0.0.1:9002, when configured
MistBackend  -> 0.0.0.0:8001
MySQL        -> local Windows service
```

The Mac or LLM machine then calls:

```text
MIST_API_BASE_URL=http://192.168.31.x:8001
```

## Impacted areas

- GitHub Actions in `mist`.
- Deployment scripts for the Windows package.
- `mist-datasource` dependency locking and SDK preflight checks.
- Mist backend service installation.
- Database schema initialization or import flow.
- Operator documentation.

## Open questions

- Should the first package assume Python 3.12 and uv are already installed, or
  should a later package include a portable Python runtime?
- Should QMT be enabled in the first installer or treated as optional until the
  TDX path is stable?
- Should MySQL installation be documented as a prerequisite or automated through
  a separate prerequisite script?
