# Design: Portable MySQL for Windows appliance

## Decision

Bundle an official MySQL Windows ZIP runtime into the appliance artifact and
install it only when the operator explicitly requests the portable path.

The default install flow keeps supporting an external MySQL instance. The
portable path is additive:

```powershell
.\install-all.ps1 -InstallPortableMySQL
```

Python and uv remain outside this change. The target machine is expected to have
the TDX quant environment, and datasource dependency handling stays with
`mist-datasource`.

## Artifact shape

The appliance artifact should add a `mysql/` subtree:

```text
mist-api-appliance/
    mysql/
        runtime/
            mysql-<version>/
                bin/
                    mysqld.exe
                    mysql.exe
                    mysqldump.exe
        data/
        logs/
        my.ini
        credentials.env
        scripts/
            install-portable-mysql.ps1
            backup-mysql.ps1
            restore-mysql.ps1
            uninstall-portable-mysql.ps1
```

`runtime/` contains the bundled MySQL ZIP extraction. `data/` contains state and
must be treated as persistent operator data. `logs/` contains MySQL logs.
`credentials.env` is generated locally during install and must not be committed.

## MySQL runtime acquisition

Do not commit the MySQL binary ZIP into the repository. The Windows appliance
workflow should download the official Windows ZIP archive during packaging,
verify a pinned checksum, extract it under `mysql/runtime/`, and record the
version and checksum in `manifest.json`.

Use the MySQL 8.4 LTS line for the initial appliance instead of the newest 9.x
line. The appliance favors a conservative long-term support database runtime
over newest-server features. The exact patch version must be pinned in the
workflow at implementation time.

Configuration should be explicit in the workflow:

```text
MYSQL_VERSION=8.4.<pinned patch>
MYSQL_ZIP_URL=<official archive URL>
MYSQL_ZIP_SHA256=<pinned checksum>
```

This keeps repository size sane while still producing a self-contained release
artifact.

The artifact should also include MySQL license and third-party notice material
under `third-party-notices/mysql/`. If redistribution terms are not acceptable
for the intended release channel, the implementation must stop at a documented
"download at install time" alternative rather than silently shipping the ZIP.

## Port and binding

Portable MySQL defaults to:

```text
host = 127.0.0.1
port = 3307
service = MistMySQL
database = mist
app user = mist_app
```

Use `3307` instead of `3306` to avoid collisions with a preinstalled MySQL. The
service must bind to `127.0.0.1` only. Nothing outside the Windows API machine
needs direct database access.

## Installation flow

`install-all.ps1 -InstallPortableMySQL` should:

1. Resolve the appliance root.
2. Verify bundled MySQL runtime files exist.
3. Refuse to proceed if `MistMySQL` exists but points outside the appliance.
4. Refuse to proceed if the configured portable port is already occupied by an
   unrelated process.
5. Generate `mysql/my.ini` with package-local `basedir`, `datadir`, `log-error`,
   `port`, and `bind-address`.
6. Initialize `mysql/data` only when it has not been initialized before.
7. Register `MistMySQL` as a Windows service.
8. Start `MistMySQL`.
9. Create or update the `mist` database.
10. Create or update a least-privilege `mist_app` user.
11. Import an operator-provided dump or bundled schema when the database is
    empty.
12. Update `backend/.env` to use `127.0.0.1:3307` and `mist_app`.
13. Write portable MySQL state metadata after a successful install.

Use `mysqld --initialize-insecure` only for a fresh package-local data
directory, then immediately set local credentials and create the app user. This
keeps the install script deterministic and avoids scraping a generated temporary
root password from logs.

## Credentials and local state

The installer should generate cryptographically random credentials during first
install:

```text
mysql/credentials.env
    MYSQL_ROOT_PASSWORD=<generated>
    MYSQL_APP_USER=mist_app
    MYSQL_APP_PASSWORD=<generated>
```

`credentials.env` is local machine state. It must be excluded from source
control and release artifacts, created only on the target Windows machine, and
protected with restrictive ACLs for Administrators and SYSTEM. The backend
receives only the application user's password in `backend/.env`.

State metadata should live outside the data directory so it can be read before
`mysqld` starts:

```text
mysql/state.json
    serviceName
    port
    bindAddress
    runtimeVersion
    runtimeSha256
    runtimePath
    dataDir
    initializedAt
```

This gives the scripts a stable ownership and upgrade reference without parsing
Windows service command lines as the only source of truth.

