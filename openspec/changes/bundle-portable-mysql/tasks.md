# Tasks: Bundle portable MySQL

> Superseded service-management note (2026-06-27): `MistMySQL` remains current,
> but datasource/backend service references to `MistTDX`/`MistQMT` are
> historical. Current deployment uses WinSW for `MistBackend` and
> `mist-tdx-datasource`; QMT service installation is skipped.

## 1. Confirm portable MySQL contract

- [x] 1.1 Choose the pinned MySQL Windows ZIP version.
- [x] 1.2 Confirm redistribution/licensing requirements for the release shape.
- [x] 1.3 Choose the default portable service name `MistMySQL`.
- [x] 1.4 Choose the default portable port `3307`.
- [x] 1.5 Confirm Python and uv remain out of scope for this change.
- [x] 1.6 Confirm the first supported portable runtime line is MySQL 8.4 LTS.

## 2. Update appliance packaging

- [x] 2.1 Add workflow variables for MySQL version, ZIP URL, and SHA256.
- [x] 2.2 Download the MySQL Windows ZIP during `windows-appliance.yml`.
- [x] 2.3 Verify the downloaded ZIP SHA256 before extraction.
- [x] 2.4 Extract MySQL under `mysql/runtime/mysql-<version>`.
- [x] 2.5 Include MySQL runtime metadata in `manifest.json`.
- [x] 2.6 Ensure the repo does not commit MySQL binaries.
- [x] 2.7 Include MySQL license and third-party notices in the artifact.

## 3. Add portable MySQL scripts

- [x] 3.1 Add `deploy/windows/mysql/install-portable-mysql.ps1`.
- [x] 3.2 Generate `mysql/my.ini` with package-local paths.
- [x] 3.3 Initialize `mysql/data` only when it is not already initialized.
- [x] 3.4 Register or update the `MistMySQL` Windows service.
- [x] 3.5 Create or update the `mist` database.
- [x] 3.6 Create or update the `mist_app` database user.
- [x] 3.7 Import `-MysqlDumpFile` or `-MysqlSchemaFile` when the database is
      empty.
- [x] 3.8 Refuse to continue when the database is empty and no bootstrap input
      exists.
- [x] 3.9 Generate local root and app credentials on first install.
- [x] 3.10 Protect `mysql/credentials.env` with restrictive Windows ACLs.
- [x] 3.11 Write `mysql/state.json` after successful install.
- [x] 3.12 Refuse to manage `MistMySQL` when service ownership checks fail.
- [x] 3.13 Refuse existing data directories from unsupported MySQL major lines.

## 4. Integrate with appliance installer

- [x] 4.1 Add `-InstallPortableMySQL` to `install-all.ps1`.
- [x] 4.2 Add `-MysqlPort`, defaulting to `3307`.
- [x] 4.3 Add `-MysqlDumpFile` and `-MysqlSchemaFile`.
- [x] 4.4 Call portable MySQL install before backend service installation.
- [x] 4.5 Update `backend/.env` only when portable MySQL is requested.
- [x] 4.6 Preserve existing external MySQL configuration when portable MySQL is
      not requested.

## 5. Add backup and uninstall behavior

- [x] 5.1 Add `deploy/windows/mysql/backup-mysql.ps1`.
- [x] 5.2 Add `deploy/windows/mysql/uninstall-portable-mysql.ps1`.
- [x] 5.3 Update `uninstall-all.ps1` to remove `MistMySQL` service when present.
- [x] 5.4 Preserve `mysql/data` by default.
- [x] 5.5 Add explicit `-RemovePortableMySQLData` for destructive cleanup.
- [x] 5.6 Add `deploy/windows/mysql/restore-mysql.ps1` for explicit dump
      restores.
- [x] 5.7 Require a separate force flag before restoring over a non-empty
      database.

## 6. Update health checks and docs

- [x] 6.1 Add portable MySQL service and TCP checks to `health-check.ps1`.
- [x] 6.2 Add a database table-count check using bundled `mysql.exe`.
- [x] 6.3 Update `README-Windows.md` with external and portable MySQL paths.
- [x] 6.4 Update `database/README.md` with dump/schema import examples.
- [x] 6.5 Document that portable MySQL binds only to `127.0.0.1`.

## 7. Verification

- [x] 7.1 Validate OpenSpec with `openspec validate bundle-portable-mysql --strict`.
- [x] 7.2 Run PowerShell syntax checks on changed scripts.
- [ ] 7.3 Build the Windows appliance artifact.
- [ ] 7.4 Install with external MySQL to confirm current behavior still works.
- [ ] 7.5 Install with `-InstallPortableMySQL` on a clean Windows machine.
- [ ] 7.6 Verify `MistMySQL`, `MistTDX`, and `MistBackend` health checks.
- [ ] 7.7 Verify Mac can reach `http://<windows-ip>:8001/app/hello`.
- [ ] 7.8 Run `mist-skills` data, indicator, and Chan Theory smoke tests.
- [ ] 7.9 Rerun portable install to verify idempotency.
- [ ] 7.10 Verify uninstall preserves `mysql/data` by default.
- [ ] 7.11 Verify service ownership conflict fails safely.
