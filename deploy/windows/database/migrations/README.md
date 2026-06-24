# Database migrations

Migration files in this directory are executed by:

```powershell
.\run-migrations.ps1
```

The runner sorts `*.sql` files by name, creates `schema_migrations`, skips files
already recorded there, and records each migration only after the SQL file
finishes successfully.

Normal fresh portable MySQL install:

```powershell
..\install-all.ps1 -InstallPortableMySQL -RunDatabaseMigrations
```
