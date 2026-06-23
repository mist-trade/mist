# Database bootstrap

The Windows appliance does not use TypeORM synchronize in production. Portable
MySQL bootstraps a fresh database from this directory's `schema.sql` when no
dump or external schema is provided.

Use one of these paths:

1. Import a known-good dump from the existing Mist database.
2. Import a schema file generated from a known-good database.
3. For a brand-new deployment, let portable MySQL import the bundled
   `database/schema.sql`.

Fresh portable MySQL install with empty tables:

```powershell
..\install-all.ps1 -InstallPortableMySQL
```

Example dump import:

```powershell
.\import-backup.ps1 -DumpFile D:\backups\mist.sql -Database mist -User root
```

Portable MySQL can also import a dump during appliance install:

```powershell
..\install-all.ps1 -InstallPortableMySQL -MysqlDumpFile D:\backups\mist.sql
```

Or import an explicit schema instead of the bundled one:

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
