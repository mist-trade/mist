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

After import, rerun:

```powershell
..\install-all.ps1
```
