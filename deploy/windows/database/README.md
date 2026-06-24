# Database bootstrap

The Windows appliance does not use TypeORM synchronize in production. Portable
MySQL installation is limited to the runtime, service, credentials, and local
data directory; it does not create business tables by default.

Use one of these paths:

1. Import a known-good dump from the existing Mist database.
2. Import a schema file generated from a known-good database.
3. In a later change, run database migrations from `database/migrations`.

Fresh portable MySQL install without creating business tables:

```powershell
..\install-all.ps1 -InstallPortableMySQL
```

If the `mist` database has no tables, install stops after MySQL is installed and
prints a migration/import prompt. This keeps package upgrades from silently
changing production schema.

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
