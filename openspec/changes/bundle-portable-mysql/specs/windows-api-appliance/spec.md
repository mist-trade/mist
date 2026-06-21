# Capability: Windows API appliance

## ADDED Requirements

### Requirement: The appliance shall optionally bundle a portable MySQL runtime

The Windows appliance SHALL support a self-contained portable MySQL path without
removing support for an externally installed MySQL instance.

#### Scenario: Operator chooses portable MySQL

- GIVEN the appliance artifact includes a verified MySQL Windows ZIP runtime
- WHEN the operator runs `install-all.ps1 -InstallPortableMySQL`
- THEN the installer SHALL install a package-local `MistMySQL` service
- AND the service SHALL use the bundled MySQL runtime
- AND the service SHALL store data under the appliance `mysql/data` directory

#### Scenario: Appliance packaging verifies MySQL runtime

- GIVEN the Windows appliance workflow downloads a MySQL Windows ZIP archive
- WHEN the artifact is assembled
- THEN the workflow SHALL verify the archive against a pinned checksum before
  extraction
- AND the artifact manifest SHALL record the MySQL version and checksum
- AND the artifact SHALL include MySQL license or notice material

#### Scenario: Operator uses external MySQL

- GIVEN `backend/.env` points at an existing MySQL instance
- WHEN the operator runs `install-all.ps1` without `-InstallPortableMySQL`
- THEN the installer SHALL NOT install `MistMySQL`
- AND it SHALL NOT rewrite the existing MySQL host, port, user, or password

### Requirement: Portable MySQL shall avoid external exposure and port conflicts

Portable MySQL SHALL bind only to localhost and SHALL use a default port that
does not collide with a common external MySQL installation.

#### Scenario: Portable MySQL starts

- GIVEN portable MySQL is installed with default settings
- WHEN `MistMySQL` starts
- THEN it SHALL listen on `127.0.0.1:3307`
- AND it SHALL NOT listen on a LAN-facing address

#### Scenario: Portable MySQL port is occupied

- GIVEN an unrelated process is already listening on the configured portable
  MySQL port
- WHEN the operator runs `install-all.ps1 -InstallPortableMySQL`
- THEN installation SHALL stop before data initialization
- AND the error SHALL identify the occupied port

### Requirement: Portable MySQL initialization shall be idempotent

The portable MySQL installer SHALL be safe to rerun against an existing
appliance directory.

#### Scenario: Existing data directory is present

- GIVEN `mysql/data` has already been initialized
- WHEN the operator reruns `install-all.ps1 -InstallPortableMySQL`
- THEN the installer SHALL reuse the existing data directory
- AND it SHALL NOT reinitialize or delete existing tables

#### Scenario: Existing service points outside the appliance

- GIVEN a `MistMySQL` service already exists
- AND the service executable or defaults file points outside the current
  appliance directory
- WHEN the operator runs `install-all.ps1 -InstallPortableMySQL`
- THEN installation SHALL stop with a service ownership error

### Requirement: Portable MySQL shall configure backend database access

When portable MySQL is requested, the installer SHALL configure the backend to
use a local least-privilege database user.

#### Scenario: Backend env is configured for portable MySQL

- GIVEN portable MySQL installation succeeds
- WHEN the installer updates `backend/.env`
- THEN `mysql_server_host` SHALL be `127.0.0.1`
- AND `mysql_server_port` SHALL be the configured portable MySQL port
- AND `mysql_server_username` SHALL be an application user, not `root`
- AND `mysql_server_database` SHALL be `mist`

#### Scenario: Credentials are generated locally

- GIVEN portable MySQL is installed for the first time
- WHEN the installer creates database credentials
- THEN it SHALL generate root and application passwords on the target machine
- AND it SHALL store root credentials only in a local credentials file
- AND it SHALL restrict that credentials file to local administrative accounts

### Requirement: Portable MySQL shall require explicit database bootstrap

Portable MySQL SHALL NOT allow the production backend to start against an empty
database.

#### Scenario: Dump file is provided

- GIVEN portable MySQL has an empty `mist` database
- AND the operator provides `-MysqlDumpFile D:\backups\mist.sql`
- WHEN the installer runs
- THEN it SHALL import the dump before starting `MistBackend`

#### Scenario: No bootstrap input is available

- GIVEN portable MySQL has an empty `mist` database
- AND no dump or schema file is available
- WHEN the installer runs
- THEN installation SHALL stop before starting `MistBackend`
- AND it SHALL explain how to provide a dump or schema file

### Requirement: Portable MySQL uninstall shall preserve data by default

The appliance uninstaller SHALL avoid accidental database loss.

#### Scenario: Default uninstall

- GIVEN portable MySQL is installed
- WHEN the operator runs `uninstall-all.ps1`
- THEN the uninstaller SHALL stop and remove the `MistMySQL` service
- AND it SHALL preserve `mysql/data`

#### Scenario: Explicit destructive uninstall

- GIVEN portable MySQL is installed
- WHEN the operator runs `uninstall-all.ps1 -RemovePortableMySQLData`
- THEN the uninstaller SHALL remove `mysql/data`
- AND the destructive behavior SHALL require an explicit flag

### Requirement: Portable MySQL shall support explicit backup and restore

The appliance SHALL provide operator-controlled dump backup and restore scripts
for the portable MySQL database.

#### Scenario: Operator creates a portable MySQL backup

- GIVEN portable MySQL is installed and running
- WHEN the operator runs `backup-mysql.ps1`
- THEN the script SHALL create a timestamped SQL dump with bundled
  `mysqldump.exe`
- AND it SHALL report the backup file path

#### Scenario: Restore would overwrite existing data

- GIVEN the portable `mist` database already contains tables
- WHEN the operator runs `restore-mysql.ps1 -DumpFile D:\backups\mist.sql`
- THEN the script SHALL stop before importing the dump
- AND it SHALL require a separate explicit force flag to continue

### Requirement: Portable MySQL shall guard runtime and data compatibility

The appliance SHALL avoid automatic MySQL major-version upgrades or downgrades
for existing portable data directories.

#### Scenario: Existing data directory matches supported runtime line

- GIVEN portable MySQL data was initialized by a supported MySQL 8.4 runtime
- WHEN the operator installs an appliance with another supported 8.4 patch
  runtime
- THEN the installer SHALL allow the service to reuse the existing data
  directory

#### Scenario: Existing data directory uses unsupported runtime line

- GIVEN portable MySQL data was initialized by a different MySQL major runtime
  line
- WHEN the operator runs `install-all.ps1 -InstallPortableMySQL`
- THEN installation SHALL stop before starting `MistMySQL`
- AND it SHALL explain that a dump backup and explicit upgrade procedure are
  required

### Requirement: Portable MySQL health checks shall verify service and schema

The appliance health check SHALL report portable MySQL status when the backend
is configured to use it.

#### Scenario: Portable MySQL health check passes

- GIVEN `backend/.env` points to `127.0.0.1:3307`
- AND `MistMySQL` is running
- AND the `mist` database has tables
- WHEN the operator runs `health-check.ps1`
- THEN the health check SHALL verify the service
- AND it SHALL verify TCP access to the configured port
- AND it SHALL verify the `mist` database is initialized
