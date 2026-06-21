# Database bootstrap

The first Windows appliance release does not silently create production tables.
Initialize MySQL before installing services.

Use one of these paths:

1. Import a known-good dump from the existing Mist database.
2. Import a schema file generated from a known-good database.
3. Add TypeORM migrations in a later change and run them before service start.

Example dump import:

```powershell
.\import-backup.ps1 -DumpFile D:\backups\mist.sql -Database mist -User root
```

Portable MySQL can import the dump during appliance install:

```powershell
..\install-all.ps1 -InstallPortableMySQL -MysqlDumpFile D:\backups\mist.sql
```

Portable backup and restore:

```powershell
..\mysql\scripts\backup-mysql.ps1
..\mysql\scripts\restore-mysql.ps1 -DumpFile D:\backups\mist.sql -Force
```

Restore refuses to overwrite a non-empty `mist` database unless `-Force` is
passed.

After import, rerun:

```powershell
..\install-all.ps1
```
