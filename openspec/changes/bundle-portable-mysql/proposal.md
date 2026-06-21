# Change: Bundle portable MySQL for Windows appliance

## Why

The Windows API appliance still requires an operator to install and initialize
MySQL manually before running `install-all.ps1`. That is workable for the first
deployment, but it keeps one of the highest-friction prerequisites outside the
artifact.

The appliance can provide a more complete Windows deployment by bundling an
official MySQL Windows ZIP runtime and installing it as a local service owned by
the appliance. This should remain explicit because MySQL is a stateful component
with data-loss and port-conflict risks.

Python and uv are intentionally out of scope for this change. The intended
target machine already has the TDX quant environment, and datasource Python
handling should remain aligned with `mist-datasource` for now.

## What changes

- Add an optional portable MySQL runtime to the Windows appliance artifact.
- Add installer support for `.\install-all.ps1 -InstallPortableMySQL`.
- Pin a specific MySQL 8.4 LTS Windows ZIP release for the first portable
  runtime.
- Register a dedicated `MistMySQL` Windows service from the bundled MySQL
  runtime.
- Default portable MySQL to `127.0.0.1:3307` to avoid clashing with an existing
  local MySQL service on `3306`.
- Initialize a package-local MySQL data directory on first install.
- Create a `mist` database and a least-privilege backend user.
- Configure `backend/.env` to use the portable MySQL instance when requested.
- Add backup and uninstall behavior that preserves MySQL data by default.
- Add MySQL version, checksum, and third-party notice metadata to the appliance
  manifest.
- Update health checks and documentation for both external and portable MySQL.

## Non-goals

- Bundling Python, uv, TDX, QMT, or any proprietary datasource SDK files.
- Replacing external MySQL support; operators may still point the backend at an
  existing MySQL instance.
- Automatically upgrading existing MySQL data directories across major MySQL
  versions.
- Deleting MySQL data during normal uninstall.
- Running MySQL on a LAN-facing address.

## Expected outcome

An operator can choose either path:

```powershell
# Use existing external MySQL, current behavior
.\install-all.ps1

# Install package-local portable MySQL
.\install-all.ps1 -InstallPortableMySQL
```

The portable path installs local services:

```text
MistMySQL    -> 127.0.0.1:3307
MistTDX      -> 127.0.0.1:9001
MistQMT      -> 127.0.0.1:9002, when configured
MistBackend  -> 0.0.0.0:8001
```

Uninstall removes services but keeps `mysql/data` unless the operator passes an
explicit destructive flag.

## Impacted areas

- GitHub Actions Windows appliance packaging.
- Windows installer, uninstaller, health check, and database scripts.
- Backend `.env` generation/update behavior.
- Appliance artifact structure and manifest.
- Operator documentation.