## Service ownership

`MistMySQL` is owned by the current appliance only when all of these are true:

- The Windows service exists.
- The service executable path points under this appliance's `mysql/runtime`.
- The service defaults file or command arguments point at this appliance's
  `mysql/my.ini`.
- `mysql/state.json` records the same service name and data directory.

If any check fails, installation must stop with a service ownership error. The
installer should never reuse or modify a service that merely happens to share
the `MistMySQL` name.

## Database bootstrap

The portable path still must not silently run the backend against an empty
production database.

Supported bootstrap inputs:

```text
.\install-all.ps1 -InstallPortableMySQL -MysqlDumpFile D:\backups\mist.sql
.\install-all.ps1 -InstallPortableMySQL -MysqlSchemaFile .\database\schema.sql
```

The dump path is the normal migration path from the current external MySQL
machine. The schema path is only acceptable when a real schema file exists in
the appliance. If neither a dump nor a schema is available and the `mist`
database has no tables, installation should stop with a clear message.

The installer should not auto-discover random `.sql` files. Database bootstrap
must come from an explicit parameter or a documented bundled schema path.

## Backend environment update

When portable MySQL is installed, the installer should update or create
`backend/.env` with:

```text
mysql_server_host=127.0.0.1
mysql_server_port=3307
mysql_server_username=mist_app
mysql_server_password=<generated password>
mysql_server_database=mist
```

If `backend/.env` already points to an external host or port and
`-InstallPortableMySQL` is not passed, the installer must leave it unchanged.

## Idempotency

The portable install must be safely rerunnable:

- Existing initialized `mysql/data` is reused.
- Existing `MistMySQL` service is updated only when it points to this appliance.
- Existing non-empty `mist` database is not overwritten.
- Existing `backend/.env` portable values may be refreshed only for the
  portable path.
- Existing external MySQL configuration is not rewritten unless the operator
  explicitly requests portable MySQL.

## Runtime and data version guard

Portable MySQL may be upgraded later by replacing the bundled runtime in a new
artifact. That is safe only when the existing data directory is compatible.

The installer should record the initialized runtime major/minor line in
`mysql/state.json` and compare it before starting an existing data directory. If
the data directory was initialized by a different major line, installation must
stop and ask the operator to take a dump backup and perform an explicit upgrade
procedure. The first implementation should support same-line 8.4.x patch
updates only.

Do not automate downgrade or cross-major upgrade behavior.

## Backup and uninstall

Add `backup-mysql.ps1` to create timestamped dumps through the bundled
`mysqldump.exe`.

Add `restore-mysql.ps1` for explicit restores into an existing portable MySQL
service. Restore should require a dump path and should refuse to overwrite a
non-empty `mist` database unless the operator passes a separate force flag.

`uninstall-all.ps1` should stop and remove `MistMySQL` when it belongs to the
appliance, but preserve `mysql/data` by default.

Data deletion must require an explicit flag:

```powershell
.\uninstall-all.ps1 -RemovePortableMySQLData
```

This flag should print a direct warning before deletion.

## Health checks

`health-check.ps1` should include MySQL checks when portable MySQL is enabled or
when `backend/.env` points to the local portable port:

```text
MistMySQL service status
TCP 127.0.0.1:3307
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='mist'
```

The existing HTTP checks remain unchanged.

## Manifest

`manifest.json` should record:

```text
mysqlBundled = true
mysqlVersion
mysqlSha256
mysqlDefaultPort = 3307
mysqlServiceName = MistMySQL
portableMysqlDataPreservedOnUninstall = true
mysqlLicenseNoticePath
```

`mysql/state.json` remains target-machine state and should not be baked into the
release manifest.

## Release shape

```text
GitHub Actions
    download official mysql-8.4.x-winx64.zip
    verify pinned SHA256
    extract server runtime into artifact
    add license notices
    write manifest
        |
        v
Windows target
    install-all.ps1 -InstallPortableMySQL
        |
        +--> mysql/runtime/mysql-8.4.x/
        +--> mysql/data/
        +--> MistMySQL service
        +--> backend/.env uses mist_app
```

## Risks

- MySQL redistribution and licensing must be checked before public release.
- MySQL data directory upgrades across major versions are intentionally not
  automated.
- Antivirus or Windows policy can block service registration or `mysqld.exe`.
- Silent data deletion is the highest operational risk; default uninstall must
  preserve data.
