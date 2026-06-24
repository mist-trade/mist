# Database bootstrap

The Windows appliance does not use TypeORM synchronize in production. Portable
MySQL installation is limited to the runtime, service, credentials, and local
data directory; business tables are created only by explicit migrations or
operator-provided imports.

Use one of these paths:

1. Run the bundled idempotent migrations from `database/migrations`.
2. Import a known-good dump from an existing Mist database.
3. Import a schema file generated from a known-good database.

Fresh portable MySQL install with bundled migrations:

```powershell
..\install-all.ps1 -InstallPortableMySQL -RunDatabaseMigrations
```

Migrations are tracked in `schema_migrations` and skipped when they have already
been applied. They do not overwrite `mysql\data`.

Run migrations manually:

```powershell
.\run-migrations.ps1 -HostName 127.0.0.1 -Port 3307 -Database mist -User mist_app -Password "<password from backend\.env>"
```

Example dump import:

```powershell
.\import-backup.ps1 -DumpFile D:\backups\mist.sql -Database mist -User root
```

Portable MySQL can also import a dump during appliance install:

```powershell
..\install-all.ps1 -InstallPortableMySQL -MysqlDumpFile D:\backups\mist.sql
```

Or import an explicit schema:

```powershell
..\install-all.ps1 -InstallPortableMySQL -MysqlSchemaFile D:\backups\schema.sql
```

Portable backup and restore:

```powershell
..\mysql\scripts\backup-mysql.ps1
..\mysql\scripts\restore-mysql.ps1 -DumpFile D:\backups\mist.sql -Force
```

Restore refuses to overwrite a non-empty `mist` database unless `-Force` is
passed.

After a manual import, rerun:

```powershell
..\install-all.ps1
```
